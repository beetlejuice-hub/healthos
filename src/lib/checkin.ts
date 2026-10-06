/**
 * The two-week check-in (owner, 6 Oct — his rule, as written): "Every 2 weeks: losing under 0.3 kg a week:
 * cut 150 kcal. Losing over 0.7 kg a week, or lifts dropping: add 150 kcal." Weight by weekly averages
 * ("weigh yourself most mornings and use the weekly average"): this week's against the week two weeks
 * before. Pure; the card on Today only draws it.
 */

import { addDays, localDay, DAY } from "./time";
import { e1rm } from "./training";

export const CHECKIN = { everyDays: 14, minWeighDays: 3, slowKg: 0.3, fastKg: 0.7, stepKcal: 150, liftDrop: 0.02, minLifts: 2 };

export type Lifts = { compared: number; dropped: string[]; dropping: boolean };
export type CheckIn =
  | { due: false; nextAt: number }
  | { due: true; need: string }
  | { due: true; from: number; to: number; lossPerWeek: number; lifts: Lifts; delta: -150 | 0 | 150; why: string; kcal: number; newKcal: number };

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Average of the per-day averages for the 7 days ending `end` (a day with two weigh-ins counts once). */
function weekAvg(weights: { at: number; kg: number }[], end: string): { avg: number; days: number } | null {
  const days = new Map<string, number[]>();
  const start = addDays(end, -6);
  for (const w of weights) { const d = localDay(w.at); if (d >= start && d <= end) days.set(d, [...(days.get(d) ?? []), w.kg]); }
  return days.size ? { avg: mean([...days.values()].map(mean)), days: days.size } : null;
}

/** Each lift done in both of the last two 2-week blocks: is its best estimated 1RM down by 2% or more? Dropping when most are (2+ lifts). */
export function liftsDropping(sets: { at: number; exercise: string; kg: number; reps: number }[], now: number): Lifts {
  const best = (from: number, to: number) => {
    const m = new Map<string, number>();
    for (const s of sets) if (s.at >= from && s.at < to && s.reps > 0 && s.reps <= 12) m.set(s.exercise, Math.max(m.get(s.exercise) ?? 0, e1rm(s.kg, s.reps)));
    return m;
  };
  const recent = best(now - 14 * DAY, now + 1), before = best(now - 28 * DAY, now - 14 * DAY);
  const both = [...recent.keys()].filter((n) => before.has(n));
  const dropped = both.filter((n) => recent.get(n)! < before.get(n)! * (1 - CHECKIN.liftDrop));
  return { compared: both.length, dropped, dropping: both.length >= CHECKIN.minLifts && dropped.length > both.length / 2 };
}

export function checkIn(weights: { at: number; kg: number }[], sets: { at: number; exercise: string; kg: number; reps: number }[], now: number, kcal: number, lastAt?: number): CheckIn {
  if (lastAt != null && now - lastAt < CHECKIN.everyDays * DAY) return { due: false, nextAt: lastAt + CHECKIN.everyDays * DAY };
  const today = localDay(now);
  const cur = weekAvg(weights, today), prev = weekAvg(weights, addDays(today, -14));
  if (!cur || !prev || cur.days < CHECKIN.minWeighDays || prev.days < CHECKIN.minWeighDays)
    return { due: true, need: `Needs ${CHECKIN.minWeighDays} days with a weigh-in this week and in the week two weeks ago (${cur?.days ?? 0} and ${prev?.days ?? 0} so far).` };
  const lossPerWeek = (prev.avg - cur.avg) / 2;
  const lifts = liftsDropping(sets, now);
  const slow = lossPerWeek < CHECKIN.slowKg, fast = lossPerWeek > CHECKIN.fastKg;
  const rate = lossPerWeek >= 0 ? `losing about ${lossPerWeek.toFixed(2)} kg a week` : `gaining about ${(-lossPerWeek).toFixed(2)} kg a week`;
  let delta: -150 | 0 | 150 = 0, why: string;
  if (slow && lifts.dropping) why = `${rate}, under 0.3, but lifts are dropping too — the two rules cancel out, so keep it`;
  else if (slow) { delta = -150; why = `${rate}, under 0.3 kg`; }
  else if (fast || lifts.dropping) { delta = 150; why = fast ? `${rate}, over 0.7 kg${lifts.dropping ? ", and lifts are dropping" : ""}` : `${rate}, but lifts are dropping`; }
  else why = `${rate}, inside 0.3–0.7 kg${lifts.compared >= CHECKIN.minLifts ? ", and lifts are holding" : ""}`;
  return { due: true, from: prev.avg, to: cur.avg, lossPerWeek, lifts, delta, why, kcal, newKcal: kcal + delta };
}
