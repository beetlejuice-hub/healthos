/**
 * The Fitbit band, server side (PLAN item 48). One Durable Object per account ("BandHub"), like PushHub:
 *  - keeps the Google sign-in (refresh token; never sent to the app),
 *  - pulls new data every 15 minutes on an alarm and when the app asks (the band itself syncs to the
 *    phone every ~15–30 min, so pulling faster gains nothing),
 *  - keeps heart rate per minute (avg/min/max, one bucket per UTC day, 120 days), sleep sessions with
 *    stages, daily resting heart rate and HRV — what the app draws.
 * Google's side: lib/band.ts (shapes from Google's own CLI).
 */

import type { Storage } from "./push";
import {
  GOOGLE_TOKEN, HEALTH_API, dailyFilter, mergeMinutes, perMinute, readDaily, readHeartRate, readSleep, sampleFilter, sleepFilter,
  type HrMinute, type Page, type SleepSession,
} from "../src/lib/band";

export type BandEnv = { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string };
type Auth = { refresh: string; access?: string; accessExp?: number; connectedAt: number; broken?: boolean };
type Sync = { lastRun?: number; lastOk?: number; latest?: number; error?: string };

export const PULL_EVERY_MS = 15 * 60_000;
const DAY = 86_400_000;
const KEEP_DAYS = 120;
/** First pull: two days back. After that, the last 12 h again each time — the band can upload hours late. */
const FIRST_MS = 2 * DAY, AGAIN_MS = 12 * 3600_000;
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

  /** Pull what's new from Google into storage. Each kind on its own: one failing doesn't lose the others. */
  async pull(): Promise<Sync> {
    const now = this.now(), prev = await this.sync();
    const errors: string[] = [];
    const first = prev.lastOk == null;
    let latest = prev.latest;
    try {
      const hr = readHeartRate(await this.list("heart-rate", sampleFilter("heart_rate", now - (first ? FIRST_MS : AGAIN_MS)), 10000, errors));
      const byDay = new Map<string, HrMinute[]>();
      for (const m of perMinute(hr)) { const k = utcDay(m[0]); const a = byDay.get(k); if (a) a.push(m); else byDay.set(k, [m]); }
      for (const [day, mins] of byDay) await this.storage.put(`hr:${day}`, mergeMinutes((await this.storage.get<HrMinute[]>(`hr:${day}`)) ?? [], mins));
      if (hr.length) latest = Math.max(latest ?? 0, hr[hr.length - 1].t);
      await this.storage.delete(`hr:${utcDay(now - KEEP_DAYS * DAY)}`);
    } catch (e) { errors.push(String((e as Error).message)); }
    try {
      const fresh = readSleep(await this.list("sleep", sleepFilter(utcDay(now - (first ? 14 : 3) * DAY)), 25, errors));
      const kept = (await this.storage.get<SleepSession[]>("sleep")) ?? [];
      const byId = new Map(kept.map((s) => [s.id, s]));
      for (const s of fresh) byId.set(s.id, s);
      await this.storage.put("sleep", [...byId.values()].sort((a, b) => a.start - b.start).slice(-90));
    } catch (e) { errors.push(String((e as Error).message)); }
    for (const [type, name, key, field] of [["daily-resting-heart-rate", "daily_resting_heart_rate", "rhr", "beatsPerMinute"], ["daily-heart-rate-variability", "daily_heart_rate_variability", "hrv", undefined]] as const) {
      try {
        const got = readDaily(await this.list(type, dailyFilter(name, utcDay(now - (first ? 30 : 7) * DAY)), 1000, errors), field);
        await this.storage.put(key, { ...((await this.storage.get<Record<string, number>>(key)) ?? {}), ...got });
      } catch (e) { errors.push(String((e as Error).message)); }
    }
    const next: Sync = { lastRun: now, lastOk: errors.filter((e) => !/pages/.test(e)).length < 4 ? now : prev.lastOk, latest, ...(errors.length ? { error: errors.join("; ").slice(0, 300) } : {}) };
    await this.storage.put("sync", next);
    return next;
  }

  private async status() {
    const a = await this.auth(), s = await this.sync();
    return { connected: !!a && !a.broken, needsReconnect: !!a?.broken, connectedAt: a?.connectedAt ?? null, lastSync: s.lastOk ?? null, latest: s.latest ?? null, error: s.error ?? null };
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
      // Opening the app pulls, but not more than once a minute.
      if ((await this.status()).connected && !(s.lastRun && this.now() - s.lastRun < 60_000)) await this.pull();
      return json(await this.status());
    }
    if (path === "data") {
      const from = Number(url.searchParams.get("from")) || this.now() - DAY, to = Number(url.searchParams.get("to")) || this.now();
      const hr: HrMinute[] = [];
      for (let d = from - (from % DAY); d <= to; d += DAY) for (const m of (await this.storage.get<HrMinute[]>(`hr:${utcDay(d)}`)) ?? []) if (m[0] >= from && m[0] <= to) hr.push(m);
      const sleep = ((await this.storage.get<SleepSession[]>("sleep")) ?? []).filter((s) => s.end >= from - DAY && s.start <= to);
      return json({ hr, sleep, rhr: (await this.storage.get("rhr")) ?? {}, hrv: (await this.storage.get("hrv")) ?? {}, ...(await this.status()) });
    }
    if (path === "disconnect") {
      const a = await this.auth();
      if (a) await this.f(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(a.refresh)}`, { method: "POST" }).catch(() => null);
      for (const k of ["auth", "sync", "sleep", "rhr", "hrv"]) await this.storage.delete(k);
      for (let d = 0; d <= KEEP_DAYS; d++) await this.storage.delete(`hr:${utcDay(this.now() - d * DAY)}`);
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
