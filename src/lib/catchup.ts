/**
 * The morning catch-up on Today (owner, 9 Oct: "At morning the next day it should ask thing at today page things like did
 * u take magnesium (supp), and other things i did not log that day but shouldve done"): what yesterday is missing, judged
 * by your own habits — never a rule from outside. Pure; components/CatchUp.tsx asks.
 *
 *  - a supplement in your stack with no answer for one of its slots yesterday (one you've been ticking, not paused);
 *  - a drink you log on most days (coffee) with none yesterday — answered with your usual one at your usual time;
 *  - a meal you log on most days (lunch, dinner) with nothing in its hours yesterday — that one needs Log.
 */

import { answerSlot, SLOTS, slotsOf, type Entry, type EntryOf, type Slot, type Supplement } from "./types";
import { addDays, atMinute, localDay, minuteOfDay } from "./time";

/** Days looked back over to learn what's usual (before yesterday). */
export const HABIT_DAYS = 14;
/** A thing is a habit when it's on this share of the days you logged anything, and on at least HABIT_MIN days. */
export const HABIT_SHARE = 0.6, HABIT_MIN = 5;
export type Meal = "breakfast" | "lunch" | "dinner";
const MEALS: [Meal, number, number][] = [["breakfast", 0, 11 * 60], ["lunch", 11 * 60, 16 * 60], ["dinner", 16 * 60, 24 * 60]];

export type Gap =
  | { kind: "supp"; key: string; suppId: string; name: string; slot: Slot; slotName: string; at: number }
  | { kind: "drink"; key: string; name: string; at: number; usual: Omit<EntryOf<"drink">, "id" | "at">; days: number; of: number }
  | { kind: "meal"; key: string; meal: Meal; days: number; of: number };

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

export function yesterdayGaps(entries: Entry[], supplements: Supplement[], today: string): Gap[] {
  const yday = addDays(today, -1), from = addDays(yday, -HABIT_DAYS);
  const on = (d: string) => entries.filter((e) => localDay(e.at) === d);
  const ys = on(yday), past = entries.filter((e) => { const d = localDay(e.at); return d >= from && d < yday; });
  const logged = new Set(past.map((e) => localDay(e.at))), n = logged.size, gaps: Gap[] = [];
  // Supplements: every slot of every one you're taking and have ticked before.
  for (const s of supplements) {
    if (!s.active || s.status === "out" || s.status === "stopped") continue;
    if (!entries.some((e) => e.kind === "supp" && e.suppId === s.id && localDay(e.at) < yday)) continue;
    for (const slot of slotsOf(s)) {
      if (ys.some((e) => e.kind === "supp" && e.suppId === s.id && answerSlot(e, s) === slot)) continue;
      const sl = SLOTS.find((x) => x.id === slot)!;
      gaps.push({ kind: "supp", key: `supp:${s.id}:${slot}:${yday}`, suppId: s.id, name: s.name, slot, slotName: sl.name.toLowerCase(), at: atMinute(yday, slot === s.slot ? s.at : sl.at) });
    }
  }
  if (n >= HABIT_MIN) {
    // Drinks you have most days: by name, the latest one as "your usual", at the middle of your first-of-the-day times.
    const byName = new Map<string, EntryOf<"drink">[]>();
    for (const e of past) if (e.kind === "drink") byName.set(e.name, [...(byName.get(e.name) ?? []), e]);
    for (const [name, list] of byName) {
      const days = new Set(list.map((e) => localDay(e.at)));
      if (days.size < HABIT_MIN || days.size / n < HABIT_SHARE || ys.some((e) => e.kind === "drink" && e.name === name)) continue;
      const firsts = [...days].map((d) => Math.min(...list.filter((e) => localDay(e.at) === d).map((e) => minuteOfDay(e.at))));
      const { id: _id, at: _at, ...usual } = list.reduce((a, b) => (b.at > a.at ? b : a));
      gaps.push({ kind: "drink", key: `drink:${name}:${yday}`, name, at: atMinute(yday, Math.round(median(firsts))), usual, days: days.size, of: n });
    }
    // Meals you log most days, by when they're eaten.
    for (const [meal, a, b] of MEALS) {
      const inMeal = (e: Entry) => e.kind === "food" && minuteOfDay(e.at) >= a && minuteOfDay(e.at) < b;
      const days = new Set(past.filter(inMeal).map((e) => localDay(e.at)));
      if (days.size < HABIT_MIN || days.size / n < HABIT_SHARE || ys.some(inMeal)) continue;
      gaps.push({ kind: "meal", key: `meal:${meal}:${yday}`, meal, days: days.size, of: n });
    }
  }
  return gaps;
}
