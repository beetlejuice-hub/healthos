import { describe, expect, it } from "vitest";
import { BandHub, PULL_EVERY_MS } from "./band";
import { handleBand } from "./index";
import type { Storage } from "./push";
import { readState } from "../src/lib/band";

function fakeStorage() {
  const m = new Map<string, unknown>();
  let alarm: number | null = null;
  const s: Storage & { alarm: () => number | null; m: Map<string, unknown> } = {
    m, alarm: () => alarm,
    async get<T>(k: string) { return m.get(k) as T | undefined; },
    async put(k, v) { m.set(k, structuredClone(v)); },
    async delete(k) { return m.delete(k); },
    async setAlarm(at) { alarm = at; },
    async deleteAlarm() { alarm = null; },
  };
  return s;
}

const T0 = Date.UTC(2026, 9, 7, 10, 0);
const env = { GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "csecret" };
const hrPoint = (t: number, bpm: number) => ({ name: `hr/${t}`, heartRate: { sampleTime: { physicalTime: new Date(t).toISOString() }, beatsPerMinute: bpm } });

/** Google, faked: the token endpoint, the Health API (paged), the revoke endpoint. Every call is logged. */
function google(opts: { hr?: unknown[]; pageSize?: number; expireAccessOnce?: boolean; refreshFails?: string; failType?: string } = {}) {
  const calls: { url: URL; body: URLSearchParams | null; auth: string | null }[] = [];
  let issued = 0, expired = !!opts.expireAccessOnce;
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const body = req.method === "POST" && url.hostname === "oauth2.googleapis.com" ? new URLSearchParams(await req.text()) : null;
    calls.push({ url, body, auth: req.headers.get("authorization") });
    if (url.href === "https://oauth2.googleapis.com/token") {
      if (body!.get("grant_type") === "authorization_code") {
        return body!.get("code") === "good-code" ? Response.json({ access_token: `at${++issued}`, refresh_token: "rt", expires_in: 3599 }) : Response.json({ error: "invalid_grant" }, { status: 400 });
      }
      if (opts.refreshFails) return Response.json({ error: opts.refreshFails }, { status: 400 });
      return Response.json({ access_token: `at${++issued}`, expires_in: 3599 });
    }
    if (url.pathname.startsWith("/oauth2") || url.pathname === "/revoke") return new Response(null, { status: 200 });
    if (url.hostname === "health.googleapis.com") {
      if (expired) { expired = false; return new Response("expired", { status: 401 }); }
      const type = url.pathname.split("/")[5];
      if (type === opts.failType) return new Response("boom", { status: 500 });
      if (type === "heart-rate") {
        // Like Google: only samples inside the filter's time range.
        const f = url.searchParams.get("filter") ?? "", from = f.match(/>= "([^"]+)"/)?.[1], to = f.match(/< "([^"]+)"/)?.[1];
        const tOf = (p: unknown) => Date.parse((p as { heartRate: { sampleTime: { physicalTime: string } } }).heartRate.sampleTime.physicalTime);
        const all = (opts.hr ?? []).filter((p) => (!from || tOf(p) >= Date.parse(from)) && (!to || tOf(p) < Date.parse(to)));
        const size = opts.pageSize ?? 1000, at = Number(url.searchParams.get("pageToken") || 0);
        return Response.json({ dataPoints: all.slice(at, at + size), ...(at + size < all.length ? { nextPageToken: String(at + size) } : {}) });
      }
      if (type === "sleep") return Response.json({ dataPoints: [{ name: "users/me/dataTypes/sleep/dataPoints/n1", sleep: { interval: { startTime: "2026-10-06T21:40:00Z", endTime: "2026-10-07T05:10:00Z" }, summary: { minutesAsleep: 412 } } }] });
      if (type === "daily-resting-heart-rate") return Response.json({ dataPoints: [{ dailyRestingHeartRate: { date: { year: 2026, month: 10, day: 7 }, beatsPerMinute: 54 } }] });
      if (type === "daily-heart-rate-variability") return Response.json({ dataPoints: [{ dailyHeartRateVariability: { date: { year: 2026, month: 10, day: 7 }, averageRmssdMilliseconds: 41 } }] });
    }
    throw new Error(`unexpected ${req.method} ${req.url}`);
  }) as typeof fetch;
  return { f, calls, health: () => calls.filter((c) => c.url.hostname === "health.googleapis.com") };
}

