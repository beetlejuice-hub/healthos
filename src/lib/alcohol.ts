/**
 * Alcohol in your body, from what you drank.
 *
 * Unlike caffeine, the liver clears alcohol at a roughly **constant rate** (zero-order), about
 * 0.1 g per kg of body weight per hour — so two drinks don't take twice as long to clear as one,
 * they take twice as long *plus* they stack. Each drink is absorbed evenly over
 * `absorbMin` minutes. Stepped simulation, because the constant rate makes the closed form
 * piecewise and easy to get wrong.
 */

import { MIN } from "./time";

export const ETHANOL_DENSITY = 0.789; // g per ml

/** Grams of pure alcohol in `ml` of a drink at `abvPct` %. 500 ml beer at 5% ≈ 19.7 g. */
export const alcoholGrams = (ml: number, abvPct: number) => ml * (abvPct / 100) * ETHANOL_DENSITY;

export type AlcoholDose = { at: number; g: number };

export type AlcoholOpts = { bodyKg?: number; gPerKgPerHour?: number; absorbMin?: number; stepMin?: number };

/** Grams in your body at each step from `from` to `to`. */
export function alcoholCurve(drinks: AlcoholDose[], from: number, to: number, o: AlcoholOpts = {}): [number, number][] {
  const { bodyKg = 78, gPerKgPerHour = 0.1, absorbMin = 30, stepMin = 5 } = o;
  const clearPerStep = bodyKg * gPerKgPerHour * (stepMin / 60);
  const relevant = drinks.filter((d) => d.g > 0).sort((a, b) => a.at - b.at);
  // Start far enough back that a drink before `from` is still being cleared when we get there.
  const start = relevant.length ? Math.min(from, relevant[0].at) : from;
  const out: [number, number][] = [];
  let body = 0;
  for (let t = start; t <= to; t += stepMin * MIN) {
    for (const d of relevant) {
      const a = d.at, b = d.at + absorbMin * MIN;
      const overlap = Math.max(0, Math.min(t + stepMin * MIN, b) - Math.max(t, a));
      body += d.g * (overlap / (absorbMin * MIN));
    }
    body = Math.max(0, body - clearPerStep);
    if (t >= from) out.push([t, body]);
  }
  return out;
}

export function alcoholAt(drinks: AlcoholDose[], t: number, o: AlcoholOpts = {}): number {
  const pts = alcoholCurve(drinks, t - 36 * 60 * MIN, t, o);
  return pts.length ? pts[pts.length - 1][1] : 0;
}
