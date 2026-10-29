/**
 * Apple Health in, the app's side (PLAN 184): the key for the Shortcut, and what came — pulled on open, when the app
 * comes back, and every 15 minutes. Weight + body fat become weigh-ins (lib/healthimport), only once this phone has
 * what the account already holds (a weigh-in you typed on the other phone isn't doubled). The samples stay on the Worker.
 */

import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import { act, getState } from "./store";
import { onSyncSettled, syncSettled } from "./session";
import { weighInsToAdd, type HealthSample } from "./healthimport";

export type HealthLast = { at: number; types: string[]; /** a field that came but was left out, and why */ skipped?: Record<string, string> } | null;
/** "off": the server can't take it (503). null: not asked yet. */
/** `fail`: the last try that didn't work, with what came — shown in Settings until a good one. */
type State = { samples: HealthSample[]; last: HealthLast; fail: { at: number; error: string } | null; key: boolean | null; off: boolean };

let state: State = { samples: [], last: null, fail: null, key: null, off: false };
const subs = new Set<() => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };

async function api<T>(op: string, post = false): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(`/api/health/${op}`, { method: post ? "POST" : "GET", headers: { "content-type": "application/json", ...(data.session ? { authorization: `Bearer ${data.session.access_token}` } : {}) }, body: post ? "{}" : undefined });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (r.status === 503) { set({ off: true }); throw new Error(j.error ?? "Apple Health isn't set up on the server"); }
  if (!r.ok) throw new Error(j.error ?? `server answered ${r.status}`);
  return j;
}

/** What came, made into weigh-ins: once this phone has synced (else when it has). */
function apply() {
  const run = () => {
    const s = getState(), r = weighInsToAdd(state.samples, s.entries, s.settings.healthUntil ?? 0);
    if (r.add.length) act.importEntries(r.add);
    for (const f of r.fat) act.updateEntry(f.id, { fatPct: f.fatPct });
    if (r.until > (s.settings.healthUntil ?? 0)) act.setSettings({ healthUntil: r.until });
  };
  if (syncSettled()) run();
  else { const off = onSyncSettled(() => { off(); run(); }); }
}

export async function refreshHealth(): Promise<void> {
  try {
    const d = await api<{ samples: HealthSample[]; last: HealthLast; fail?: State["fail"]; key: boolean }>("data");
    set({ samples: d.samples ?? [], last: d.last ?? null, fail: d.fail ?? null, key: !!d.key });
    apply();
  } catch { /* offline or not set up: Settings says so */ }
}

/** A new key for the Shortcut (the old one stops working). */
export async function newHealthKey(): Promise<{ key: string; url: string }> {
  const r = await api<{ key: string; url: string }>("key", true);
  set({ key: true });
  return r;
}

export function useHealth(): State {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => state);
}

let started = false;
export function startHealth(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  void refreshHealth();
  setInterval(() => { if (document.visibilityState === "visible") void refreshHealth(); }, 15 * 60_000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void refreshHealth(); });
}
