/**
 * Your real daily burn (TDEE), learned from two things you already log: what you eat and what you
 * weigh. If you ate 2,900 kcal a day for four weeks and your weight trend rose 0.25 kg a week,
 * you burned about 2,900 − 0.25 × 7,700 / 7 ≈ 2,625 kcal a day. No formula guessing from age and
 * height — it's measured on you, with its uncertainty.
 *
 * The scale bounces ±0.5 kg day to day (water, salt, food in the gut), so the weight *trend* is a
 * straight-line fit over the window, not two readings subtracted.
 */

import type { Entry } from "./types";
import { byDay } from "./nutrition";
import { mean, median, sd } from "./stats";
import { addDays, localDay } from "./time";

/** Energy in 1 kg of body mass change (mixed fat and lean), the standard working figure. */
export const KCAL_PER_KG = 7700;

export type BodyDay = { day: string; kcal: number | null; kg: number | null };

/** One row per calendar day in [fromDay, toDay]: logged kcal (null = not logged) and weight. */
export function bodyDays(entries: Entry[], fromDay: string, toDay: string): BodyDay[] {
  const intake = byDay(entries);
  const kgs = new Map<string, number[]>();
  for (const e of entries) if (e.kind === "weight") { const d = localDay(e.at); kgs.set(d, [...(kgs.get(d) ?? []), e.kg]); }
  const out: BodyDay[] = [];
  for (let d = fromDay; d <= toDay; d = addDays(d, 1)) {
    const x = intake.get(d), w = kgs.get(d);
    out.push({ day: d, kcal: x?.logged ? x.totals.kcal : null, kg: w ? mean(w) : null });
  }
  return out;
}

export type Trend = {
  /** kg per day, and its standard error. */
  perDay: number; se: number;
  n: number; spanDays: number;
  /** The trend line's value on the last day — "trend weight today". */
  nowKg: number;
  /** [day index, kg] of each weigh-in, and the two ends of the fitted line. */
  pts: [number, number][]; fit: [[number, number], [number, number]];
};

export const TREND_MIN = { weighIns: 8, spanDays: 14 };

/** Least-squares line through the weigh-ins. Null until there are enough, spread out enough. */
export function weightTrend(days: BodyDay[]): Trend | null {
  const pts: [number, number][] = days.flatMap((d, i) => (d.kg == null ? [] : [[i, d.kg] as [number, number]]));
  const n = pts.length;
  if (n < TREND_MIN.weighIns) return null;
  const span = pts[n - 1][0] - pts[0][0];
  if (span < TREND_MIN.spanDays - 1) return null;
  const mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1]));
  let sxy = 0, sxx = 0;
  for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
  const b = sxy / sxx, a = my - b * mx;
  const rss = pts.reduce((s, [x, y]) => s + (y - a - b * x) ** 2, 0);
  const se = Math.sqrt(rss / (n - 2) / sxx);
  const last = days.length - 1;
  return { perDay: b, se, n, spanDays: span + 1, nowKg: a + b * last, pts, fit: [[pts[0][0], a + b * pts[0][0]], [last, a + b * last]] };
}

export type Burn = {
  /** Estimated kcal/day, and a 90% range. */
  kcal: number; lo: number; hi: number;
  /** Average logged intake over the full days used. */
  intake: number; days: number;
  /** Days that looked partly logged (under half the usual) and were left out. */
  partial: number;
  trend: Trend;
};

export const BURN_MIN = { foodDays: 14 };

/** Real burn = average intake − weight change in kcal. Null until there's enough of both. */
export function realBurn(days: BodyDay[]): Burn | null {
  const trend = weightTrend(days);
  if (!trend) return null;
  const logged = days.map((d) => d.kcal).filter((k): k is number => k != null);
  const usual = median(logged);
  const full = logged.filter((k) => k >= usual * 0.5);
  if (full.length < BURN_MIN.foodDays) return null;
  const intake = mean(full);
  const kcal = intake - trend.perDay * KCAL_PER_KG;
  const se = Math.sqrt((sd(full) / Math.sqrt(full.length)) ** 2 + (trend.se * KCAL_PER_KG) ** 2);
  const r10 = (v: number) => Math.round(v / 10) * 10;
  return { kcal: r10(kcal), lo: r10(kcal - 1.645 * se), hi: r10(kcal + 1.645 * se), intake, days: full.length, partial: logged.length - full.length, trend };
}
