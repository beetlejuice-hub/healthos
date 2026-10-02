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

/* ------------------------------------------------------------------ How now? (check-ins) */

/** What you were up to since the last check-in. Built-in tags, in their default order. */
export const DOING: { tag: string; label: string; phrase: string }[] = [
  { tag: "work", label: "work", phrase: "work" },
  { tag: "outside", label: "outside", phrase: "time outside" },
  { tag: "social", label: "friends", phrase: "time with people" },
  { tag: "phone", label: "phone", phrase: "phone time" },
  { tag: "rest", label: "rest", phrase: "rest" },
  { tag: "gym", label: "gym", phrase: "the gym" },
  { tag: "eating", label: "eating", phrase: "a meal" },
  { tag: "commute", label: "commute", phrase: "commuting" },
];
/** How many tags show before "more". */
export const DOING_SHOWN = 5;
/** A check-in is open for adding to (another feeling, what you were up to) this long. */
export const OPEN_MS = JOIN_MS;
/** After this long the check-in asks again; before it, Today shows one calm line. */
export const ASK_AGAIN_MS = 2 * 60 * MIN;

/** Your own tag: one word, lower case, letters/digits/dashes, up to 16 characters; null if nothing usable. */
export function tagOf(word: string): string | null {
  const t = word.trim().toLowerCase().split(/\s+/)[0]?.replace(/[^\p{L}\p{N}-]/gu, "").slice(0, 16) ?? "";
  return t.length >= 2 ? t : null;
}

export const phraseOf = (tag: string) => DOING.find((d) => d.tag === tag)?.phrase ?? tag;
export const labelOf = (tag: string) => DOING.find((d) => d.tag === tag)?.label ?? tag;

/**
 * Tags in the order to show them: the ones you use most first (last 60 days), then the built-in
 * order; your own tags join once used. Plus the ones the app already knows from your logs.
 */
export function doingOrder(entries: Entry[], now: number): string[] {
  const since = now - 60 * 24 * 60 * MIN, count = new Map<string, number>();
  for (const e of entries) if (e.kind === "feel" && e.at >= since) for (const t of e.doing ?? []) count.set(t, (count.get(t) ?? 0) + 1);
  const all = [...new Set([...DOING.map((d) => d.tag), ...count.keys()])];
  const base = (t: string) => { const i = DOING.findIndex((d) => d.tag === t); return i < 0 ? 99 : i; };
  return all.sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0) || base(a) - base(b));
}

/** Tags already true from your logs since the previous check-in: a gym session, a real meal. */
export function inferredDoing(entries: Entry[], workouts: { startedAt: number }[], from: number, to: number): string[] {
  const out: string[] = [];
  if (workouts.some((w) => w.startedAt > from && w.startedAt <= to)) out.push("gym");
  const kcal = entries.reduce((s, e) => (e.kind === "food" && e.at > from && e.at <= to ? s + e.macros.kcal : s), 0);
  if (kcal >= 300) out.push("eating");
  return out;
}

/** The check-in before `open` on the same day (the one this is compared with), if any. */
export function previousCheckIn(entries: Entry[], open: EntryOf<"feel">): EntryOf<"feel"> | undefined {
  const day = new Date(open.at).toDateString();
  return entries
    .filter((e): e is EntryOf<"feel"> => e.kind === "feel" && e.at < open.at - 20 * MIN && new Date(e.at).toDateString() === day)
    .reduce<EntryOf<"feel"> | undefined>((b, e) => (!b || e.at > b.at ? e : b), undefined);
}

/** The small reward: what changed since the last check-in, and what happened in between. Facts only. */
export function sinceLast(entries: Entry[], open: EntryOf<"feel">, workouts: { startedAt: number }[]): { at: number; changes: { k: FeelKey; d: number }[]; between: string[] } | null {
  const prev = previousCheckIn(entries, open);
  if (!prev) return null;
  const changes = FEEL_KEYS.flatMap((k) => (open[k] != null && prev[k] != null ? [{ k, d: open[k]! - prev[k]! }] : []));
  const between = [...new Set([...(open.doing ?? []), ...inferredDoing(entries, workouts, prev.at, open.at)])];
  return { at: prev.at, changes, between };
}
