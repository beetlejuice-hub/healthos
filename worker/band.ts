/**
 * The Fitbit band, server side (PLAN item 48). One Durable Object per account ("BandHub"), like PushHub:
 *  - keeps the Google sign-in (refresh token; never sent to the app),
 *  - pulls new data every 15 minutes on an alarm and when the app asks (the band itself syncs to the
 *    phone every ~15–30 min, so pulling faster gains nothing),
 *  - keeps heart rate per minute (avg/min/max, one bucket per UTC day, 120 days), sleep sessions with
 *    stages, daily resting heart rate and HRV, steps per 5 minutes (PLAN 66) — what the app draws.
 * Google's side: lib/band.ts (shapes from Google's own CLI).
 */

import type { Storage } from "./push";
import {
  GOOGLE_TOKEN, HEALTH_API, STEP_WINDOWS, dailyFilter, wakeFor, mergeMinutes, mergeSteps, perMinute, readDaily, readHeartRate, readSleep, readSteps, rollUpBody, sampleFilter, sleepFilter,
  type HrMinute, type Page, type RollUpPage, type SleepSession, type StepBucket,
} from "../src/lib/band";

export type BandEnv = {
  GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string;
  /** PLAN 56: the key Tempo holds (its HEALTHOS_KEY), and optionally whose band it reads. */
  TEMPO_KEY?: string; BAND_OWNER?: string;
};
type Auth = { refresh: string; access?: string; accessExp?: number; connectedAt: number; broken?: boolean };
/** `gapSec`: the typical time between two heart-rate readings Google sent, from the last pull with enough of them
 * (owner, 8 Oct: "my fitbit app shows heartbeat log every 15 minute, how do u get a number for every minute??" —
 * this answers it with his own data). */
type Sync = { lastRun?: number; lastOk?: number; latest?: number; error?: string; gapSec?: number; stepsLatest?: number };

/** Median seconds between consecutive readings (gaps over 30 min — band off — left out); null under 20 readings. */
export function typicalGap(ts: number[]): number | null {
  const g = ts.slice(1).map((t, i) => (t - ts[i]) / 1000).filter((x) => x > 0 && x <= 1800).sort((a, b) => a - b);
  return g.length >= 20 ? g[Math.floor(g.length / 2)] : null;
}

export const PULL_EVERY_MS = 15 * 60_000;
export const PULL_GAP_MS = 20_000;
const DAY = 86_400_000;
const KEEP_DAYS = 120;
/**
 * First pull: two days back. After that, the last 12 h again each time (the band can upload hours late) — or
 * from an hour before the newest reading kept, if that's older: a phone off for a day uploads a day at once.
 * Never more than 7 days (what the band itself holds). Always from a whole minute, so no minute is half-read.
 */
