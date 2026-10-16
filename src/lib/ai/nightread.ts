/**
 * Which day the night read-back is about, and what to call it (owner, 16 Oct, after the morning read took yesterday for
 * today: "do 2" — the same check around midnight). A day's evening runs to 04:00: a beer at 00:40 belongs to the evening
 * it was drunk in (the Sleep page's nights already count it that way), and past midnight it's still "tonight". Pure.
 */

import { addDays, atMinute, dayLabel, localDay } from "../time";

const H = 3_600_000;
/** The evening ends at 04:00; read-backs from 21:00; the next morning's catch-up until noon. */
export const NIGHT = { dayEnds: 4, from: 21, catchUpUntil: 12 } as const;

/** The day an evening moment belongs to: 00:40 on the 16th is the 15th's evening. */
export const eveningOf = (t: number) => localDay(t - NIGHT.dayEnds * H);
/** A day for the read-back: 04:00 to 04:00 the next morning. */
export const dayWindow = (day: string): [number, number] => [atMinute(day, NIGHT.dayEnds * 60), atMinute(addDays(day, 1), NIGHT.dayEnds * 60)];

/**
 * The day to read back now, or null. Tonight from 21:00, and past midnight until 04:00 it's still tonight; from 04:00
 * until noon, yesterday's if it wasn't read back (the app wasn't opened that evening). `logged`: anything in that day.
 */
export function nightDue(now: number, done: string | undefined, logged: (day: string) => boolean): string | null {
  const h = new Date(now).getHours();
  if (h >= NIGHT.from || h < NIGHT.dayEnds) { const eve = eveningOf(now); return done !== eve && logged(eve) ? eve : null; }
  if (h >= NIGHT.catchUpUntil) return null;
  const today = localDay(now), yesterday = addDays(today, -1);
  return done !== yesterday && done !== today && logged(yesterday) ? yesterday : null;
}

/** How the read-back names its day, for the AI's header and the card. */
export function dayWord(day: string, now: number): { label: string; when: "today" | "tonight, past midnight" | "yesterday" | "earlier" } {
  const today = localDay(now);
  const when = day === today ? "today" : day === eveningOf(now) ? "tonight, past midnight" : day === addDays(today, -1) ? "yesterday" : "earlier";
  return { label: dayLabel(atMinute(day, 720)), when };
}
