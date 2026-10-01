/**
 * Caffeine in your body, from what you drank.
 *
 * First-order elimination: each dose halves every `halfLifeMin` (≈5 h for most adults, with a
 * wide personal range — it's a setting, not a constant). Absorption is treated as instant; it
 * peaks ~45 min after drinking, which moves the curve's peak but not what's left at bedtime,
 * the number the app actually acts on.
 *
 * **It ends.** Exponential decay never reaches zero on paper, but under 10 mg (a sip of decaf) is
 * nothing your body notices, so the total counts as 0 from there. Owner, 1 Oct: it *"should
 * disappear or become eventually zero under x mg"*.
 */

import { MIN } from "./time";

export const DEFAULT_HALF_LIFE_MIN = 300;

/** Below this much in your body it counts as none. */
export const CLEAR_MG = 10;
export const cleared = (mg: number) => (mg < CLEAR_MG ? 0 : mg);

export type Dose = { at: number; mg: number };

/** mg still in your body at time `t`. Doses after `t` don't count. */
export function caffeineAt(doses: Dose[], t: number, halfLifeMin = DEFAULT_HALF_LIFE_MIN): number {
  let mg = 0;
  for (const d of doses) {
    if (d.at > t || d.mg <= 0) continue;
    mg += d.mg * Math.pow(0.5, (t - d.at) / MIN / halfLifeMin);
  }
  return cleared(mg);
}

/** The curve from `from` to `to`, one point every `stepMin`. */
export function caffeineCurve(
  doses: Dose[],
  from: number,
  to: number,
  stepMin = 5,
  halfLifeMin = DEFAULT_HALF_LIFE_MIN,
): [number, number][] {
  const out: [number, number][] = [];
  for (let t = from; t <= to; t += stepMin * MIN) out.push([t, caffeineAt(doses, t, halfLifeMin)]);
  return out;
}

/**
 * The latest moment a `doseMg` drink keeps you at or under `targetMg` by `bedtime`.
 *
 * Returns `null` when what's already in your body will be over the target by bedtime anyway —
 * no time is safe — and `bedtime` itself when even a dose at bedtime would stay under.
 */
export function latestDoseFor(
  doses: Dose[],
  bedtime: number,
  doseMg: number,
  targetMg: number,
  halfLifeMin = DEFAULT_HALF_LIFE_MIN,
): number | null {
  const room = targetMg - caffeineAt(doses, bedtime, halfLifeMin);
  if (room <= 0) return null;
  if (doseMg <= room) return bedtime;
  return bedtime - halfLifeMin * Math.log2(doseMg / room) * MIN;
}
