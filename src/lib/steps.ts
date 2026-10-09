/**
 * Steps from the band (PLAN 66; owner, 9 Oct: "wondering if the data is valuable for us like more walking equals better
 * sleep at night or better mood"). Google sends a count per 5 minutes (lib/band `readSteps`); a window it didn't send
 * means the band was off, not zero steps. So a day only has a total when it was finished, the band sent steps that day,
 * and was on for most of it: heart rate in at least 70 % of the minutes between 08:00 and 21:00. Pure.
 */

import type { HrMinute, StepBucket } from "./band";
import { localDay, MIN, minuteOfDay } from "./time";

/** Steps between `from` and `to`; a window cut by either edge counts by the share of it inside. */
export function stepsIn(steps: StepBucket[], from: number, to: number): number {
  let n = 0;
  for (const [t, min, c] of steps) {
    const end = t + min * MIN;
    if (end <= from || t >= to) continue;
    n += (c * (Math.min(end, to) - Math.max(t, from))) / (end - t);
  }
  return Math.round(n);
}

/** Walking, for "what were you doing": at least this many steps, at this many a minute on average over the stretch. */
export const WALK_STEPS = 400, WALK_PER_MIN = 15;
/** The steps in a stretch when they say you were on the move, else null. */
export function walked(steps: StepBucket[], from: number, to: number): number | null {
  const n = stepsIn(steps, from, to);
  return n >= WALK_STEPS && n / Math.max(1, (to - from) / MIN) >= WALK_PER_MIN ? n : null;
}

export const WORN_SHARE = 0.7;
const DAYTIME = [8 * 60, 21 * 60] as const;

/** Each finished day's steps (days before `today`), for days the band was worn — the rest have no total, never 0. */
export function stepsByDay(steps: StepBucket[], hr: HrMinute[], today: string): Map<string, number> {
  const worn = new Map<string, number>();
  for (const [t] of hr) { const m = minuteOfDay(t); if (m >= DAYTIME[0] && m < DAYTIME[1]) { const d = localDay(t); worn.set(d, (worn.get(d) ?? 0) + 1); } }
  const sum = new Map<string, number>();
  for (const [t, , c] of steps) { const d = localDay(t); if (d < today) sum.set(d, (sum.get(d) ?? 0) + c); }
  const need = WORN_SHARE * (DAYTIME[1] - DAYTIME[0]);
  return new Map([...sum].filter(([d]) => (worn.get(d) ?? 0) >= need));
}

/** Days given with a total, and the middle of them: "more steps than usual" is above it. Null under 8 such days. */
export function usualSteps(byDay: Map<string, number>, days: string[]): number | null {
  const v = [...new Set(days)].flatMap((d) => (byDay.has(d) ? [byDay.get(d)!] : [])).sort((a, b) => a - b);
  if (v.length < 8) return null;
  const h = Math.floor(v.length / 2);
  return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
}
