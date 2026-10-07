/**
 * The band, the app's side (PLAN 48): connect (via Google's page), and the data the Worker keeps —
 * heart rate per minute, sleep stages, resting HR, HRV — fetched when the app opens and every 15
 * minutes while it's open. Nothing of it is stored on the phone or in Supabase; the Worker holds it.
 */

import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import type { HrMinute, SleepSession } from "./band";

export type BandStatus = { connected: boolean; needsReconnect: boolean; connectedAt: number | null; lastSync: number | null; latest: number | null; error: string | null };
export type BandData = { hr: HrMinute[]; sleep: SleepSession[]; rhr: Record<string, number>; hrv: Record<string, number> };
/** "off": the server has no Google keys (503). null: not asked yet. */
type State = { status: BandStatus | "off" | null; data: BandData | null; loading: boolean };

const DAY = 86_400_000;
/** A week of minutes (~10k points, ~250 kB): what the graph opens on, and a bit to scroll back. */
export const BAND_DAYS = 7;

let state: State = { status: null, data: null, loading: false };
const subs = new Set<() => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };

async function api<T>(op: string, post = false): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(`/api/band/${op}`, { method: post ? "POST" : "GET", headers: { "content-type": "application/json", ...(data.session ? { authorization: `Bearer ${data.session.access_token}` } : {}) }, body: post ? "{}" : undefined });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (r.status === 503) { set({ status: "off" }); throw new Error(j.error ?? "the band isn't set up on the server"); }
  if (!r.ok) throw new Error(j.error ?? `server answered ${r.status}`);
  return j;
}

const pick = (j: BandStatus): BandStatus => ({ connected: j.connected, needsReconnect: j.needsReconnect, connectedAt: j.connectedAt, lastSync: j.lastSync, latest: j.latest, error: j.error });

/** Ask the Worker to pull from Google (at most once a minute; it says no more often), then load the week. */
export async function refreshBand(now = Date.now()): Promise<void> {
  if (state.loading) return;
  set({ loading: true });
  try {
    const s = await api<BandStatus>("status");
    set({ status: pick(s) });
    if (!s.connected) { set({ data: null }); return; }
    set({ status: pick(await api<BandStatus>("sync", true)) });
    const d = await api<BandData & BandStatus>(`data?from=${now - BAND_DAYS * DAY}&to=${now + 60_000}`);
    set({ status: pick(d), data: { hr: d.hr ?? [], sleep: d.sleep ?? [], rhr: d.rhr ?? {}, hrv: d.hrv ?? {} } });
  } catch { /* offline or not set up: the card says so, the graph keeps what it had */ }
  finally { set({ loading: false }); }
}

/** Google's "Allow HealthOS to read…" page. Comes back to #settings/band-ok or band-failed. */
export async function startConnect(): Promise<void> {
  const { url } = await api<{ url: string }>("start", true);
  location.href = url;
}

export async function disconnectBand(): Promise<void> {
  await api("disconnect", true);
  set({ status: { connected: false, needsReconnect: false, connectedAt: null, lastSync: null, latest: null, error: null }, data: null });
}

export function useBand(): State {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => state);
}

/** On app open and every 15 minutes while it's open and visible. */
let started = false;
export function startBand(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  void refreshBand();
  setInterval(() => { if (document.visibilityState === "visible") void refreshBand(); }, 15 * 60_000);
  document.addEventListener("visibilitychange", () => {
    const s = state.status;
    // Back to the app after a while: fresh numbers (the Worker refuses more than one pull a minute).
    if (document.visibilityState === "visible" && s && s !== "off" && s.connected && Date.now() - (s.lastSync ?? 0) > 5 * 60_000) void refreshBand();
  });
}
