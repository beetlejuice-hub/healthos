/**
 * The Fitbit Charge 6, through the Google Health API (owner, 7 Oct: "charge6 yes, can we have continous
 * data"). The old Fitbit Web API is switched off on 30 Oct 2026; this is its replacement. Shapes as in
 * Google's own CLI (github.com/google-health-api/google-health-cli): a list call is
 *   GET https://health.googleapis.com/v4/users/me/dataTypes/{type}/dataPoints?filter=…&pageSize=…&pageToken=…
 * → { dataPoints: [{ name, dataSource, <typeKey>: { sampleTime | interval | date, …values } }], nextPageToken }.
 * Pure: the Worker (worker/band.ts) fetches, these read; the app draws what comes out.
 */

export const HEALTH_API = "https://health.googleapis.com/v4";
export const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
export const BAND_REDIRECT = "https://healthos.lukacsarnold9.workers.dev/api/google/callback";

/** Read-only, and only what the app shows: heart rate, HRV, steps, workouts · sleep · resting HR, daily HRV. */
export const BAND_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
];

/** Where to send you to say yes. `offline` + `consent` so Google returns a refresh token, which keeps pulls going. */
export function authUrl(clientId: string, state: string, redirect = BAND_REDIRECT): string {
  const q = new URLSearchParams({
    client_id: clientId, redirect_uri: redirect, response_type: "code", scope: BAND_SCOPES.join(" "),
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `${GOOGLE_AUTH}?${q}`;
}

// ---- filters (AIP-160): sample types by physical time, sleep by civil end time, daily types by date ----

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
/** "heart_rate.sample_time.physical_time >= \"2026-10-07T08:00:00Z\"" */
export const sampleFilter = (name: string, fromMs: number, toMs?: number) =>
  `${name}.sample_time.physical_time >= "${iso(fromMs)}"${toMs != null ? ` AND ${name}.sample_time.physical_time < "${iso(toMs)}"` : ""}`;
/** Sleep only filters on its (local) end time, without a zone: "2026-10-05T00:00:00". */
export const sleepFilter = (fromDay: string) => `sleep.interval.civil_end_time >= "${fromDay}T00:00:00"`;
/** Daily types: "daily_resting_heart_rate.date >= \"2026-10-01\"". */
export const dailyFilter = (name: string, fromDay: string) => `${name}.date >= "${fromDay}"`;

// ---- reading responses ----

type Point = Record<string, unknown> & { name?: string };
export type Page = { dataPoints?: Point[]; nextPageToken?: string };
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(+v) ? +v : null);
const ms = (v: unknown): number | null => { const t = typeof v === "string" ? Date.parse(v) : NaN; return isNaN(t) ? null : t; };

/** The type-specific object in a data point ("heartRate", "sleep", …): the one object that isn't metadata. */
function body(p: Point): Obj | null {
  for (const [k, v] of Object.entries(p)) if (!["dataSource", "name", "civilStartTime", "civilEndTime"].includes(k) && obj(v)) return obj(v);
  return null;
}
const civilDate = (d: unknown) => { const o = obj(d); return o ? `${num(o.year)}-${String(num(o.month)).padStart(2, "0")}-${String(num(o.day)).padStart(2, "0")}` : null; };

export type HrSample = { t: number; bpm: number };
/** heart-rate: { sampleTime: { physicalTime }, beatsPerMinute } → samples, oldest first; junk dropped. */
export function readHeartRate(page: Page): HrSample[] {
  const out: HrSample[] = [];
  for (const p of page.dataPoints ?? []) {
    const b = body(p); const t = ms(obj(b?.sampleTime)?.physicalTime); const bpm = num(b?.beatsPerMinute);
    if (t != null && bpm != null && bpm >= 25 && bpm <= 240) out.push({ t, bpm });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** The first numeric field whose name says RMSSD, else the first number at all (the name isn't documented). */
function hrvValue(b: Obj): number | null {
  const entries = Object.entries(b).filter(([k]) => !["sampleTime", "date", "interval", "createTime", "updateTime"].includes(k));
  const named = entries.find(([k, v]) => /rmssd/i.test(k) && num(v) != null);
  return num((named ?? entries.find(([, v]) => num(v) != null))?.[1]);
}
export type HrvSample = { t: number; ms: number };
export function readHrv(page: Page): HrvSample[] {
  const out: HrvSample[] = [];
  for (const p of page.dataPoints ?? []) {
    const b = body(p); const t = ms(obj(b?.sampleTime)?.physicalTime); const v = b ? hrvValue(b) : null;
    if (t != null && v != null && v > 0 && v < 300) out.push({ t, ms: v });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Daily types (resting heart rate, daily HRV): { date: {year, month, day}, value } → day → value. */
export function readDaily(page: Page, field?: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of page.dataPoints ?? []) {
    const b = body(p); const day = civilDate(b?.date);
    const v = b ? (field ? num(b[field]) : hrvValue(b)) : null;
    if (day && v != null) out[day] = v;
  }
  return out;
}

export type Stage = { type: string; start: number; end: number };
export type SleepSession = { id: string; start: number; end: number; asleepMin: number | null; awakeMin: number | null; toFallAsleepMin: number | null; nap: boolean; stageMin: Record<string, number>; stages: Stage[] };
/** sleep: { interval, metadata.nap, summary: { minutesAsleep, …, stagesSummary[] }, stages[] } → sessions. */
export function readSleep(page: Page): SleepSession[] {
  const out: SleepSession[] = [];
  for (const p of page.dataPoints ?? []) {
    const s = body(p); if (!s) continue;
    const iv = obj(s.interval); const start = ms(iv?.startTime), end = ms(iv?.endTime);
    if (start == null || end == null || end <= start) continue;
    const sum = obj(s.summary) ?? {};
    const stageMin: Record<string, number> = {};
    for (const x of Array.isArray(sum.stagesSummary) ? sum.stagesSummary : []) { const o = obj(x); const m = num(o?.minutes); if (o && typeof o.type === "string" && m != null) stageMin[o.type.toLowerCase()] = m; }
    const stages: Stage[] = [];
    for (const x of Array.isArray(s.stages) ? s.stages : []) { const o = obj(x); const a = ms(o?.startTime), z = ms(o?.endTime); if (o && typeof o.type === "string" && a != null && z != null && z > a) stages.push({ type: o.type.toLowerCase(), start: a, end: z }); }
    out.push({
      id: String(p.name ?? `${start}`).split("/").at(-1)!, start, end,
      asleepMin: num(sum.minutesAsleep), awakeMin: num(sum.minutesAwake), toFallAsleepMin: num(sum.minutesToFallAsleep),
      nap: obj(s.metadata)?.nap === true, stageMin, stages: stages.sort((a, b) => a.start - b.start),
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

// ---- what the app keeps: heart rate per minute ----

/** Samples (every few seconds) → one value per minute: [minute start (ms), average bpm, min, max]. */
export type HrMinute = [t: number, avg: number, min: number, max: number];
export function perMinute(samples: HrSample[]): HrMinute[] {
  const by = new Map<number, number[]>();
  for (const s of samples) { const m = Math.floor(s.t / 60_000) * 60_000; const a = by.get(m); if (a) a.push(s.bpm); else by.set(m, [s.bpm]); }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => [t, Math.round(v.reduce((x, y) => x + y, 0) / v.length), Math.min(...v), Math.max(...v)]);
}
/** Merge newly pulled minutes into what's kept (a minute pulled again replaces the old one). */
export function mergeMinutes(kept: HrMinute[], fresh: HrMinute[]): HrMinute[] {
  const m = new Map(kept.map((x) => [x[0], x]));
  for (const x of fresh) m.set(x[0], x);
  return [...m.values()].sort((a, b) => a[0] - b[0]);
}

/** Last night's real bedtime and wake time: the main (non-nap) sleep that ended most recently before `now`. */
export function lastNight(sessions: SleepSession[], now: number): SleepSession | null {
  return sessions.filter((s) => !s.nap && s.end <= now && now - s.end < 36 * 3600_000).sort((a, b) => b.end - a.end)[0] ?? null;
}

// ---- the sign-in "state": who started it, signed, so the callback can't be forged or replayed late ----

const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
}
/** "userId.issuedAt.signature" — valid for 15 minutes. */
export async function signState(userId: string, secret: string, now = Date.now()): Promise<string> {
  const msg = `${userId}.${now}`;
  return `${msg}.${await hmac(secret, msg)}`;
}
export async function readState(state: string, secret: string, now = Date.now()): Promise<string | null> {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [user, at, sig] = parts;
  if (!user || !/^\d+$/.test(at) || now - +at > 15 * 60_000 || +at > now + 60_000) return null;
  return (await hmac(secret, `${user}.${at}`)) === sig ? user : null;
}
