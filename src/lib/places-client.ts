/**
 * Places on their own, the app's side (PLAN 212): Overland's key and setup link, and each day's places pulled from the
 * Worker — on open, when the app comes back, and every 30 minutes — into imports.places, beside any Timeline file you
 * brought in (the newer wins a day; your names for places stay). Written only when something new came.
 */

import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import { act, getState } from "./store";
import type { Places } from "./timeline";

type Last = { at: number; n: number } | null;
type State = { key: boolean | null; last: Last; points: number; off: boolean; error: string | null };
let state: State = { key: null, last: null, points: 0, off: false, error: null };
const subs = new Set<() => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };

async function api<T>(op: string, post = false): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(`/api/places/${op}`, { method: post ? "POST" : "GET", headers: { "content-type": "application/json", "x-tz": String(new Date().getTimezoneOffset()), ...(data.session ? { authorization: `Bearer ${data.session.access_token}` } : {}) }, body: post ? "{}" : undefined });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (r.status === 503) { set({ off: true }); throw new Error(j.error ?? "places aren't set up on the server"); }
  if (!r.ok) throw new Error(j.error ?? `server answered ${r.status}`);
  return j;
}

/** Fold the Worker's days into what the app holds. */
export function mergePlaces(prev: NonNullable<ReturnType<typeof getState>["imports"]["places"]> | undefined, got: Places, at: number) {
  const days = { ...(prev?.days ?? {}), ...got.days }, ds = Object.keys(days).sort();
  return { days, top: got.top.length ? got.top : prev?.top ?? [], home: got.home ?? prev?.home ?? null, names: prev?.names ?? {}, at, from: ds[0], to: ds[ds.length - 1], auto: at };
}

export async function refreshPlaces(): Promise<void> {
  try {
    const d = await api<{ key: boolean; last: Last; places: Places | null; points: number }>("data");
    set({ key: d.key, last: d.last, points: d.points, error: null });
    const prev = getState().imports.places;
    if (d.places && d.last && (prev?.auto ?? 0) < d.last.at) act.setImports({ places: mergePlaces(prev, d.places, d.last.at) });
  } catch (e) { set({ error: (e as Error).message }); }
}

/** A new key and Overland's setup link (the old key stops working). */
export async function newPlacesKey(): Promise<{ key: string; url: string; setup: string }> {
  const r = await api<{ key: string; url: string; setup: string }>("key", true);
  set({ key: true });
  return r;
}

export function usePlaces(): State {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => state);
}

let started = false;
export function startPlaces(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  void refreshPlaces();
  setInterval(() => { if (document.visibilityState === "visible" && state.key !== false) void refreshPlaces(); }, 30 * 60_000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && state.key !== false) void refreshPlaces(); });
}
