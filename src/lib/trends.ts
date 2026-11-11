/**
 * Every trend (PLAN 207; owner, 11 Nov, on round 3 of the Insights canvas: "i like charts that show a trend. like lots of
 * data and the average is trending up or down … nice letsgo. build all"). For each measure over a range (30 days, 90 days,
 * a year): every day's value, the 7-day average under it, and which way it has gone over the range — the straight line
 * through every day, "moved" only when its slope is clearly not flat (twice its standard error) and the change it makes
 * is more than a third of the day-to-day spread; better or worse by which way is better for that measure. Pure.
 */

import { addDays } from "./time";

export type Measure = { key: string; name: string; unit: string; /** +1 more is better, −1 less is better, 0 neither */ better: 1 | -1 | 0; series: Record<string, number> };
export type Trend = {
  key: string; name: string; unit: string;
  /** the range's days with a value, oldest first; `i` is the day's place in the range (0 = its first day) */
  days: { day: string; i: number; v: number }[];
  /** the 7-day average (the days that have a value in the 7 ending that day), from the first day it exists */
  avg: { day: string; i: number; v: number }[];
  /** `delta`: the change along the line over the range */ first: number; now: number; delta: number; sd: number; lo: number; hi: number;
  moved: boolean; way: "up" | "down" | "flat"; tone: "better" | "worse" | "steady";
};

export const TRENDS = { avgDays: 7, minDays: 5, moveSd: 0.35, ranges: [30, 90, 365] as const } as const;

/** One measure over the `n` days ending `today`; null with fewer than TRENDS.minDays values in it. */
export function trendOf(m: Measure, today: string, n: number): Trend | null {
  const from = addDays(today, -(n - 1)), days: Trend["days"] = [], avg: Trend["avg"] = [];
  for (let i = 0; i < n; i++) {
    const day = addDays(from, i), v = m.series[day];
    if (v != null && Number.isFinite(v)) days.push({ day, i, v });
    const w: number[] = [];
    for (let k = 0; k < TRENDS.avgDays; k++) { const x = m.series[addDays(day, -k)]; if (x != null && Number.isFinite(x)) w.push(x); }
    if (w.length) avg.push({ day, i, v: w.reduce((a, b) => a + b, 0) / w.length });
  }
  if (days.length < TRENDS.minDays || !avg.length) return null;
  const vs = days.map((d) => d.v), mean = vs.reduce((a, b) => a + b, 0) / vs.length;
  const sd = Math.sqrt(vs.reduce((a, b) => a + (b - mean) ** 2, 0) / vs.length);
  // the change is the straight line through every day, not first week against last: two weeks' averages differ by
  // chance more often than not. Moved: the line's slope is twice its standard error from flat, and the change it makes
  // over the range is more than a third of the day-to-day spread.
  const mi = days.reduce((a, d) => a + d.i, 0) / days.length;
  let sxy = 0, sxx = 0; for (const d of days) { sxy += (d.i - mi) * (d.v - mean); sxx += (d.i - mi) ** 2; }
  const slope = sxx ? sxy / sxx : 0, resid = days.reduce((a, d) => a + (d.v - mean - slope * (d.i - mi)) ** 2, 0);
  const se = sxx && days.length > 2 ? Math.sqrt(resid / (days.length - 2) / sxx) : Infinity;
  const span = days[days.length - 1].i - days[0].i, delta = slope * span, first = avg[0].v, now = avg[avg.length - 1].v;
  const moved = Math.abs(slope) > 2 * se && (sd > 0 ? Math.abs(delta) > TRENDS.moveSd * sd : delta !== 0);
  const way = !moved ? "flat" : delta > 0 ? "up" : "down";
  const tone = !moved || m.better === 0 ? "steady" : (delta > 0 ? 1 : -1) === m.better ? "better" : "worse";
  return { key: m.key, name: m.name, unit: m.unit, days, avg, first, now, delta, sd, lo: Math.min(...vs), hi: Math.max(...vs), moved, way, tone };
}

/** How many are getting better, slipping, steady. */
export function tally(ts: Trend[]): { better: number; worse: number; steady: number } {
  return { better: ts.filter((t) => t.tone === "better").length, worse: ts.filter((t) => t.tone === "worse").length, steady: ts.filter((t) => t.tone === "steady").length };
}
