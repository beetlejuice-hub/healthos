/**
 * Cardio fitness: VO2 max from the band (PLAN 52; owner, 21 Oct: "do 1" — VO2 max as a trend on the Heart page). Google's
 * daily value is Fitbit's cardio fitness score: millilitres of oxygen a minute per kg of body weight. It moves slowly, so
 * the trend is a week against a week — the median of the last 7 days against the median of the same 7 days 4 and 8 weeks
 * back, 3 values each at least. Under 1 either way is "steady": Fitbit shows it in whole numbers and a single point is
 * within its day-to-day wobble.
 *
 * Per kg: losing weight raises it with no change in fitness (owner's goal: lose fat, keep muscle). With weights logged
 * near both weeks, the change is split — what it would be at the same weight (the oxygen your body uses, litres a minute,
 * over the old weight) and the rest, which goes with the kilos lost. Pure.
 */

import { addDays, localDay } from "./time";
import type { Entry } from "./types";

export type Vo2Day = { v: number; level?: string; est?: boolean };
export type Vo2Change = { weeks: 4 | 8; delta: number; word: "up" | "down" | "steady"; then: number; sameKg: number | null; kgLost: number | null };
export type Vo2Trend = { day: string; now: number; level: string | null; est: boolean; changes: Vo2Change[]; line: string };

export const VO2 = { steady: 1, days: 7, min: 3, kgNear: 10, kgMin: 0.5 } as const;
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const r1 = (v: number) => Math.round(v * 10) / 10;
const sgn = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(r1(v)).toFixed(1)}`;

/** Your logged weights by day (the last of a day), for the per-kg split. */
export function kgByDay(entries: Entry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) if (e.kind === "weight") out[localDay(e.at)] = e.kg;
  return out;
}

/** Google's level ("VERY_GOOD") in words ("very good"); null for none. */
export const levelWords = (l?: string | null) => (l && l !== "CARDIO_FITNESS_LEVEL_UNSPECIFIED" ? l.toLowerCase().replace(/_/g, " ") : null);

/** The median of the values in the 7 days ending `end`, with how many there were; null under 3. */
export function vo2Week(rec: Record<string, Vo2Day>, end: string): { v: number; n: number } | null {
  const from = addDays(end, -(VO2.days - 1));
  const v = Object.entries(rec).filter(([d, x]) => d >= from && d <= end && x.v > 10 && x.v < 100).map(([, x]) => x.v);
  return v.length >= VO2.min ? { v: median(v), n: v.length } : null;
}
/** Your weight around `day`: the median of what was logged within 10 days of it. */
function kgNear(kg: Record<string, number>, day: string): number | null {
  const v = Object.entries(kg).filter(([d]) => d >= addDays(day, -VO2.kgNear) && d <= addDays(day, VO2.kgNear)).map(([, x]) => x);
  return v.length ? median(v) : null;
}

/** Where your cardio fitness stands on `today` and how it moved over 4 and 8 weeks; null under 3 values in the last week. */
export function vo2Trend(rec: Record<string, Vo2Day> | undefined, today: string, kg: Record<string, number> = {}): Vo2Trend | null {
  const all = rec ?? {}, cur = vo2Week(all, today);
  if (!cur) return null;
  const lastDay = Object.keys(all).filter((d) => d <= today).sort().at(-1)!, last = all[lastDay];
  const kNow = kgNear(kg, addDays(today, -3));
  const changes: Vo2Change[] = [];
  for (const weeks of [4, 8] as const) {
    const end = addDays(today, -7 * weeks), was = vo2Week(all, end);
    if (!was) continue;
    const delta = cur.v - was.v, kThen = kgNear(kg, addDays(end, -3));
    // the same oxygen a minute over the old weight: what's left of the change once the kilos are taken out
    const split = kNow != null && kThen != null && Math.abs(kThen - kNow) >= VO2.kgMin;
    changes.push({ weeks, delta, then: was.v, word: Math.abs(delta) < VO2.steady ? "steady" : delta > 0 ? "up" : "down",
      sameKg: split ? (cur.v * kNow!) / kThen! - was.v : null, kgLost: split ? kThen! - kNow! : null });
  }
  const lv = levelWords(last.level), c = changes.at(-1);
  const how = !c ? "Not enough weeks yet to say which way it's going."
    : `${c.word === "steady" ? `Steady over ${c.weeks} weeks (${sgn(c.delta)})` : `${sgn(c.delta)} over ${c.weeks} weeks, ${c.word === "up" ? "rising" : "falling"}`}${c.sameKg != null
      ? ` — at the same weight ${sgn(c.sameKg)}; the rest goes with the ${Math.abs(r1(c.kgLost!)).toFixed(1)} kg ${c.kgLost! > 0 ? "lost" : "gained"} (it's per kg)` : ""}.`;
  // "this week": the median of the last 7 days, not today's dot (they differ by the day's wobble)
  const line = `VO2 max this week ${r1(cur.v).toFixed(1)}${lv ? ` — ${lv} for your age (Fitbit's level)` : ""}. ${how}${last.est ? " Google marks the latest as an estimate." : ""}`;
  return { day: lastDay, now: cur.v, level: lv, est: !!last.est, changes, line };
}
