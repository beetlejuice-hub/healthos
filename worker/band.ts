/**
 * The Fitbit band, server side (PLAN item 48). One Durable Object per account ("BandHub"), like PushHub:
 *  - keeps the Google sign-in (refresh token; never sent to the app),
 *  - pulls new data every 15 minutes on an alarm and when the app asks (the band itself syncs to the
 *    phone every ~15–30 min, so pulling faster gains nothing),
 *  - keeps heart rate per minute (avg/min/max, one bucket per UTC day, 120 days), sleep sessions with
 *    stages, daily resting heart rate and HRV, steps per 5 minutes (PLAN 66), and each night's skin temperature,
 *    breathing rate and blood oxygen, and each day's VO2 max (PLAN 52) — what the app draws.
 * Google's side: lib/band.ts (shapes from Google's own CLI).
 */

import type { Storage } from "./push";
import {
  GOOGLE_TOKEN, HEALTH_API, STEP_WINDOWS, readVo2, readVo2Samples, dailyFilter, dailyRollUpBody, readDailyKcal, wakeFor, mergeMinutes, mergeSteps, perMinute, readDaily, readHeartRate, readSleep, readSteps, rollUpBody, sampleFilter, sleepFilter,
  type HrMinute, type Page, type RollUpPage, type SleepSession, type StepBucket,
} from "../src/lib/band";
import type { Vo2Day } from "../src/lib/vo2";
import { keepSamples, readPostWhy, type HealthSample } from "../src/lib/healthimport";
import { POINTS, summarize, thin, type Pt } from "../src/lib/placepoints";
import type { Places } from "../src/lib/timeline";

export type BandEnv = {
  GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string;
  /** PLAN 56: the key Tempo holds (its HEALTHOS_KEY), and optionally whose band it reads. */
  TEMPO_KEY?: string; BAND_OWNER?: string;
  /** PLAN 198: the account's PushHubs, for the reconnect alarm. */
  PUSH?: { idFromName(name: string): unknown; get(id: unknown): { fetch(req: Request): Promise<Response> } };
};
type Auth = { refresh: string; access?: string; accessExp?: number; connectedAt: number; broken?: boolean; brokenAt?: number };
/** The reconnect alarm's pushes: when the last went, how many. */
type Nag = { last?: number; sent: number };

/**
 * The reconnect alarm (PLAN 198; owner, 5 Nov: "App should notify pretty harshly when i have to reconnect the band to
 * app"). When Google drops the sign-in: a push at once, then every 6 hours while it's broken — never 23:00–08:00 where
 * you are (it waits for 08:00) — and once a day after the first week. A reconnect stops it.
 */
export const NAG = { everyMs: 6 * 3600_000, dailyAfterMs: 7 * 86_400_000, quietFrom: 23, quietTo: 8 } as const;

/** When the next reconnect push may go. `tzOffsetMin` as the phone's Date.getTimezoneOffset() says it (−60 in Budapest in winter). */
export function nextNag(brokenAt: number, last: number | undefined, now: number, tzOffsetMin: number): number {
  const every = last != null && last - brokenAt >= NAG.dailyAfterMs ? 86_400_000 : NAG.everyMs;
  const at = last == null ? now : Math.max(now, last + every);
  const local = new Date(at - tzOffsetMin * 60_000), h = local.getUTCHours() + local.getUTCMinutes() / 60; // local clock in UTC fields
  if (h < NAG.quietFrom && h >= NAG.quietTo) return at;
  const morning = new Date(local);
  morning.setUTCHours(NAG.quietTo, 0, 0, 0);
  if (h >= NAG.quietFrom) morning.setUTCDate(morning.getUTCDate() + 1);
  return morning.getTime() + tzOffsetMin * 60_000;
}