const FIRST_MS = 2 * DAY, AGAIN_MS = 12 * 3600_000, MAX_BACK_MS = 7 * DAY;
export function hrFrom(now: number, first: boolean, latest: number | undefined): number {
  const from = first ? now - FIRST_MS : Math.max(now - MAX_BACK_MS, Math.min(now - AGAIN_MS, (latest ?? now) - 3600_000));
  return Math.floor(from / 60_000) * 60_000;
}
/** Steps: like heart rate, but the first pull goes two weeks back (the sleep and mood grids want days), from a whole 5 minutes. */
export function stepsFrom(now: number, latest: number | undefined): number {
  const from = latest == null ? now - 14 * DAY : Math.max(now - MAX_BACK_MS, Math.min(now - AGAIN_MS, latest - 3600_000));
  return Math.floor(from / 300_000) * 300_000;
}
/** Pages per kind per pull. Cloudflare allows 50 outside calls per run; this keeps one pull under ~25. */
const MAX_PAGES = 20;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export class BandHub {
  storage: Storage;
  env: BandEnv;
  f: typeof fetch;
  now: () => number;
  constructor(state: { storage: Storage }, env?: BandEnv, deps?: { fetch?: typeof fetch; now?: () => number }) {
    this.storage = state.storage;
    this.env = env ?? {};
    // Wrapped: Workers throw "Illegal invocation" if the global fetch is called as another object's method.
    this.f = deps?.fetch ?? ((u, i) => fetch(u, i));
    this.now = deps?.now ?? Date.now;
  }

  private auth = () => this.storage.get<Auth>("auth");
  private sync = async () => (await this.storage.get<Sync>("sync")) ?? {};

  /** Google's token endpoint, form-encoded. */
  private async token(params: Record<string, string>): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
    const r = await this.f(GOOGLE_TOKEN, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.env.GOOGLE_CLIENT_ID ?? "", client_secret: this.env.GOOGLE_CLIENT_SECRET ?? "", ...params }).toString(),
    });
    return { ok: r.ok, status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  }

  /** A fresh access token, renewing it a minute before it runs out. null = the sign-in is gone (revoked). */
  private async access(force = false): Promise<string | null> {
    const a = await this.auth();
    if (!a || a.broken) return null;
    if (!force && a.access && (a.accessExp ?? 0) > this.now() + 60_000) return a.access;
    const t = await this.token({ grant_type: "refresh_token", refresh_token: a.refresh });
    if (!t.ok) {
      // invalid_grant: revoked, or expired (a project in testing can expire it weekly) — needs a reconnect.
      if (t.body.error === "invalid_grant") await this.storage.put("auth", { ...a, broken: true });
      throw new Error(`token ${t.status} ${String(t.body.error ?? "")}`.trim());
    }
    const next: Auth = { ...a, access: String(t.body.access_token), accessExp: this.now() + Number(t.body.expires_in ?? 3600) * 1000 };
    await this.storage.put("auth", next);
    return next.access!;
  }

  /** Every page of one data type for one filter (up to MAX_PAGES — more is reported, not dropped silently). One 401 → renew the token and retry. */
  private async list(type: string, filter: string, pageSize: number, errors: string[]): Promise<Page> {
    const all: NonNullable<Page["dataPoints"]> = [];
    let pageToken = "", retried = false;
    for (let i = 0; i < MAX_PAGES; i++) {
      const token = await this.access(retried);
      if (!token) throw new Error("not connected");
      const q = new URLSearchParams({ filter, pageSize: String(pageSize), ...(pageToken ? { pageToken } : {}) });
      const r = await this.f(`${HEALTH_API}/users/me/dataTypes/${type}/dataPoints?${q}`, { headers: { authorization: `Bearer ${token}` } });
      if (r.status === 401 && !retried) { retried = true; i--; continue; }
      if (!r.ok) throw new Error(`${type} ${r.status}`);
      const page = (await r.json()) as Page;
      all.push(...(page.dataPoints ?? []));
      if (!page.nextPageToken) break;
      pageToken = page.nextPageToken;
      if (i === MAX_PAGES - 1) errors.push(`${type}: more than ${MAX_PAGES} pages, the rest next time`);
    }
    return { dataPoints: all };
  }

  /** A roll-up (steps): POSTed, paged by putting the token back in the body. One 401 → renew the token and retry. */
  private async rollUp(type: string, from: number, to: number, windowSize: string, errors: string[]): Promise<RollUpPage> {
    const all: NonNullable<RollUpPage["rollupDataPoints"]> = [];
    let pageToken: string | undefined, retried = false;
    for (let i = 0; i < MAX_PAGES; i++) {
      const token = await this.access(retried);
      if (!token) throw new Error("not connected");
      const r = await this.f(`${HEALTH_API}/users/me/dataTypes/${type}/dataPoints:rollUp`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: rollUpBody(from, to, windowSize, pageToken) });
      if (r.status === 401 && !retried) { retried = true; i--; continue; }
      if (!r.ok) throw Object.assign(new Error(`${type} ${r.status}`), { status: r.status });
      const page = (await r.json()) as RollUpPage;
      all.push(...(page.rollupDataPoints ?? []));
      if (!page.nextPageToken) break;
      pageToken = page.nextPageToken;
      if (i === MAX_PAGES - 1) errors.push(`${type}: more than ${MAX_PAGES} pages, the rest next time`);
    }
    return { rollupDataPoints: all };
  }

  /** Pull what's new from Google into storage. Each kind on its own: one failing doesn't lose the others. */
  async pull(): Promise<Sync> {
    const now = this.now(), prev = await this.sync();
    const errors: string[] = [];
    const first = prev.lastOk == null;
    let latest = prev.latest, gapSec = prev.gapSec, stepsLatest = prev.stepsLatest;
    try {
      const hr = readHeartRate(await this.list("heart-rate", sampleFilter("heart_rate", hrFrom(now, first, prev.latest)), 10000, errors));
      const byDay = new Map<string, HrMinute[]>();
      for (const m of perMinute(hr)) { const k = utcDay(m[0]); const a = byDay.get(k); if (a) a.push(m); else byDay.set(k, [m]); }
      for (const [day, mins] of byDay) await this.storage.put(`hr:${day}`, mergeMinutes((await this.storage.get<HrMinute[]>(`hr:${day}`)) ?? [], mins));
      if (hr.length) latest = Math.max(latest ?? 0, hr[hr.length - 1].t);
      gapSec = typicalGap(hr.map((x) => x.t)) ?? gapSec;
      // Older days go, including any a pause in pulling skipped over.
      for (let d = KEEP_DAYS; d <= KEEP_DAYS + 60; d++) await this.storage.delete(`hr:${utcDay(now - d * DAY)}`);
    } catch (e) { errors.push(String((e as Error).message)); }
    try {
      const fresh = readSleep(await this.list("sleep", sleepFilter(utcDay(now - (first ? 14 : 3) * DAY)), 25, errors));
      const kept = (await this.storage.get<SleepSession[]>("sleep")) ?? [];
      const byId = new Map(kept.map((s) => [s.id, s]));
      for (const s of fresh) byId.set(s.id, s);
      await this.storage.put("sleep", [...byId.values()].sort((a, b) => a.start - b.start).slice(-90));
    } catch (e) { errors.push(String((e as Error).message)); }
    try {
      // 5-minute windows; if Google won't give windows that small, hourly ones (still enough to say "you were walking").
      const from = stepsFrom(now, prev.stepsLatest);
      let got: StepBucket[] | null = null;
      for (const w of STEP_WINDOWS) {
        try { got = readSteps(await this.rollUp("steps", from, now, w, errors)); break; }
        catch (e) { if ((e as { status?: number }).status !== 400 || w === STEP_WINDOWS.at(-1)) throw e; }
      }
      const byDay = new Map<string, StepBucket[]>();
      for (const b of got ?? []) { const k = utcDay(b[0]); const a = byDay.get(k); if (a) a.push(b); else byDay.set(k, [b]); }
      for (const [day, bs] of byDay) await this.storage.put(`steps:${day}`, mergeSteps((await this.storage.get<StepBucket[]>(`steps:${day}`)) ?? [], bs));
      if (got?.length) stepsLatest = Math.max(stepsLatest ?? 0, got[got.length - 1][0]);
      for (let d = KEEP_DAYS; d <= KEEP_DAYS + 60; d++) await this.storage.delete(`steps:${utcDay(now - d * DAY)}`);
    } catch (e) { errors.push(String((e as Error).message)); }
    for (const [type, name, key, field] of [["daily-resting-heart-rate", "daily_resting_heart_rate", "rhr", "beatsPerMinute"], ["daily-heart-rate-variability", "daily_heart_rate_variability", "hrv", undefined]] as const) {
      try {
        const got = readDaily(await this.list(type, dailyFilter(name, utcDay(now - (first ? 30 : 7) * DAY)), 1000, errors), field);
        await this.storage.put(key, { ...((await this.storage.get<Record<string, number>>(key)) ?? {}), ...got });
      } catch (e) { errors.push(String((e as Error).message)); }
    }
    const next: Sync = { lastRun: now, lastOk: errors.filter((e) => !/pages/.test(e)).length < 5 ? now : prev.lastOk, latest, ...(gapSec != null ? { gapSec } : {}), ...(stepsLatest != null ? { stepsLatest } : {}), ...(errors.length ? { error: errors.join("; ").slice(0, 300) } : {}) };
    await this.storage.put("sync", next);
    return next;
  }

  private async status() {
    const a = await this.auth(), s = await this.sync();
    return { connected: !!a && !a.broken, needsReconnect: !!a?.broken, connectedAt: a?.connectedAt ?? null, lastSync: s.lastOk ?? null, latest: s.latest ?? null, error: s.error ?? null, gapSec: s.gapSec ?? null };
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/+/, "");
    const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {};
    if (path === "connect") {
      const t = await this.token({ grant_type: "authorization_code", code: String(body.code ?? ""), redirect_uri: String(body.redirect ?? "") });
      if (!t.ok || typeof t.body.refresh_token !== "string") return json({ error: `google said ${t.status} ${String(t.body.error ?? "no refresh token")}` }, 400);
      await this.storage.put("auth", { refresh: t.body.refresh_token, access: String(t.body.access_token ?? ""), accessExp: this.now() + Number(t.body.expires_in ?? 3600) * 1000, connectedAt: this.now() } satisfies Auth);
      await this.storage.put("sync", {});
      await this.storage.setAlarm(this.now() + 2000); // first pull right away, in the background
      return json({ ok: true });
    }
    if (path === "status") return json(await this.status());
    if (path === "sync") {
      const s = await this.sync();
      // Opening the app or "Pull now" pulls, but not more than once every 20 s (a double tap, two devices).
      if ((await this.status()).connected && !(s.lastRun && this.now() - s.lastRun < PULL_GAP_MS)) await this.pull();
      return json(await this.status());
    }
    if (path === "data") {
      const from = Number(url.searchParams.get("from")) || this.now() - DAY, to = Number(url.searchParams.get("to")) || this.now();
      const hr: HrMinute[] = [], steps: StepBucket[] = [];
      for (let d = from - (from % DAY); d <= to; d += DAY) {
        for (const m of (await this.storage.get<HrMinute[]>(`hr:${utcDay(d)}`)) ?? []) if (m[0] >= from && m[0] <= to) hr.push(m);
        for (const b of (await this.storage.get<StepBucket[]>(`steps:${utcDay(d)}`)) ?? []) if (b[0] >= from && b[0] <= to) steps.push(b);
      }
      const sleep = ((await this.storage.get<SleepSession[]>("sleep")) ?? []).filter((s) => s.end >= from - DAY && s.start <= to);
      return json({ hr, sleep, rhr: (await this.storage.get("rhr")) ?? {}, hrv: (await this.storage.get("hrv")) ?? {}, steps, ...(await this.status()) });
    }
    if (path === "wake") {
      const sleep = (await this.storage.get<SleepSession[]>("sleep")) ?? [];
      return json(wakeFor(sleep, url.searchParams.get("day") ?? "", Number(url.searchParams.get("tz") ?? 0)) ?? { wokeAt: null });
    }
    // The "_owner" hub only: whose band Tempo reads. Set once, by the first account that syncs a connected band.
    if (path === "owner") {
      if (req.method === "POST" && typeof body.id === "string" && !(await this.storage.get("owner"))) await this.storage.put("owner", body.id);
      return json({ id: (await this.storage.get<string>("owner")) ?? null });
    }
    if (path === "disconnect") {
      const a = await this.auth();
      if (a) await this.f(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(a.refresh)}`, { method: "POST" }).catch(() => null);
      for (const k of ["auth", "sync", "sleep", "rhr", "hrv"]) await this.storage.delete(k);
      for (let d = 0; d <= KEEP_DAYS; d++) { await this.storage.delete(`hr:${utcDay(this.now() - d * DAY)}`); await this.storage.delete(`steps:${utcDay(this.now() - d * DAY)}`); }
      await this.storage.deleteAlarm();
      return json({ ok: true });
    }
    return json({ error: "not found" }, 404);
  }

  /** Every 15 minutes while connected. A revoked sign-in stops the alarm until the next connect. */
  async alarm(): Promise<void> {
    const a = await this.auth();
    if (!a || a.broken) return;
    await this.pull();
    if (!(await this.auth())?.broken) await this.storage.setAlarm(this.now() + PULL_EVERY_MS);
  }
}
