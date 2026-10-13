/**
 * Caffeine in your body, from what you drank.
 *
 * Sipped, not chugged (owner, 13 Oct: "after logging, it takes like 10-20 minutes while i sip on it, not chug it"): a
 * drink goes down evenly over `SIP_MIN` from when it's logged, and from the gut into the blood at first order — half of
 * what's in the gut every `ABSORB_HALF_MIN`, so a gulped coffee peaks about 45 min later and a sipped one about 50
 * (studies: peak 30–60 min for most people, 15–120 in all; nearly all absorbed within 45 min). From the blood it halves
 * every `halfLifeMin` (≈5 h for most adults, with a wide personal range — it's a setting, not a constant).
 *
 * Two numbers, on purpose:
 * - `caffeineInBlood` — absorbed and not yet cleared: the curve you see and "now". It rises over the hour after a drink.
 * - `caffeineAt` — logged and not yet cleared, wherever it is (cup, gut, blood): what bedtime and every sleep check use,
 *   so a coffee five minutes before bed counts in full instead of looking like nothing "at bed". Hours after a drink the
 *   two agree to within a milligram.
 *
 * **It ends.** Exponential decay never reaches zero on paper, but under 10 mg (a sip of decaf) is nothing your body
 * notices, so the total counts as 0 from there. Owner, 1 Oct: it *"should disappear or become eventually zero under x mg"*.
 */

import { MIN } from "./time";

export const DEFAULT_HALF_LIFE_MIN = 300;
/** Minutes a drink takes to drink, from when it's logged (owner: "10-20 minutes"). */
export const SIP_MIN = 15;
/** Half of what's in the gut reaches the blood every this many minutes. */
export const ABSORB_HALF_MIN = 8;

/** Below this much in your body it counts as none. */
export const CLEAR_MG = 10;
export const cleared = (mg: number) => (mg < CLEAR_MG ? 0 : mg);

/** `sipMin`: how long it took to drink (default SIP_MIN; 0 = in one go). */
export type Dose = { at: number; mg: number; sipMin?: number };

/**
 * One drink at time `t`: `left` — logged and not yet cleared (cup + gut + blood); `blood` — absorbed and not yet cleared.
 * One-compartment model with first-order absorption, the intake spread evenly over the sip (closed form).
 */
export function doseCaffeine(d: Dose, t: number, halfLifeMin = DEFAULT_HALF_LIFE_MIN): { left: number; blood: number } {
  const tau = (t - d.at) / MIN;
  if (tau < 0 || d.mg <= 0) return { left: 0, blood: 0 };
  const e = Math.LN2 / halfLifeMin, k = Math.LN2 / ABSORB_HALF_MIN, T = d.sipMin ?? SIP_MIN, kd = k - e || 1e-9;
  if (T <= 0) {
    const a = Math.exp(-e * tau), b = Math.exp(-k * tau);
    return { left: (d.mg * (k * a - e * b)) / kd, blood: (d.mg * k * (a - b)) / kd };
  }
  // ∫ over what's been drunk so far (the first U minutes of the sip) of a gulp's curve
  const U = Math.min(T, tau), r = d.mg / T;
  const I = (c: number) => (Math.exp(-c * (tau - U)) - Math.exp(-c * tau)) / c;
  const Ie = I(e), Ik = I(k);
  return { left: (r * (k * Ie - e * Ik)) / kd + r * (T - U), blood: (r * k * (Ie - Ik)) / kd };
}

/** mg logged and not yet cleared at time `t` (cup, gut and blood) — what bedtime is judged on. Doses after `t` don't count. */
export function caffeineAt(doses: Dose[], t: number, halfLifeMin = DEFAULT_HALF_LIFE_MIN): number {
  let mg = 0;
  for (const d of doses) mg += doseCaffeine(d, t, halfLifeMin).left;
  return cleared(mg);
}

/** mg absorbed and not yet cleared at time `t` — the curve, and "now". */
export function caffeineInBlood(doses: Dose[], t: number, halfLifeMin = DEFAULT_HALF_LIFE_MIN): number {
  let mg = 0;
  for (const d of doses) mg += doseCaffeine(d, t, halfLifeMin).blood;
  return cleared(mg);
}

/** The curve (in the blood) from `from` to `to`, one point every `stepMin`. */
export function caffeineCurve(
  doses: Dose[],
  from: number,
  to: number,
  stepMin = 5,
  halfLifeMin = DEFAULT_HALF_LIFE_MIN,
): [number, number][] {
  const out: [number, number][] = [];
  for (let t = from; t <= to; t += stepMin * MIN) out.push([t, caffeineInBlood(doses, t, halfLifeMin)]);
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
  // The earlier it's drunk, the less of it is left at bedtime: halve the window to the latest time it still fits.
  let lo = bedtime - 72 * 60 * MIN, hi = bedtime;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (caffeineAt([...doses, { at: m, mg: doseMg }], bedtime, halfLifeMin) <= targetMg) lo = m; else hi = m; }
  return lo;
}
