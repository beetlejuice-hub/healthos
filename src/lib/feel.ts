/**
 * Feeling ratings: only what you touch is logged (owner: "if I change stress, it should not log
 * energy how it was left last time"). Touches close together join one rating.
 */

import type { Entry, EntryOf } from "./types";
import { MIN } from "./time";

export type FeelKey = "energy" | "mood" | "focus" | "stress";
export const FEEL_KEYS: FeelKey[] = ["energy", "mood", "focus", "stress"];
/** Touches within this long of the last rating join it instead of starting a new one. */
export const JOIN_MS = 10 * MIN;

/** What a touch should do: update the open rating, or start a new one with just this value. */
export function feelChange(entries: Entry[], now: number, k: FeelKey, v: number):
  { op: "update"; id: string; patch: Partial<EntryOf<"feel">> } | { op: "add"; entry: Omit<EntryOf<"feel">, "id"> } {
  const open = latestFeel(entries);
  if (open && now - open.at < JOIN_MS && now >= open.at) return { op: "update", id: open.id, patch: { [k]: v } };
  return { op: "add", entry: { kind: "feel", at: now, [k]: v } };
}

export const latestFeel = (entries: Entry[]) =>
  entries.reduce<EntryOf<"feel"> | undefined>((best, e) => (e.kind === "feel" && (!best || e.at > best.at) ? e : best), undefined);

/** For each slider: the value in the open rating (logged now), else the last value ever given. */
export function feelState(entries: Entry[], now: number): Record<FeelKey, { now?: number; last?: { v: number; at: number } }> {
  const open = latestFeel(entries);
  const joined = open && now - open.at < JOIN_MS ? open : undefined;
  const feels = entries.filter((e): e is EntryOf<"feel"> => e.kind === "feel").sort((a, b) => b.at - a.at);
  const out = {} as Record<FeelKey, { now?: number; last?: { v: number; at: number } }>;
  for (const k of FEEL_KEYS) {
    const prev = feels.find((f) => f[k] != null);
    out[k] = { now: joined?.[k], last: prev ? { v: prev[k]!, at: prev.at } : undefined };
  }
  return out;
}
