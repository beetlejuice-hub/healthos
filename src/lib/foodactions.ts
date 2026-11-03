/**
 * What pressing and holding a logged food or drink can do to it (owner, 3 Nov: "I should be able to delete or change my
 * logged food, maybe we can do long press and add options there or swipe"): a different amount — everything it counts
 * scales with it — another time that day, the same again now. Pure: each returns the change, the screen applies it.
 */

import type { Entry, EntryOf } from "./types";
import { atMinute, localDay } from "./time";

export type Logged = EntryOf<"food"> | EntryOf<"drink">;

/** The amounts offered, against what's logged now. */
export const AMOUNTS: { k: number; label: string }[] = [
  { k: 0.5, label: "½" }, { k: 0.75, label: "¾" }, { k: 1.25, label: "1¼" }, { k: 1.5, label: "1½" }, { k: 2, label: "2×" },
];

const r1 = (v: number) => Math.round(v * 10) / 10;

/** The entry at `k` times its amount: grams or ml, and everything counted from them. Null for a factor that makes no sense. */
export function scaled(e: Logged, k: number): Partial<Entry> | null {
  if (!Number.isFinite(k) || k <= 0 || k > 20) return null;
  if (e.kind === "food") {
    const m = e.macros;
    return { grams: r1(e.grams * k), macros: { ...m, kcal: Math.round(m.kcal * k), p: r1(m.p * k), c: r1(m.c * k), f: r1(m.f * k) }, ...(e.count != null ? { count: Math.round(e.count * k * 100) / 100 } : {}) } as Partial<Entry>;
  }
  return { ml: Math.round(e.ml * k), caffeineMg: Math.round(e.caffeineMg * k), alcoholG: r1(e.alcoholG * k), kcal: Math.round(e.kcal * k),
    ...(e.p != null ? { p: r1(e.p * k) } : {}), ...(e.c != null ? { c: r1(e.c * k) } : {}), ...(e.f != null ? { f: r1(e.f * k) } : {}) } as Partial<Entry>;
}

/** Grams (or ml) typed in: the same as a factor of what's logged. Null for nothing usable, or a logged amount of 0. */
export function toAmount(e: Logged, typed: string): Partial<Entry> | null {
  const v = Number(typed.replace(",", ".").trim());
  const now = e.kind === "food" ? e.grams : e.ml;
  if (!typed.trim() || !Number.isFinite(v) || v <= 0 || !now) return null;
  return scaled(e, v / now);
}

/** Another time the same day ("13:05"): the new moment, or null for a time that isn't one. */
export function atTime(e: Logged, hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return atMinute(localDay(e.at), +m[1] * 60 + +m[2]);
}

/** The same again, now: a new entry (its own id comes from the store). */
export function again(e: Logged, now: number): Omit<Logged, "id"> {
  const { id: _id, ...rest } = e;
  return { ...rest, at: now };
}