/** What the push says: how long it's been, and that past 7 days the gap's oldest minutes can't be pulled back. */
export function nagWords(brokenAt: number, now: number): { title: string; body: string } {
  const h = Math.floor((now - brokenAt) / 3600_000), d = Math.floor(h / 24), left = 7 - d;
  const since = h < 1 ? "just now" : h < 48 ? `${h} hours ago` : `${d} days ago`;
  return {
    title: "Band disconnected — reconnect now",
    body: `Google stopped sending your Fitbit's data ${since}. ` + (left > 0
      ? `Tap, then Reconnect. ${left === 7 ? "Within 7 days" : `${left} day${left === 1 ? "" : "s"} left`} and the gap fills back in; after that its oldest heart rate is gone.`
      : "Its first days can't be pulled back any more — tap, then Reconnect, so the gap stops growing."),
  };
}
/** The last VO2 max pull: when, how many days back, how many points came; a sample when none could be read; its error. */
export type Vo2Pull = { at: number; days: number; points: number; sample?: string; error?: string };
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
/** Nights sent with any data request (readiness: 4 weeks of usual ending a week ago, plus slack). */
export const SLEEP_DAYS_SENT = 40;
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
/** The night check's kinds (PLAN 52): Google's type, its filter name, where it's kept, the field read (Google's API reference). */
export const NIGHT_TYPES = [
  ["daily-sleep-temperature-derivations", "daily_sleep_temperature_derivations", "skin", "nightlyTemperatureCelsius"],
  ["daily-respiratory-rate", "daily_respiratory_rate", "breath", "breathsPerMinute"],
  ["daily-oxygen-saturation", "daily_oxygen_saturation", "spo2", "averagePercentage"],
] as const;
const NIGHT_KEYS = [...NIGHT_TYPES.map((t) => t[2]), "vo2"];
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
      if (t.body.error === "invalid_grant") await this.storage.put("auth", { ...a, broken: true, brokenAt: this.now() });
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

  /** A daily roll-up (calories burned): like `rollUp`, by local day. */
  private async dailyRollUp(type: string, fromDay: string, toDayExclusive: string, errors: string[]): Promise<RollUpPage> {
    const all: NonNullable<RollUpPage["rollupDataPoints"]> = [];
    let pageToken: string | undefined, retried = false;
    for (let i = 0; i < MAX_PAGES; i++) {
      const token = await this.access(retried);
      if (!token) throw new Error("not connected");
      const r = await this.f(`${HEALTH_API}/users/me/dataTypes/${type}/dataPoints:dailyRollUp`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: dailyRollUpBody(fromDay, toDayExclusive, pageToken) });
      if (r.status === 401 && !retried) { retried = true; i--; continue; }
      if (!r.ok) throw new Error(`${type} ${r.status}`);
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
    // first: nothing pulled yet (a reconnect keeps `latest`, so it isn't). After a gap — the phone off, a sign-in broken for
    // days — each kind reaches back over it, up to what its first pull takes.
    const first = prev.lastOk == null && prev.latest == null;
    const gap = prev.latest != null ? Math.ceil((now - prev.latest) / DAY) + 1 : 0;
    const back = (usual: number, most: number) => (first ? most : Math.min(most, Math.max(usual, gap)));
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
      const fresh = readSleep(await this.list("sleep", sleepFilter(utcDay(now - back(3, 14) * DAY)), 25, errors));
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
    try {
      // Calories burned per local day (PLAN 83). Google allows 14 days a request: the first time 12 back to tomorrow (any
      // time zone's today is inside), then the last 3 days again (today's grows; late syncs fill yesterday in).
      const got = readDailyKcal(await this.dailyRollUp("total-calories", utcDay(now - back(3, 12) * DAY), utcDay(now + 2 * DAY), errors));
      await this.storage.put("kcal", { ...((await this.storage.get<Record<string, number>>("kcal")) ?? {}), ...got });
    } catch (e) { errors.push(String((e as Error).message)); }
    for (const [type, name, key, field] of [["daily-resting-heart-rate", "daily_resting_heart_rate", "rhr", "beatsPerMinute"], ["daily-heart-rate-variability", "daily_heart_rate_variability", "hrv", undefined]] as const) {
      try {
        const got = readDaily(await this.list(type, dailyFilter(name, utcDay(now - back(7, 30) * DAY)), 1000, errors), field);
        await this.storage.put(key, { ...((await this.storage.get<Record<string, number>>(key)) ?? {}), ...got });
      } catch (e) { errors.push(String((e as Error).message)); }
    }
    // The night check (PLAN 52): one value a night each. The first time a kind is pulled — a band connected before these
    // came in included — 40 days back, so your usual (4 weeks ending a week ago) is there from the first morning. Their
    // errors are said, but don't make the pull count as failed: heart rate and sleep still came.
    const nightErrors: string[] = [];
    for (const [type, name, key, field] of NIGHT_TYPES) {
      try {
        const kept = await this.storage.get<Record<string, number>>(key);
        const got = readDaily(await this.list(type, dailyFilter(name, utcDay(now - (kept ? back(7, 40) : 40) * DAY)), 1000, nightErrors), field);
        await this.storage.put(key, { ...(kept ?? {}), ...got });
      } catch (e) { nightErrors.push(String((e as Error).message)); }
    }
    // Cardio fitness (PLAN 52): one VO2 max a day, slow — 90 days back the first time, so there's a trend from day one.
    // What came is kept too (PLAN 198; owner, 5 Nov, of "Needs 3 days of VO2 max": "is this going to stay like this
    // forever?"): how many points, and when none could be read, what the first looked like — so the card can say why.
    try {
      const kept = await this.storage.get<Record<string, Vo2Day>>("vo2"), days = kept ? back(7, 90) : 90;
      const page = await this.list("daily-vo2-max", dailyFilter("daily_vo2_max", utcDay(now - days * DAY)), 1000, nightErrors);
      const got = readVo2(page), pts = page.dataPoints ?? [];
      // the two sample kinds too (PLAN 206): without outdoor runs a band may only have these. Each on its own — one
      // Google turns down doesn't stop the others. The daily value wins a day, then a run's, then any other sample.
      const more: { samples?: number; runs?: number; moreErr?: string } = {};
      let samples: Record<string, Vo2Day> = {}, runs: Record<string, Vo2Day> = {};
      try { const sp = await this.list("vo2-max", sampleFilter("vo2_max", now - days * DAY), 1000, nightErrors); samples = readVo2Samples(sp, "vo2"); more.samples = sp.dataPoints?.length ?? 0; }
      catch (e) { more.moreErr = `vo2-max: ${String((e as Error).message).slice(0, 60)}`; }
      try { const rp = await this.list("run-vo2-max", sampleFilter("run_vo2_max", now - days * DAY), 1000, nightErrors); runs = readVo2Samples(rp, "run"); more.runs = rp.dataPoints?.length ?? 0; }
      catch (e) { more.moreErr = `${more.moreErr ? `${more.moreErr}; ` : ""}run-vo2-max: ${String((e as Error).message).slice(0, 60)}`; }
      await this.storage.put("vo2", { ...(kept ?? {}), ...samples, ...runs, ...got });
      await this.storage.put("vo2:pull", { at: now, days, points: pts.length, ...more, ...(pts.length && !Object.keys(got).length ? { sample: JSON.stringify(pts[0]).slice(0, 200) } : {}) } satisfies Vo2Pull);
    } catch (e) {
      nightErrors.push(String((e as Error).message));
      await this.storage.put("vo2:pull", { at: now, days: 0, points: 0, error: String((e as Error).message).slice(0, 120) } satisfies Vo2Pull);
    }
    const said = [...errors, ...nightErrors];
    const next: Sync = { lastRun: now, lastOk: errors.filter((e) => !/pages/.test(e)).length < 6 ? now : prev.lastOk, latest, ...(gapSec != null ? { gapSec } : {}), ...(stepsLatest != null ? { stepsLatest } : {}), ...(said.length ? { error: said.join("; ").slice(0, 300) } : {}) };
    await this.storage.put("sync", next);
    return next;
  }

  private async status() {
    const a = await this.auth(), s = await this.sync();
    return { connected: !!a && !a.broken, needsReconnect: !!a?.broken, connectedAt: a?.connectedAt ?? null, lastSync: s.lastOk ?? null, latest: s.latest ?? null, error: s.error ?? null, gapSec: s.gapSec ?? null,
      vo2Pull: (await this.storage.get<Vo2Pull>("vo2:pull")) ?? null };
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/+/, "");
    const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {};
    // whose hub this is and their clock (the Worker says, from the signed-in request): the reconnect alarm needs both
    const user = req.headers.get("x-band-user"), tz = Number(req.headers.get("x-band-tz"));
    if (user && user !== (await this.storage.get<string>("user"))) await this.storage.put("user", user);
    if (req.headers.has("x-band-tz") && Number.isInteger(tz) && Math.abs(tz) <= 840 && tz !== (await this.storage.get<number>("tz"))) await this.storage.put("tz", tz);
    if (path === "connect") {
      const t = await this.token({ grant_type: "authorization_code", code: String(body.code ?? ""), redirect_uri: String(body.redirect ?? "") });
      if (!t.ok || typeof t.body.refresh_token !== "string") return json({ error: `google said ${t.status} ${String(t.body.error ?? "no refresh token")}` }, 400);
      const had = await this.auth(), was = await this.sync();
      await this.storage.put("auth", { refresh: t.body.refresh_token, access: String(t.body.access_token ?? ""), accessExp: this.now() + Number(t.body.expires_in ?? 3600) * 1000, connectedAt: this.now() } satisfies Auth);
      // a reconnect keeps where the data got to, so the next pull reaches back over the gap (it used to start over: 2 days)
      await this.storage.put("sync", had && was.latest != null ? { latest: was.latest, ...(was.stepsLatest != null ? { stepsLatest: was.stepsLatest } : {}) } : {});
      await this.storage.delete("nag");
      await this.storage.setAlarm(this.now() + 2000); // first pull right away, in the background
      return json({ ok: true });
    }
    // Apple Health in (PLAN 184): the key's hash (a new one replaces the old), what the Shortcut posts, what the app pulls
    if (path === "health-key") { await this.storage.put("health:key", String(body.hash ?? "")); return json({ ok: true }); }
    if (path === "health-in") {
      const hash = await this.storage.get<string>("health:key"), given = String(body.hash ?? "");
      if (!hash || hash.length !== given.length || [...hash].reduce((d, c, i) => d | (c.charCodeAt(0) ^ given.charCodeAt(i)), 0) !== 0) return json({ error: "wrong key — make a new one in HealthOS → Settings → Apple Health" }, 401);
      if (typeof body.fail === "string") { await this.storage.put("health:fail", { at: this.now(), error: body.fail }); return json({ error: body.fail }, 400); }
      const { samples: got, skipped } = readPostWhy(body.post, this.now());
      await this.storage.put("health:samples", keepSamples((await this.storage.get<HealthSample[]>("health:samples")) ?? [], got, this.now()));
      await this.storage.put("health:last", { at: this.now(), types: got.map((s) => s.type), ...(Object.keys(skipped).length ? { skipped } : {}) });
      await this.storage.delete("health:fail");
      // nothing usable in a readable post: say which fields came, so a wrong key name or an empty value shows
      if (!got.length) { const keys = Object.keys((body.post ?? {}) as object); const fail = `came, but nothing usable — fields: ${keys.join(", ") || "none"}; values: ${JSON.stringify(body.post).slice(0, 160)}`; await this.storage.put("health:fail", { at: this.now(), error: fail }); return json({ ok: false, error: fail }); }
      return json({ ok: true, got: got.map((s) => s.type), ...(Object.keys(skipped).length ? { skipped } : {}) });
    }
    // Places on their own (PLAN 212): Overland's points, a day to a key (thinned, 120 days), and each day's places worked
    // out when the app asks — again only after new points came
    if (path === "places-key") { await this.storage.put("places:key", String(body.hash ?? "")); return json({ ok: true }); }
    if (path === "places-in") {
      const hash = await this.storage.get<string>("places:key"), given = String(body.hash ?? "");
      if (!hash || hash.length !== given.length || [...hash].reduce((d, c, i) => d | (c.charCodeAt(0) ^ given.charCodeAt(i)), 0) !== 0) return json({ error: "wrong key — set Overland up again from HealthOS → Settings → Bring in" }, 401);
      const pts = (Array.isArray(body.pts) ? body.pts : []) as Pt[], oldest = Math.floor((this.now() - POINTS.keepDays * DAY) / 1000), byDay = new Map<string, Pt[]>();
      for (const p of pts) if (p[0] >= oldest && p[0] * 1000 <= this.now() + DAY) { const d = utcDay(p[0] * 1000); (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(p); }
      for (const [d, add] of byDay) await this.storage.put(`places:pts:${d}`, thin((await this.storage.get<Pt[]>(`places:pts:${d}`)) ?? [], add));
      const last = (await this.storage.get<{ day?: string }>("places:last")) ?? {}, today = utcDay(this.now());
      // once a day: the days past 120 go
      if (last.day !== today) for (let k = POINTS.keepDays + 1; k <= POINTS.keepDays + 10; k++) await this.storage.delete(`places:pts:${utcDay(this.now() - k * DAY)}`);
      if (pts.length) await this.storage.put("places:last", { at: this.now(), n: pts.length, day: today });
      return json({ result: "ok" });
    }
    if (path === "places-data") {
      const last = (await this.storage.get<{ at: number; n: number }>("places:last")) ?? null, key = !!(await this.storage.get<string>("places:key"));
      const tzh = Number(req.headers.get("x-band-tz") ?? (await this.storage.get<number>("tz")) ?? 0), tz = Number.isFinite(tzh) ? tzh : 0;
      let sum = (await this.storage.get<{ at: number; tz: number; places: Places | null; points: number }>("places:sum")) ?? null;
      if (last && (!sum || sum.at < last.at || sum.tz !== tz)) {
        const pts: Pt[] = [];
        for (let k = POINTS.keepDays; k >= 0; k--) pts.push(...((await this.storage.get<Pt[]>(`places:pts:${utcDay(this.now() - k * DAY)}`)) ?? []));
        sum = { at: this.now(), tz, places: summarize(pts, tz, 0), points: pts.length };
        await this.storage.put("places:sum", sum);
      }
      return json({ key, last, places: sum?.places ?? null, points: sum?.points ?? 0 });
    }
    if (path === "health-data") return json({ samples: (await this.storage.get<HealthSample[]>("health:samples")) ?? [], last: (await this.storage.get("health:last")) ?? null, fail: (await this.storage.get("health:fail")) ?? null, key: !!(await this.storage.get<string>("health:key")) });
    if (path === "status") return json(await this.status());
    if (path === "sync") {
      const s = await this.sync();
      // Opening the app or "Pull now" pulls, but not more than once every 20 s (a double tap, two devices).
      const st = await this.status();
      if (st.connected && !(s.lastRun && this.now() - s.lastRun < PULL_GAP_MS)) await this.pull();
      // and the 15-minute pulls carry on from here, even if their chain had broken (PLAN 69: a reading 9 h old); a sign-in
      // that broke just now, or before this alarm existed, gets the reconnect alarm going
      const after = await this.status();
      if (after.connected) await this.storage.setAlarm(this.now() + PULL_EVERY_MS);
      else if (after.needsReconnect) await this.storage.setAlarm(this.now() + 1000);
      return json(after);
    }
    if (path === "data") {
      const from = Number(url.searchParams.get("from")) || this.now() - DAY, to = Number(url.searchParams.get("to")) || this.now();
      const hr: HrMinute[] = [], steps: StepBucket[] = [];
      for (let d = from - (from % DAY); d <= to; d += DAY) {
        for (const m of (await this.storage.get<HrMinute[]>(`hr:${utcDay(d)}`)) ?? []) if (m[0] >= from && m[0] <= to) hr.push(m);
        for (const b of (await this.storage.get<StepBucket[]>(`steps:${utcDay(d)}`)) ?? []) if (b[0] >= from && b[0] <= to) steps.push(b);
      }
      // the nights of the last SLEEP_DAYS_SENT days always come, whatever range was asked for: they're small (one a day),
      // and the sleep score's usual and readiness need 4 weeks of them on Today, which asks for a week of heart rate
      const sleepFrom = Math.min(from, this.now() - SLEEP_DAYS_SENT * DAY);
      const sleep = ((await this.storage.get<SleepSession[]>("sleep")) ?? []).filter((s) => s.end >= sleepFrom - DAY && s.start <= to);
      return json({ hr, sleep, rhr: (await this.storage.get("rhr")) ?? {}, hrv: (await this.storage.get("hrv")) ?? {}, steps, kcal: (await this.storage.get("kcal")) ?? {},
        ...Object.fromEntries(await Promise.all(NIGHT_KEYS.map(async (k) => [k, (await this.storage.get(k)) ?? {}]))), ...(await this.status()) });
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
      for (const k of ["auth", "sync", "sleep", "rhr", "hrv", "kcal", "nag", "vo2:pull", ...NIGHT_KEYS]) await this.storage.delete(k);
      for (let d = 0; d <= KEEP_DAYS; d++) { await this.storage.delete(`hr:${utcDay(this.now() - d * DAY)}`); await this.storage.delete(`steps:${utcDay(this.now() - d * DAY)}`); }
      await this.storage.deleteAlarm();
      return json({ ok: true });
    }
    return json({ error: "not found" }, 404);
  }

  /** Every 15 minutes while connected. A revoked sign-in stops the pulls; the alarm then only wakes for the reconnect push. */
  async alarm(): Promise<void> {
    const a = await this.auth();
    if (!a) return;
    if (!a.broken) await this.pull();
    const b = await this.auth();
    if (b?.broken) return this.nag(b);
    await this.storage.setAlarm(this.now() + PULL_EVERY_MS);
  }

  /** The reconnect push, if one is due (nextNag), through the account's PushHub; then the alarm at the next one. */
  private async nag(a: Auth): Promise<void> {
    const now = this.now(), n = (await this.storage.get<Nag>("nag")) ?? { sent: 0 }, tz = (await this.storage.get<number>("tz")) ?? 0;
    const since = a.brokenAt ?? now;
    if (a.brokenAt == null) await this.storage.put("auth", { ...a, brokenAt: since }); // broken before the alarm existed
    if (nextNag(since, n.last, now, tz) <= now + 30_000) {
      const user = await this.storage.get<string>("user");
      if (user && this.env.PUSH) {
        const push = this.env.PUSH.get(this.env.PUSH.idFromName(user));
        await push.fetch(new Request("https://push/alert", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...nagWords(since, now), url: "/#today", tag: "band-reconnect", sticky: true }) })).catch(() => null);
      }
      n.last = now; n.sent++;
      await this.storage.put("nag", n);
    }
    await this.storage.setAlarm(nextNag(since, n.last, now, tz));
  }
}
