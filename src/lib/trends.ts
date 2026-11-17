/**
 * Every trend (PLAN 207; owner, 11 Nov, on round 3 of the Insights canvas: "i like charts that show a trend. like lots of
 * data and the average is trending up or down … nice letsgo. build all"). For each measure over a range (30 days, 90 days,
 * a year): every day's value, the 7-day average under it, and which way it has gone over the range — the straight line
 * through every day, "moved" only when its slope is clearly not flat (past its 95 % bar, with the days counted as fewer when they run
 * together, as real days do) and the change it makes
 * is more than a third of the day-to-day spread; better or worse by which way is better for that measure. Pure.
 */

import { tCrit } from "./regress";
import { addDays } from "./time";

export type Measure = { key: string; name: string; unit: string; /** +1 more is better, −1 less is better, 0 neither */ better: 1 | -1 | 0; series: Record<string, number> };
export type Trend = {
  key: string; name: string; unit: string;
  /**
   * the range's days with a value, oldest first; `i` is the day's place in the range (0 = its first day). `tone` (PLAN
   * 215; owner, 12 Nov: "i really liked the red and green dots"): better or worse than your usual — outside the middle
   * half of your days in this range, on the side that's better for this measure — else typical; a measure with no
   * better side is always typical.
   */
  days: { day: string; i: number; v: number; tone: DayTone }[];
  /** Your usual over the range: the middle half of your days (`lo`–`hi`) and the middle day (`mid`). */
  usual: { lo: number; mid: number; hi: number };
  better: 1 | -1 | 0;
  /** the 7-day average (the days that have a value in the 7 ending that day), from the first day it exists */
  avg: { day: string; i: number; v: number }[];
  /** `delta`: the change along the line over the range */ first: number; now: number; delta: number; sd: number; lo: number; hi: number;
  moved: boolean; way: "up" | "down" | "flat"; tone: "better" | "worse" | "steady";
};

export type DayTone = "better" | "worse" | "typical";

/** The value `q` of the way through sorted `xs` (0–1), between neighbours. */
function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b), at = (s.length - 1) * q, lo = Math.floor(at);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (at - lo);
}

/** Better, worse or typical against your usual (`trendOf` says how). */
export function toneOf(v: number, usual: { lo: number; hi: number }, better: 1 | -1 | 0): DayTone {
  if (better === 0 || usual.hi === usual.lo && v === usual.lo) return "typical";
  const side = v > usual.hi ? 1 : v < usual.lo ? -1 : 0;
  return side === 0 ? "typical" : side === better ? "better" : "worse";
}

export const TRENDS = { avgDays: 7, minDays: 5, moveSd: 0.35, ranges: [30, 90, 365] as const } as const;

/** One measure over the `n` days ending `today`; null with fewer than TRENDS.minDays values in it. */
export function trendOf(m: Measure, today: string, n: number): Trend | null {
  const from = addDays(today, -(n - 1)), raw: { day: string; i: number; v: number }[] = [], avg: Trend["avg"] = [];
  for (let i = 0; i < n; i++) {
    const day = addDays(from, i), v = m.series[day];
    if (v != null && Number.isFinite(v)) raw.push({ day, i, v });
    const w: number[] = [];
    for (let k = 0; k < TRENDS.avgDays; k++) { const x = m.series[addDays(day, -k)]; if (x != null && Number.isFinite(x)) w.push(x); }
    if (w.length) avg.push({ day, i, v: w.reduce((a, b) => a + b, 0) / w.length });
  }
  if (raw.length < TRENDS.minDays || !avg.length) return null;
  const vs0 = raw.map((d) => d.v), usual = { lo: quantile(vs0, 0.25), mid: quantile(vs0, 0.5), hi: quantile(vs0, 0.75) };
  const days: Trend["days"] = raw.map((d) => ({ ...d, tone: toneOf(d.v, usual, m.better) }));
  const vs = days.map((d) => d.v), mean = vs.reduce((a, b) => a + b, 0) / vs.length;
  const sd = Math.sqrt(vs.reduce((a, b) => a + (b - mean) ** 2, 0) / vs.length);
  // the change is the straight line through every day, not first week against last: two weeks' averages differ by
  // chance more often than not. Moved: the line's slope is clearly not flat (beyond its 95 % bar, see below), and the change it makes
  // over the range is more than a third of the day-to-day spread.
  const mi = days.reduce((a, d) => a + d.i, 0) / days.length;
  let sxy = 0, sxx = 0; for (const d of days) { sxy += (d.i - mi) * (d.v - mean); sxx += (d.i - mi) ** 2; }
  const slope = sxx ? sxy / sxx : 0, resid = days.reduce((a, d) => a + (d.v - mean - slope * (d.i - mi)) ** 2, 0);
  // Days aren't independent: a good week follows a good week. Measured 17 Nov — on noise that wanders like real days do
  // (lag-1 correlation 0.5), a third of flat measures were called moved; at 0.8, over half. So the standard error
  // counts the days as fewer (effective n = n(1−r)/(1+r), r the lag-1 correlation of what the line leaves over,
  // corrected for its small-sample pull toward 0) and the bar is the t value for that many.
  const e = days.map((d) => d.v - mean - slope * (d.i - mi));
  let c1 = 0, c0 = 0; for (let k = 0; k < e.length; k++) { c0 += e[k] ** 2; if (k && days[k].i === days[k - 1].i + 1) c1 += e[k] * e[k - 1]; }
  const r0 = c0 ? c1 / c0 : 0, r1 = Math.min(0.95, Math.max(0, r0 + (1 + 4 * r0) / days.length));
  const nEff = Math.max(3, days.length * (1 - r1) / (1 + r1));
  const se = sxx && days.length > 2 ? Math.sqrt(resid / (days.length - 2) / sxx) * Math.sqrt(days.length / nEff) : Infinity;
  const bar = tCrit(Math.max(1, nEff - 2));
  const span = days[days.length - 1].i - days[0].i, delta = slope * span, first = avg[0].v, now = avg[avg.length - 1].v;
  const moved = Math.abs(slope) > bar * se && (sd > 0 ? Math.abs(delta) > TRENDS.moveSd * sd : delta !== 0);
  const way = !moved ? "flat" : delta > 0 ? "up" : "down";
  const tone = !moved || m.better === 0 ? "steady" : (delta > 0 ? 1 : -1) === m.better ? "better" : "worse";
  return { key: m.key, name: m.name, unit: m.unit, days, avg, usual, better: m.better, first, now, delta, sd, lo: Math.min(...vs), hi: Math.max(...vs), moved, way, tone };
}

/** How many are getting better, slipping, steady. */
export function tally(ts: Trend[]): { better: number; worse: number; steady: number } {
  return { better: ts.filter((t) => t.tone === "better").length, worse: ts.filter((t) => t.tone === "worse").length, steady: ts.filter((t) => t.tone === "steady").length };
}
