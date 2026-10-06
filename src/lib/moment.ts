/**
 * The part of the day Today's Now card is about (owner, 6 Oct, approved design): morning 05:00–10:59
 * (start the day: sleep, weigh-in, morning stack), day 11:00–18:59 (check in), evening 19:00–04:59
 * (before bed: evening stack, caffeine at bed, the day in numbers). Before 05:00 is still last evening,
 * the same cut the check-ins use.
 */

import { macrosOf } from "./nutrition";
import type { Entry } from "./types";

export type Moment = "morning" | "day" | "evening";

export const MOMENT_HOURS = { morning: 5, day: 11, evening: 19 };

export function momentOf(now: number): Moment {
  const h = new Date(now).getHours();
  if (h >= MOMENT_HOURS.morning && h < MOMENT_HOURS.day) return "morning";
  if (h >= MOMENT_HOURS.day && h < MOMENT_HOURS.evening) return "day";
  return "evening";
}

export const MOMENT_TITLE: Record<Moment, string> = { morning: "Start the day", day: "Check in", evening: "Before bed" };

/**
 * The day in numbers for the evening card: what was eaten (food and drinks with calories) and the
 * average mood of today's check-ins. A day starts at 05:00 like everywhere else, so at 01:00 the
 * evening card still sums the day that's ending. Nothing logged → null, never a 0 kcal day.
 */
export function dayNumbers(entries: Entry[], now: number) {
  const start = new Date(now); if (start.getHours() < MOMENT_HOURS.morning) start.setDate(start.getDate() - 1); start.setHours(MOMENT_HOURS.morning, 0, 0, 0);
  const today = entries.filter((e) => e.at >= start.getTime() && e.at <= now);
  const m = today.map(macrosOf).filter((x): x is NonNullable<typeof x> => !!x);
  const moods = today.flatMap((e) => (e.kind === "feel" && e.mood != null ? [e.mood] : []));
  return {
    kcal: m.length ? m.reduce((a, x) => a + x.kcal, 0) : null,
    protein: m.length ? m.reduce((a, x) => a + x.p, 0) : null,
    mood: moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null,
    moodN: moods.length,
  };
}
