/**
 * The two-week check-in (owner, 6 Oct — his rule, as written): "Every 2 weeks: losing under 0.3 kg a week:
 * cut 150 kcal. Losing over 0.7 kg a week, or lifts dropping: add 150 kcal." Weight by weekly averages
 * ("weigh yourself most mornings and use the weekly average"): this week's against the week two weeks
 * before. Pure; the card on Today only draws it.
 */

import { addDays, localDay, DAY } from "./time";
import { muscleStrength } from "./liftstrength";
import type { LoggedSet } from "./training";

export const CHECKIN = { everyDays: 14, minWeighDays: 3, slowKg: 0.3, fastKg: 0.7, stepKcal: 150, minLifts: 2 };

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

/**
 * Lifts dropping, judged per muscle (owner, 15 Oct: "ok to 2"): each muscle's 8-week strength trend with its 90% range,
 * as the Training page shows it (lib/liftstrength). Dropping when 2+ muscles are clearly dropping and they're over half of
 * the muscles that read clearly either way. It used to be each lift's best set in the last 2 weeks against the 2 before —
 * one great day early on read as a drop on every lift trained that day.
 */
export function liftsDropping(sets: LoggedSet[], now: number): Lifts {
  const ms = muscleStrength(sets, now), clear = ms.filter((m) => m.state !== "unclear");
  const dropped = ms.filter((m) => m.state === "dropping").map((m) => m.muscle as string);
  return { compared: clear.length, dropped, dropping: dropped.length >= CHECKIN.minLifts && dropped.length > clear.length / 2 };
}

export function checkIn(weights: { at: number; kg: number }[], sets: LoggedSet[], now: number, kcal: number, lastAt?: number): CheckIn {
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
  const weaker = lifts.dropped.join(" and ").toLowerCase();
  if (slow && lifts.dropping) why = `${rate}, under 0.3, but ${weaker} are getting weaker too — the two rules cancel out, so keep it`;
  else if (slow) { delta = -150; why = `${rate}, under 0.3 kg`; }
  else if (fast || lifts.dropping) { delta = 150; why = fast ? `${rate}, over 0.7 kg${lifts.dropping ? `, and ${weaker} are getting weaker` : ""}` : `${rate}, but ${weaker} are getting weaker (8-week trend)`; }
  else why = `${rate}, inside 0.3–0.7 kg${lifts.compared >= CHECKIN.minLifts ? ", and lifts are holding" : ""}`;
  return { due: true, from: prev.avg, to: cur.avg, lossPerWeek, lifts, delta, why, kcal, newKcal: kcal + delta };
}
