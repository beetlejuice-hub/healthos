/**
 * Which day the night read-back is about, and what to call it (owner, 16 Oct, after the morning read took yesterday for
 * today: "do 2" — the same check around midnight). A day's evening runs to 04:00: a beer at 00:40 belongs to the evening
 * it was drunk in (the Sleep page's nights already count it that way), and past midnight it's still "tonight". Pure.
 */

import { addDays, atMinute, dayLabel, localDay } from "../time";
import { macrosOf } from "../nutrition";
import type { Entry } from "../types";

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

/**
 * A day's food and drinks, everything logged for it (04:00 to 04:00) — a dinner logged at 21:30 with the "Dinner · 19:00"
 * chip, or a late snack timed for 22:00, counts as soon as it's logged, as on Today.
 */
export function dayTotals(entries: Entry[], day: string): { kcal: number; p: number } {
  const [from, to] = dayWindow(day);
  let kcal = 0, p = 0;
  for (const e of entries) if (e.at >= from && e.at < to) { const m = macrosOf(e); if (m) { kcal += m.kcal; p += m.p; } }
  return { kcal: Math.round(kcal), p: Math.round(p) };
}

/** How far a read's food numbers are from the day as logged now: enough to say so, and enough to write it again. */
export const STALE = { kcal: 100, p: 10, redoKcal: 300, redoP: 20, redoAfterMin: 30, redoMax: 1 } as const;

/**
 * The night read against what's logged now (owner, 28 Oct: "i ate around 1900 kcal (160 left), yet ai digest says i ate
 * 650 something"): written at 21:09 from 671 kcal, dinner logged after it with the 19:00 chip — the old check only looked
 * for entries timed after the read, so it never said. Null when it still holds. A read from before `tot` was kept: stale
 * when anything with calories is timed after it (the old rule).
 */
export function nightStale(n: { day: string; at: number; tot?: { kcal: number; p: number }; summary?: string }, entries: Entry[]):
  { now: { kcal: number; p: number }; kcal: number; p: number; redo: boolean } | null {
  const now = dayTotals(entries, n.day);
  const then = n.tot ?? saidIn(n.summary) ?? dayTotals(entries.filter((e) => e.at <= n.at), n.day);
  const kcal = now.kcal - then.kcal, p = now.p - then.p;
  if (Math.abs(kcal) < STALE.kcal && Math.abs(p) < STALE.p) return null;
  return { now, kcal, p, redo: Math.abs(kcal) >= STALE.redoKcal || Math.abs(p) >= STALE.redoP };
}

/** A read written before `tot` was kept: the totals it states ("671 kcal and 58 g protein"), the app's own numbers then. */
function saidIn(summary: string | undefined): { kcal: number; p: number } | null {
  const k = summary?.match(/(\d{1,2},\d{3}|\d{2,4}) kcal/), p = summary?.match(/(\d{1,3}) ?g (?:of )?protein/);
  return k ? { kcal: Number(k[1].replace(",", "")), p: p ? Number(p[1]) : 0 } : null;
}