function setup(g = google()) {
  const st = fakeStorage();
  let now = T0;
  const h = new BandHub({ storage: st }, env, { fetch: g.f, now: () => now });
  return { h, st, g, at: (t: number) => { now = t; } };
}
const post = (path: string, body: unknown = {}) => new Request(`https://band/${path}`, { method: "POST", body: JSON.stringify(body) });
const connect = (h: BandHub, code = "good-code") => h.fetch(post("connect", { code, redirect: "https://app/api/google/callback" }));
const status = async (h: BandHub) => (await (await h.fetch(new Request("https://band/status"))).json()) as Record<string, unknown>;

describe("BandHub", () => {
  it("connect swaps Google's code for a refresh token, keeps it, and starts pulling", async () => {
    const { h, st, g } = setup();
    expect((await connect(h)).status).toBe(200);
    const tok = g.calls[0].body!;
    expect(Object.fromEntries(tok)).toMatchObject({ grant_type: "authorization_code", code: "good-code", client_id: "cid", client_secret: "csecret", redirect_uri: "https://app/api/google/callback" });
    expect(st.m.get("auth")).toMatchObject({ refresh: "rt", access: "at1" });
    expect(st.alarm()).toBe(T0 + 2000);
    expect(await status(h)).toMatchObject({ connected: true, needsReconnect: false, lastSync: null });
  });

  it("a bad code is refused and nothing is kept", async () => {
    const { h, st } = setup();
    const r = await connect(h, "nope");
    expect(r.status).toBe(400);
    expect(st.m.has("auth")).toBe(false);
    expect((await status(h)).connected).toBe(false);
  });

  it("the alarm pulls heart rate per minute, sleep, resting HR and HRV, then sets the next alarm", async () => {
    const t = T0 - 3600_000;
    const g = google({ hr: [hrPoint(t, 60), hrPoint(t + 20_000, 70), hrPoint(t + 60_000, 80)] });
    const { h, st } = setup(g);
    await connect(h);
    await h.alarm();
    expect(st.m.get("hr:2026-10-07")).toEqual([[t, 65, 60, 70], [t + 60_000, 80, 80, 80]]);
    expect((st.m.get("sleep") as { id: string }[]).map((s) => s.id)).toEqual(["n1"]);
    expect(st.m.get("rhr")).toEqual({ "2026-10-07": 54 });
    expect(st.m.get("hrv")).toEqual({ "2026-10-07": 41 });
    expect(st.alarm()).toBe(T0 + PULL_EVERY_MS);
    expect(await status(h)).toMatchObject({ connected: true, lastSync: T0, latest: t + 60_000, error: null });
    // Every call used the access token from connect; first pull looks two days back.
    expect(g.health().every((c) => c.auth === "Bearer at1")).toBe(true);
    expect(g.health()[0].url.searchParams.get("filter")).toBe('heart_rate.sample_time.physical_time >= "2026-10-05T10:00:00Z"');
  });

  it("follows every page, and later pulls only look 12 hours back", async () => {
    const t = T0 - 3600_000;
    const opts = { hr: Array.from({ length: 25 }, (_, i) => hrPoint(t + i * 60_000, 60 + i)) as unknown[], pageSize: 10 };
    const g = google(opts);
    const { h, st, at } = setup(g);
    await connect(h);
    await h.alarm();
    expect((st.m.get("hr:2026-10-07") as unknown[]).length).toBe(25);
    expect(g.health().filter((c) => c.url.pathname.includes("/heart-rate/")).map((c) => c.url.searchParams.get("pageToken"))).toEqual([null, "10", "20"]);
    at(T0 + PULL_EVERY_MS);
    await h.alarm();
    const last = g.health().filter((c) => c.url.pathname.includes("/heart-rate/")).at(-1)!;
    expect(last.url.searchParams.get("filter")).toBe('heart_rate.sample_time.physical_time >= "2026-10-06T22:15:00Z"');
    expect((st.m.get("hr:2026-10-07") as unknown[]).length).toBe(25); // pulled again, not doubled
    // A pull with only newer minutes adds them; the ones already kept stay.
    opts.hr = [hrPoint(t + 25 * 60_000, 99), hrPoint(t + 26 * 60_000, 98)];
    at(T0 + 2 * PULL_EVERY_MS);
    await h.alarm();
    const kept = st.m.get("hr:2026-10-07") as number[][];
    expect(kept.length).toBe(27);
    expect(kept[0]).toEqual([t, 60, 60, 60]);
    expect(kept.at(-1)).toEqual([t + 26 * 60_000, 98, 98, 98]);
  });

  it("a minute cut by the start of the pull window isn't replaced by its partial average", async () => {
    const m0 = Date.UTC(2026, 9, 7, 2, 0);
    const opts = { hr: [hrPoint(m0 + 5_000, 60), hrPoint(m0 + 45_000, 70)] as unknown[] };
    const { h, st, at } = setup(google(opts));
    await connect(h);
    await h.alarm();
    expect(st.m.get("hr:2026-10-07")).toEqual([[m0, 65, 60, 70]]);
    at(m0 + 30_000 + 12 * 3600_000); // the 12-hour window now starts at 02:00:30
    await h.alarm();
    expect(st.m.get("hr:2026-10-07")).toEqual([[m0, 65, 60, 70]]);
  });

  it("readings uploaded late (phone off for a day) are still fetched", async () => {
    const opts = { hr: [hrPoint(T0 - 60_000, 61)] as unknown[] };
    const { h, st, at } = setup(google(opts));
    await connect(h);
    await h.alarm();
    // 20 hours with no sync, then the band uploads all of it at once.
    for (let k = 1; k <= 20 * 60; k += 30) opts.hr.push(hrPoint(T0 + k * 60_000, 70));
    at(T0 + 20 * 3600_000 + 120_000);
    await h.alarm();
    const kept = [...((st.m.get("hr:2026-10-07") as number[][]) ?? []), ...((st.m.get("hr:2026-10-08") as number[][]) ?? [])];
    expect(kept.length).toBe(1 + 40);
    expect(kept.some((m) => m[0] === T0 + 3600_000 + 60_000)).toBe(true); // 11:01, more than 12 h before the second pull
  });

  it("old days are deleted even after a pause, not just the one exactly 120 days back", async () => {
    const { h, st } = setup();
    await connect(h);
    for (const d of [125, 130, 160, 119]) st.m.set(`hr:${new Date(T0 - d * 86_400_000).toISOString().slice(0, 10)}`, [[0, 1, 1, 1]]);
    await h.alarm();
    const days = [...st.m.keys()].filter((k) => k.startsWith("hr:"));
    expect(days).toEqual([`hr:${new Date(T0 - 119 * 86_400_000).toISOString().slice(0, 10)}`]);
  });

  it("more pages than one pull may take: keeps what it got and says so", async () => {
    const t = T0 - 3600_000;
    const g = google({ hr: Array.from({ length: 30 }, (_, i) => hrPoint(t + i * 60_000, 70)), pageSize: 1 });
    const { h, st } = setup(g);
    await connect(h);
    await h.alarm();
    expect((st.m.get("hr:2026-10-07") as unknown[]).length).toBe(20);
    expect(await status(h)).toMatchObject({ lastSync: T0, error: "heart-rate: more than 20 pages, the rest next time" });
  });

  it("an expired access token is renewed with the refresh token, and the call retried once", async () => {
    const g = google({ expireAccessOnce: true });
    const { h, st } = setup(g);
    await connect(h);
    await h.alarm();
    const refresh = g.calls.filter((c) => c.body?.get("grant_type") === "refresh_token");
    expect(refresh).toHaveLength(1);
    expect(refresh[0].body!.get("refresh_token")).toBe("rt");
    expect(st.m.get("auth")).toMatchObject({ access: "at2" });
    expect((await status(h)).error).toBeNull();
  });

  it("renews a token that's about to run out before using it", async () => {
    const { h, g, at } = setup();
    await connect(h);
    at(T0 + 3599_000 - 30_000);
    await h.alarm();
    expect(g.health()[0].auth).toBe("Bearer at2");
  });

  it("a revoked sign-in says 'reconnect' and stops the alarm", async () => {
    const g = google({ refreshFails: "invalid_grant" });
    const { h, st, at } = setup(g);
    await connect(h);
    at(T0 + 2 * 3600_000); // access token expired
    st.m.set("auth", { ...(st.m.get("auth") as object) });
    await st.setAlarm(0);
    await h.alarm();
    expect(await status(h)).toMatchObject({ connected: false, needsReconnect: true });
    expect(st.alarm()).toBe(0); // not re-armed
  });

  it("one kind failing doesn't lose the others, and the error is shown", async () => {
    const g = google({ failType: "sleep", hr: [hrPoint(T0 - 60_000, 61)] });
    const { h, st } = setup(g);
    await connect(h);
    await h.alarm();
    expect(st.m.get("hr:2026-10-07")).toHaveLength(1);
    expect(st.m.get("rhr")).toEqual({ "2026-10-07": 54 });
    expect(await status(h)).toMatchObject({ lastSync: T0, error: "sleep 500" });
  });

  it("sync from the app pulls, but not twice within 20 seconds", async () => {
    const { h, g, at } = setup();
    await connect(h);
    await h.fetch(post("sync"));
    const n = g.health().length;
    expect(n).toBeGreaterThan(0);
    at(T0 + 15_000);
    await h.fetch(post("sync"));
    expect(g.health().length).toBe(n);
    at(T0 + 21_000);
    await h.fetch(post("sync"));
    expect(g.health().length).toBeGreaterThan(n);
  });

  it("data returns the minutes in range across days, and the nights that touch it", async () => {
    const { h, st } = setup();
    const a = Date.UTC(2026, 9, 6, 23, 58), b = Date.UTC(2026, 9, 7, 0, 1);
    st.m.set("hr:2026-10-06", [[a, 60, 60, 60], [a - 3 * 3600_000, 70, 70, 70]].sort((x, y) => x[0] - y[0]));
    st.m.set("hr:2026-10-07", [[b, 61, 61, 61]]);
    st.m.set("sleep", [{ id: "old", start: Date.UTC(2026, 8, 1), end: Date.UTC(2026, 8, 1, 7) }, { id: "n1", start: Date.UTC(2026, 9, 6, 21), end: Date.UTC(2026, 9, 7, 5) }]);
    const d = (await (await h.fetch(new Request(`https://band/data?from=${a - 60_000}&to=${b + 60_000}`))).json()) as { hr: unknown[]; sleep: { id: string }[] };
    expect(d.hr).toEqual([[a, 60, 60, 60], [b, 61, 61, 61]]);
    expect(d.sleep.map((s) => s.id)).toEqual(["n1"]);
  });

  it("disconnect tells Google to forget it and deletes everything", async () => {
    const t = T0 - 60_000;
    const { h, st, g } = setup(google({ hr: [hrPoint(t, 60)] }));
    await connect(h);
    await h.alarm();
    await h.fetch(post("disconnect"));
    expect(g.calls.some((c) => c.url.pathname === "/revoke" && c.url.searchParams.get("token") === "rt")).toBe(true);
    expect([...st.m.keys()]).toEqual([]);
    expect(st.alarm()).toBeNull();
    expect((await status(h)).connected).toBe(false);
  });
});

