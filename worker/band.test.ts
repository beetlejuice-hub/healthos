import { describe, expect, it } from "vitest";
import { BandHub, PULL_EVERY_MS } from "./band";
import { handleBand, handleHealth } from "./index";
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
/** Steps over [t, t + min): what Google's roll-up would hand back for one window. */
const stepWin = (t: number, min: number, n: number) => ({ startTime: new Date(t).toISOString(), endTime: new Date(t + min * 60_000).toISOString(), steps: { countSum: String(n) } });

/** Google, faked: the token endpoint, the Health API (paged), the revoke endpoint. Every call is logged. */
function google(opts: { hr?: unknown[]; pageSize?: number; expireAccessOnce?: boolean; refreshFails?: string; failType?: string;
  /** Step counts per minute (t → n); rolled up into whatever window is asked for. Default: 600 steps at T0 − 2 h. */
  steps?: Map<number, number>; stepWindows?: string[]; stepsPage?: number } = {}) {
  const calls: { url: URL; body: URLSearchParams | null; json: Record<string, unknown> | null; auth: string | null }[] = [];
  let issued = 0, expired = !!opts.expireAccessOnce;
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const raw = req.method === "POST" ? await req.text() : "";
    const body = url.hostname === "oauth2.googleapis.com" && raw ? new URLSearchParams(raw) : null;
    const jb = url.hostname === "health.googleapis.com" && raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    calls.push({ url, body, json: jb, auth: req.headers.get("authorization") });
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
      if (type === "steps" && url.pathname.endsWith(":rollUp")) {
        const { range, windowSize, pageToken } = jb as { range: { startTime: string; endTime: string }; windowSize: string; pageToken?: string };
        if (!(opts.stepWindows ?? ["300s", "3600s"]).includes(windowSize)) return Response.json({ error: { code: 400, message: "window" } }, { status: 400 });
        const w = parseInt(windowSize) * 1000, a = Date.parse(range.startTime), z = Date.parse(range.endTime);
        const per = opts.steps ?? new Map([[T0 - 2 * 3600_000, 600]]);
        const wins: unknown[] = [];
        for (let t = a; t < z; t += w) { let n = 0, any = false; for (const [m, c] of per) if (m >= t && m < t + w) { n += c; any = true; } if (any) wins.push(stepWin(t, w / 60_000, n)); }
        const size = opts.stepsPage ?? 1000, at = Number(pageToken || 0);
        return Response.json({ rollupDataPoints: wins.slice(at, at + size), ...(at + size < wins.length ? { nextPageToken: String(at + size) } : {}) });
      }
      if (type === "total-calories" && url.pathname.endsWith(":dailyRollUp")) {
        // like Google: one point per local day in [start, end), today's so far
        const { range } = jb as { range: { start: { date: { year: number; month: number; day: number } }; end: { date: { year: number; month: number; day: number } } } };
        const d0 = Date.UTC(range.start.date.year, range.start.date.month - 1, range.start.date.day), d1 = Date.UTC(range.end.date.year, range.end.date.month - 1, range.end.date.day);
        const pts = [];
        for (let d = d0; d < d1 && d <= T0; d += 86_400_000) { const dt = new Date(d); const date = { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() }; pts.push({ civilStartTime: { date }, civilEndTime: { date }, totalCalories: { kcalSum: String(2300 + dt.getUTCDate()) } }); }
        return Response.json({ rollupDataPoints: pts });
      }
      if (type === "sleep") return Response.json({ dataPoints: [{ name: "users/me/dataTypes/sleep/dataPoints/n1", sleep: { interval: { startTime: "2026-10-06T21:40:00Z", endTime: "2026-10-07T05:10:00Z" }, summary: { minutesAsleep: 412 } } }] });
      if (type === "daily-resting-heart-rate") return Response.json({ dataPoints: [{ dailyRestingHeartRate: { date: { year: 2026, month: 10, day: 7 }, beatsPerMinute: 54 } }] });
      // the night check's three (PLAN 52), shaped as Google's API reference has them, on the 7th only
      const date = { year: 2026, month: 10, day: 7 };
      if (type === "daily-sleep-temperature-derivations") return Response.json({ dataPoints: [{ dailySleepTemperatureDerivations: { date, nightlyTemperatureCelsius: 34.1, baselineTemperatureCelsius: 33.8, relativeNightlyStddev30dCelsius: 0.2 } }] });
      if (type === "daily-respiratory-rate") return Response.json({ dataPoints: [{ dailyRespiratoryRate: { date, breathsPerMinute: 14.6 } }] });
      if (type === "daily-vo2-max") return Response.json({ dataPoints: [{ dailyVo2Max: { date, vo2Max: 44.2, cardioFitnessLevel: "GOOD", estimated: true } }, { dailyVo2Max: { date: { ...date, day: 6 }, vo2Max: 0 } }] });
      if (type === "daily-oxygen-saturation") return Response.json({ dataPoints: [{ dailyOxygenSaturation: { date, averagePercentage: 96.2, lowerBoundPercentage: 94, upperBoundPercentage: 98 } }] });
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

  it("steps (PLAN 66): a 5-minute roll-up from two weeks back, kept per UTC day, served by data", async () => {
    const at = Date.UTC(2026, 9, 6, 23, 57), per = new Map([[at, 40], [at + 60_000, 50], [at + 4 * 60_000, 30], [Date.UTC(2026, 9, 7, 8, 2), 100]]);
    const { h, st, g } = setup(google({ steps: per }));
    await connect(h); await h.alarm();
    const call = g.health().find((c) => c.url.pathname.endsWith("/steps/dataPoints:rollUp"))!;
    expect(call.json).toEqual({ range: { startTime: "2026-09-23T10:00:00Z", endTime: "2026-10-07T10:00:00Z" }, windowSize: "300s" });
    expect(st.m.get("steps:2026-10-06")).toEqual([[Date.UTC(2026, 9, 6, 23, 55), 5, 90]]);
    expect(st.m.get("steps:2026-10-07")).toEqual([[Date.UTC(2026, 9, 7, 0, 0), 5, 30], [Date.UTC(2026, 9, 7, 8, 0), 5, 100]]);
    const d = (await (await h.fetch(new Request(`https://band/data?from=${Date.UTC(2026, 9, 6, 23)}&to=${Date.UTC(2026, 9, 7, 1)}`))).json()) as { steps: unknown[] };
    expect(d.steps).toEqual([[Date.UTC(2026, 9, 6, 23, 55), 5, 90], [Date.UTC(2026, 9, 7, 0, 0), 5, 30]]);
    expect((await status(h)).error).toBeNull();
  });

  it("steps: Google refusing 5-minute windows → hourly ones, no error shown", async () => {
    const { h, st, g } = setup(google({ steps: new Map([[Date.UTC(2026, 9, 7, 8, 10), 100], [Date.UTC(2026, 9, 7, 8, 50), 200]]), stepWindows: ["3600s"] }));
    await connect(h); await h.alarm();
    expect(g.health().filter((c) => c.url.pathname.endsWith(":rollUp")).map((c) => c.json!.windowSize)).toEqual(["300s", "3600s"]);
    expect(st.m.get("steps:2026-10-07")).toEqual([[Date.UTC(2026, 9, 7, 8), 60, 300]]);
    expect((await status(h)).error).toBeNull();
  });

  it("steps: every page (the token goes back in the body), and later pulls look 12 hours back", async () => {
    const per = new Map(Array.from({ length: 5 }, (_, i) => [T0 - (i + 1) * 3600_000, 10 + i] as [number, number]));
    const { h, st, g, at } = setup(google({ steps: per, stepsPage: 2 }));
    await connect(h); await h.alarm();
    const rolls = () => g.health().filter((c) => c.url.pathname.endsWith(":rollUp"));
    expect(rolls().map((c) => c.json!.pageToken ?? null)).toEqual([null, "2", "4"]);
    expect((st.m.get("steps:2026-10-07") as unknown[]).length).toBe(5);
    at(T0 + PULL_EVERY_MS); await h.alarm();
    expect((rolls().at(-1)!.json!.range as { startTime: string }).startTime).toBe("2026-10-06T22:15:00Z");
  });

  it("opening the app restarts the 15-minute pulls if their chain broke (PLAN 69)", async () => {
    const { h, st, at } = setup();
    await connect(h); await h.alarm();
    await st.deleteAlarm(); // the chain broke (an alarm that gave up)
    at(T0 + 3 * 3600_000);
    await h.fetch(post("sync"));
    expect(st.alarm()).toBe(T0 + 3 * 3600_000 + PULL_EVERY_MS);
  });

  it("calories burned (PLAN 83): a daily roll-up, 14 days on the first pull, kept by day and served by data", async () => {
    const { h, st, g } = setup();
    await connect(h); await h.alarm();
    const call = g.health().find((c) => c.url.pathname.endsWith("/total-calories/dataPoints:dailyRollUp"))!;
    expect(call.json).toEqual({ range: { start: { date: { year: 2026, month: 9, day: 25 } }, end: { date: { year: 2026, month: 10, day: 9 } } }, windowSizeDays: 1 });
    expect((st.m.get("kcal") as Record<string, number>)["2026-10-07"]).toBe(2307);
    const d = (await (await h.fetch(new Request(`https://band/data?from=${T0 - 86_400_000}&to=${T0}`))).json()) as { kcal: Record<string, number> };
    expect(d.kcal["2026-10-06"]).toBe(2306);
    expect((await status(h)).error).toBeNull();
  });

  it("data returns the minutes in range across days, and the nights of the last 40 days whatever the range", async () => {
    const { h, st } = setup();
    const a = Date.UTC(2026, 9, 6, 23, 58), b = Date.UTC(2026, 9, 7, 0, 1);
    st.m.set("hr:2026-10-06", [[a, 60, 60, 60], [a - 3 * 3600_000, 70, 70, 70]].sort((x, y) => x[0] - y[0]));
    st.m.set("hr:2026-10-07", [[b, 61, 61, 61]]);
    // 36 days before now (T0, 7 Oct): sent — the sleep score's usual and readiness need 4 weeks of nights on Today;
    // 48 days before: not, unless asked for
    st.m.set("sleep", [{ id: "aug", start: Date.UTC(2026, 7, 20), end: Date.UTC(2026, 7, 20, 7) }, { id: "sep1", start: Date.UTC(2026, 8, 1), end: Date.UTC(2026, 8, 1, 7) }, { id: "n1", start: Date.UTC(2026, 9, 6, 21), end: Date.UTC(2026, 9, 7, 5) }]);
    const d = (await (await h.fetch(new Request(`https://band/data?from=${a - 60_000}&to=${b + 60_000}`))).json()) as { hr: unknown[]; sleep: { id: string }[] };
    expect(d.hr).toEqual([[a, 60, 60, 60], [b, 61, 61, 61]]);
    expect(d.sleep.map((s) => s.id)).toEqual(["sep1", "n1"]);
    const older = (await (await h.fetch(new Request(`https://band/data?from=${Date.UTC(2026, 7, 15)}&to=${Date.UTC(2026, 7, 25)}`))).json()) as { sleep: { id: string }[] };
    expect(older.sleep.map((s) => s.id)).toEqual(["aug"]); // asked for: there, and nothing after the range
  });

  it("the night check's three: 40 days back the first time each is pulled (a band connected before), a week after; served with the data", async () => {
    const { h, st, g, at } = setup();
    await connect(h);
    st.m.set("rhr", { "2026-10-01": 55 }); st.m.set("sync", { lastOk: T0 - 3600_000 }); // already pulling before these came in
    await h.alarm();
    const since = (type: string) => g.health().filter((c) => c.url.pathname.includes(`/${type}/`)).map((c) => c.url.searchParams.get("filter")!.match(/"([^"]+)"/)![1]);
    expect(since("daily-sleep-temperature-derivations")).toEqual(["2026-08-28"]);
    expect(since("daily-resting-heart-rate")).toEqual(["2026-09-30"]); // not the first pull: a week, as before
    expect(st.m.get("skin")).toEqual({ "2026-10-07": 34.1 });
    expect(st.m.get("breath")).toEqual({ "2026-10-07": 14.6 });
    expect(st.m.get("spo2")).toEqual({ "2026-10-07": 96.2 });
    // VO2 max: 90 days back the first time (a slow trend); a 0 is junk, not a value
    expect(since("daily-vo2-max")).toEqual(["2026-07-09"]);
    expect(st.m.get("vo2")).toEqual({ "2026-10-07": { v: 44.2, level: "GOOD", est: true } });
    at(T0 + PULL_EVERY_MS); await h.alarm();
    expect(since("daily-oxygen-saturation")).toEqual(["2026-08-28", "2026-09-30"]);
    const d = (await (await h.fetch(new Request("https://band/data"))).json()) as Record<string, unknown>;
    expect(d).toMatchObject({ skin: { "2026-10-07": 34.1 }, breath: { "2026-10-07": 14.6 }, spo2: { "2026-10-07": 96.2 }, vo2: { "2026-10-07": { v: 44.2 } } });
  });

  it("one of the night check's kinds failing is said, but the pull still counts and the others are kept", async () => {
    const { h, st } = setup(google({ failType: "daily-respiratory-rate" }));
    await connect(h);
    await h.alarm();
    expect(await status(h)).toMatchObject({ lastSync: T0, error: "daily-respiratory-rate 500" });
    expect(st.m.get("skin")).toEqual({ "2026-10-07": 34.1 });
    expect(st.m.has("breath")).toBe(false);
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

  it("wake (PLAN 56): Tempo's key only; nothing until a connected band has synced; then the owner's morning", async () => {
    const { e, f } = world();
    const k = { ...e, TEMPO_KEY: "tk" as string | undefined, BAND_OWNER: undefined as string | undefined };
    const wake = (env2: typeof k, token = "tk") => handleBand(req("/api/band/wake?day=2026-10-07&tz=120", "GET", token), env2, f);
    // No key set on the server, or the wrong one: refused — even for a signed-in person's token.
    expect((await wake({ ...k, TEMPO_KEY: undefined })).status).toBe(401);
    expect((await wake(k, "good")).status).toBe(401);
    expect((await wake(k, "tk-")).status).toBe(401);
    // Right key, no band yet: no wake time, not an error.
    expect(await (await wake(k)).json()).toEqual({ wokeAt: null });
    // u1 connects and syncs: the fake Google's night ends 05:10Z = 07:10 in Budapest.
    const { url } = (await (await handleBand(req("/api/band/start", "POST"), e, f)).json()) as { url: string };
    const state = encodeURIComponent(new URL(url).searchParams.get("state")!);
    await handleBand(new Request(`https://healthos.example/api/google/callback?code=good-code&state=${state}`), e, f);
    await handleBand(req("/api/band/sync", "POST"), e, f);
    expect(await (await wake(k)).json()).toEqual({ wokeAt: "2026-10-07T05:10:00.000Z", asleepMin: 412 });
    // BAND_OWNER points elsewhere: that account's band, which has nothing.
    expect(await (await wake({ ...k, BAND_OWNER: "someone-else" })).json()).toEqual({ wokeAt: null });
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

describe("how fine the heart rate is", () => {
  it("the typical gap between readings — every 5 s, every 15 min — ignoring band-off gaps", async () => {
    const { typicalGap } = await import("./band");
    const t0 = 1_800_000_000_000;
    expect(typicalGap(Array.from({ length: 100 }, (_, i) => t0 + i * 5000))).toBe(5);
    const every15 = Array.from({ length: 40 }, (_, i) => t0 + i * 900_000);
    expect(typicalGap(every15)).toBe(900);
    expect(typicalGap([...Array.from({ length: 30 }, (_, i) => t0 + i * 5000), t0 + 8 * 3600_000])).toBe(5); // a night off the wrist
    expect(typicalGap([t0, t0 + 5000])).toBeNull();
  });
  it("status reports it after a pull", async () => {
    const t = T0 - 3600_000;
    const { h } = setup(google({ hr: Array.from({ length: 60 }, (_, i) => hrPoint(t + i * 10_000, 70)) }));
    await connect(h);
    await h.alarm();
    expect((await status(h)).gapSec).toBe(10);
  });
});

describe("/api/health — Apple Health in (PLAN 184)", () => {
  function world() {
    const hubs = new Map<string, BandHub>();
    const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      if (new URL(req.url).pathname === "/auth/v1/user") return req.headers.get("authorization") === "Bearer good" ? Response.json({ id: "u1" }) : new Response("no", { status: 401 });
      return new Response("no", { status: 404 });
    }) as typeof fetch;
    const BAND = { idFromName: (n: string) => n, get: (id: unknown) => { const k = String(id); if (!hubs.has(k)) hubs.set(k, new BandHub({ storage: fakeStorage() }, env, { now: () => NOW })); return hubs.get(k)!; } };
    return { e: { BAND, ASSETS: { fetch: async () => new Response("") } }, f, hubs };
  }
  const NOW = Date.UTC(2026, 9, 29, 7, 0);
  const call = (path: string, method: string, auth: string, body?: unknown) => new Request(`https://healthos.example${path}`, { method, headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const POST = { weight: "82,4", weightUnit: "kg", weightAt: "2026-10-29T06:31:00Z", fat: 0.186, fatAt: "2026-10-29T06:31:00Z", walk: 4.9, walkUnit: "km/hr", walkAt: "2026-10-28T19:00:00Z" };

  it("a key for you (signed in only); the Shortcut posts with it; the app pulls what came, in kg / % / km/h", async () => {
    const { e, f, hubs } = world();
    expect((await handleHealth(call("/api/health/key", "POST", "bad"), e as never, f)).status).toBe(401);
    const { key, url } = (await (await handleHealth(call("/api/health/key", "POST", "good"), e as never, f)).json()) as { key: string; url: string };
    expect(key).toMatch(/^u1\.[0-9a-f]{48}$/);
    expect(url).toBe("https://healthos.example/api/health/in");
    expect(JSON.stringify([...(hubs.get("u1")!.storage as ReturnType<typeof fakeStorage>).m.values()])).not.toContain(key.split(".")[1]); // only its hash
    const r = await handleHealth(call("/api/health/in", "POST", key, POST), e as never, f);
    expect(await r.json()).toEqual({ ok: true, got: ["weight", "fat", "walk"] });
    const d = (await (await handleHealth(call("/api/health/data", "GET", "good"), e as never, f)).json()) as { samples: unknown[]; last: { at: number }; key: boolean };
    expect(d.samples).toEqual([{ type: "walk", at: Date.parse("2026-10-28T19:00:00Z"), value: 4.9 }, { type: "weight", at: Date.parse("2026-10-29T06:31:00Z"), value: 82.4 }, { type: "fat", at: Date.parse("2026-10-29T06:31:00Z"), value: 18.6 }]);
    expect([d.last.at, d.key]).toEqual([NOW, true]);
  });
  it("controls: a wrong key, no key, a key from before a new one, someone else's account → nothing kept", async () => {
    const { e, f } = world();
    const { key: old } = (await (await handleHealth(call("/api/health/key", "POST", "good"), e as never, f)).json()) as { key: string };
    const { key } = (await (await handleHealth(call("/api/health/key", "POST", "good"), e as never, f)).json()) as { key: string };
    for (const k of [old, `u1.${"0".repeat(48)}`, "u1", "", `u2.${key.split(".")[1]}`]) expect((await handleHealth(call("/api/health/in", "POST", k, POST), e as never, f)).status).toBe(401);
    const d = (await (await handleHealth(call("/api/health/data", "GET", "good"), e as never, f)).json()) as { samples: unknown[] };
    expect(d.samples).toEqual([]);
    expect((await handleHealth(call("/api/health/in", "POST", key, "not json"), e as never, f)).status).toBe(400);
    expect((await handleHealth(call("/api/health/in", "POST", key, "x".repeat(9000)), e as never, f)).status).toBe(413);
    expect((await handleHealth(call("/api/health/in", "GET", key), e as never, f)).status).toBe(405);
  });
  it("a Request Body left on Form works too (owner: \"now it says 400 bad request\"); an empty one says what's wrong", async () => {
    const { e, f } = world();
    const { key } = (await (await handleHealth(call("/api/health/key", "POST", "good"), e as never, f)).json()) as { key: string };
    const form = new URLSearchParams(POST as Record<string, string | number> as Record<string, string>).toString();
    const r1 = await handleHealth(new Request("https://healthos.example/api/health/in", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" }, body: form }), e as never, f);
    expect(await r1.json()).toEqual({ ok: true, got: ["weight", "fat", "walk"] });
    const fd = new FormData(); for (const [k, v] of Object.entries(POST)) fd.append(k, String(v));
    const r2 = await handleHealth(new Request("https://healthos.example/api/health/in", { method: "POST", headers: { authorization: `Bearer ${key}` }, body: fd }), e as never, f);
    expect(((await r2.json()) as { ok?: boolean }).ok).toBe(true);
    const r3 = await handleHealth(new Request("https://healthos.example/api/health/in", { method: "POST", headers: { authorization: `Bearer ${key}` }, body: "" }), e as never, f);
    expect(r3.status).toBe(400);
    expect(((await r3.json()) as { error: string }).error).toMatch(/^nothing readable came \(.*0 bytes\) — Get Contents of URL → Request Body should be JSON/);
    // what came is kept for Settings to show; a good post after clears it
    const d = (await (await handleHealth(call("/api/health/data", "GET", "good"), e as never, f)).json()) as { fail: { error: string } | null };
    expect(d.fail?.error).toMatch(/^nothing readable came/);
    await handleHealth(call("/api/health/in", "POST", key, POST), e as never, f);
    expect(((await (await handleHealth(call("/api/health/data", "GET", "good"), e as never, f)).json()) as { fail: unknown }).fail).toBeNull();
    // readable but nothing usable (a field named wrong): says which fields came
    const r4 = (await (await handleHealth(call("/api/health/in", "POST", key, { Weight: "82" }), e as never, f)).json()) as { ok: boolean; error: string };
    expect([r4.ok, r4.error]).toEqual([false, 'came, but nothing usable — fields: Weight; values: {"Weight":"82"}']);
  });
  it("the Shortcut running twice a day keeps one of each", async () => {
    const { e, f } = world();
    const { key } = (await (await handleHealth(call("/api/health/key", "POST", "good"), e as never, f)).json()) as { key: string };
    await handleHealth(call("/api/health/in", "POST", key, POST), e as never, f);
    await handleHealth(call("/api/health/in", "POST", key, POST), e as never, f);
    const d = (await (await handleHealth(call("/api/health/data", "GET", "good"), e as never, f)).json()) as { samples: unknown[] };
    expect(d.samples).toHaveLength(3);
  });
});
