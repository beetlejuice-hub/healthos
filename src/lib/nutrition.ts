/**
 * Calories and macros per day, against goals.
 *
 * **A day with nothing logged is not a 0 kcal day.** Owner: *"if it's clearly not logged … it can
 * be removed from data, so a 0 kcal day does not mess up."* Averages count logged days only, and
 * always say how many that was.
 */

import type { Entry, Macros } from "./types";
import { localDay } from "./time";

export const ZERO: Macros = { kcal: 0, p: 0, c: 0, f: 0 };

export const add = (a: Macros, b: Macros): Macros => ({ kcal: a.kcal + b.kcal, p: a.p + b.p, c: a.c + b.c, f: a.f + b.f });

/** Macros for `grams` of a food given per 100 g. */
export const forGrams = (per100: Macros, grams: number): Macros => {
  const k = grams / 100;
  return { kcal: per100.kcal * k, p: per100.p * k, c: per100.c * k, f: per100.f * k };
};

/** What one entry contributes. Drinks count their calories (beer, juice), nothing else. */
export function macrosOf(e: Entry): Macros | null {
  if (e.kind === "food") return e.macros;
  if (e.kind === "drink") return e.kcal > 0 ? { kcal: e.kcal, p: e.p ?? 0, c: e.c ?? 0, f: e.f ?? 0 } : null;
  return null;
}

export type DayIntake = { day: string; totals: Macros; logged: boolean; items: number };

/** Totals per local day. A day is "logged" when at least one food was logged on it. */
export function byDay(entries: Entry[]): Map<string, DayIntake> {
  const out = new Map<string, DayIntake>();
  for (const e of entries) {
    const m = macrosOf(e);
    if (!m) continue;
    const day = localDay(e.at);
    const cur = out.get(day) ?? { day, totals: ZERO, logged: false, items: 0 };
    out.set(day, { day, totals: add(cur.totals, m), logged: cur.logged || e.kind === "food", items: cur.items + 1 });
  }
  return out;
}

/** Share of calories from protein / carbs / fat, 0–1 each. */
export function split(m: Macros): { p: number; c: number; f: number } {
  const total = m.p * 4 + m.c * 4 + m.f * 9;
  if (total <= 0) return { p: 0, c: 0, f: 0 };
  return { p: (m.p * 4) / total, c: (m.c * 4) / total, f: (m.f * 9) / total };
}