describe("/api/band routes", () => {
  /** A fake Supabase (one user, token "good") and a fake namespace of BandHubs. */
  function world() {
    const g = google();
    const hubs = new Map<string, BandHub>();
    const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      if (new URL(req.url).pathname === "/auth/v1/user") return req.headers.get("authorization") === "Bearer good" ? Response.json({ id: "u1" }) : new Response("no", { status: 401 });
      return g.f(input, init);
    }) as typeof fetch;
    const BAND = {
      idFromName: (n: string) => n,
      get: (id: unknown) => { const k = String(id); if (!hubs.has(k)) hubs.set(k, new BandHub({ storage: fakeStorage() }, env, { fetch: g.f })); return hubs.get(k)!; },
    };
    const e = { ...env, BAND, ASSETS: { fetch: async () => new Response("") } };
    return { e, f, hubs, g };
  }
  const req = (path: string, method = "GET", token = "good") => new Request(`https://healthos.example${path}`, { method, headers: { authorization: `Bearer ${token}` } });

  it("start: signed in only; the link goes to Google with a state naming you and our callback", async () => {
    const { e, f } = world();
    expect((await handleBand(req("/api/band/start", "POST", "bad"), e, f)).status).toBe(401);
    const { url } = (await (await handleBand(req("/api/band/start", "POST"), e, f)).json()) as { url: string };
    const u = new URL(url);
    expect(u.searchParams.get("redirect_uri")).toBe("https://healthos.example/api/google/callback");
    expect(await readState(u.searchParams.get("state")!, "csecret")).toBe("u1");
  });

  it("callback: a good state + code connects that account and goes back to Settings", async () => {
    const { e, f, hubs } = world();
    const { url } = (await (await handleBand(req("/api/band/start", "POST"), e, f)).json()) as { url: string };
    const state = new URL(url).searchParams.get("state")!;
    const r = await handleBand(new Request(`https://healthos.example/api/google/callback?code=good-code&state=${encodeURIComponent(state)}`), e, f);
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("https://healthos.example/#settings/band-ok");
    expect(await status(hubs.get("u1")!)).toMatchObject({ connected: true });
  });

  it("callback: a forged state, a 'no' on Google's page, or a bad code goes back saying it failed", async () => {
    const { e, f, hubs } = world();
    const forged = await handleBand(new Request("https://healthos.example/api/google/callback?code=good-code&state=u1.1.abc"), e, f);
    expect(forged.headers.get("location")).toMatch(/#settings\/band-failed\?why=/);
    expect(hubs.size).toBe(0);
    const { url } = (await (await handleBand(req("/api/band/start", "POST"), e, f)).json()) as { url: string };
    const state = encodeURIComponent(new URL(url).searchParams.get("state")!);
    const no = await handleBand(new Request(`https://healthos.example/api/google/callback?error=access_denied&state=${state}`), e, f);
    expect(decodeURIComponent(no.headers.get("location")!)).toContain("you said no");
    const bad = await handleBand(new Request(`https://healthos.example/api/google/callback?code=nope&state=${state}`), e, f);
    expect(bad.headers.get("location")).toMatch(/band-failed/);
    expect(await status(hubs.get("u1")!)).toMatchObject({ connected: false });
  });

  it("status/data/sync/disconnect go to your own hub; unknown paths 404; no secrets → 503", async () => {
    const { e, f, hubs } = world();
    expect((await (await handleBand(req("/api/band/status"), e, f)).json())).toMatchObject({ connected: false });
    expect(hubs.has("u1")).toBe(true);
    expect((await handleBand(req("/api/band/data?from=1&to=2"), e, f)).status).toBe(200);
    expect((await handleBand(req("/api/band/nope"), e, f)).status).toBe(404);
    expect((await handleBand(req("/api/band/status", "GET", "bad"), e, f)).status).toBe(401);
    expect((await handleBand(req("/api/band/status"), { ...e, GOOGLE_CLIENT_SECRET: undefined }, f)).status).toBe(503);
  });
});
