/**
 * Caffeine Clock — the engine (prototype; the app still uses caffeine.ts).
 *
 * caffeine.ts treats every drink as absorbed the instant it's drunk, with one fixed half-life.
 * This one models what the body actually does, still with plain arithmetic:
 *
 * - **Absorption takes time.** One-compartment oral model (the Bateman function): caffeine moves
 *   gut → blood at rate ka and leaves the blood at rate ke = ln 2 / half-life. A shot peaks ~30 min
 *   after, a mug ~45, a cold can ~50; food slows it. Blood level is what "caffeine in you" means.
 * - **Sipping counts.** A 500 ml can over an hour is spread over that hour, not one bolus.
 * - **Your half-life isn't known yet**, so the curve comes as a band: the middle is 5 h, the band
 *   covers most adults (3.5–7 h). It narrows once sleep / heart-rate data can fit yours.
 * - **"Last call" protects your first 3 hours of sleep**, not just the minute you lie down: a coffee
 *   20 min before bed is barely absorbed at bedtime, then peaks while you're asleep.
 *
 * Times are minutes from the day's midnight; values past 1,440 are after midnight.
 */

export const HALF_LIFE = { mid: 300, lo: 210, hi: 420 };
/** How long after bedtime the level still matters (deep sleep is front-loaded). */
export const SLEEP_GUARD_MIN = 180;
/** Below this it's a trace: "clear". */
export const TRACE_MG = 10;

export type Form = "shot" | "cup" | "can";
export type Drink = { id: string; name: string; at: number; mg: number; form: Form; sipMin?: number; withFood?: boolean };

/** Absorption rate per minute, chosen so the peak lands ~30 / 45 / 50 min after a 5 h half-life dose. */
export const KA: Record<Form, number> = { shot: 0.13, cup: 0.08, can: 0.07 };
const FOOD = 0.6;

const ke = (hl: number) => Math.LN2 / hl;
const kaOf = (d: Drink) => KA[d.form] * (d.withFood ? FOOD : 1);

/** ∫ of the unit Bateman curve from 0 to s (handy for sipping). */
function bateInt(s: number, ka: number, k: number) {
  if (s <= 0) return 0;
  return (ka / (ka - k)) * ((1 - Math.exp(-k * s)) / k - (1 - Math.exp(-ka * s)) / ka);
}

/** mg of one drink in the blood at minute t. */
export function inBlood(d: Drink, t: number, hl = HALF_LIFE.mid): number {
  const tau = t - d.at;
  if (tau <= 0 || d.mg <= 0) return 0;
  const ka = kaOf(d), k = ke(hl);
  const S = d.sipMin ?? 0;
  if (S <= 1) return d.mg * (ka / (ka - k)) * (Math.exp(-k * tau) - Math.exp(-ka * tau));
  // Drunk at a steady rate over S minutes: the sum of many tiny boluses.
  const m = Math.min(tau, S);
  return (d.mg / S) * (bateInt(tau, ka, k) - bateInt(tau - m, ka, k));
}

/** mg of one drink still in the gut (drunk, not yet absorbed) at minute t. */
export function inGut(d: Drink, t: number): number {
  const tau = t - d.at;
  if (tau <= 0 || d.mg <= 0) return 0;
  const ka = kaOf(d), S = d.sipMin ?? 0;
  if (S <= 1) return d.mg * Math.exp(-ka * tau);
  const m = Math.min(tau, S);
  return (d.mg / S) * Math.exp(-ka * tau) * (Math.exp(ka * m) - 1) / ka;
}

export const level = (ds: Drink[], t: number, hl = HALF_LIFE.mid) => ds.reduce((s, d) => s + inBlood(d, t, hl), 0);

/** Highest blood level in [from, to], sampled every minute. */
function maxIn(ds: Drink[], from: number, to: number, hl: number) {
  let m = 0, at = from;
  for (let t = from; t <= to; t++) { const v = level(ds, t, hl); if (v > m) { m = v; at = t; } }
  return { mg: m, at };
}

export type Day = {
  /** Every 5 min from `from` to `to`: [minute, mid, lo-band, hi-band, per-drink mid]. */
  curve: { t: number; mg: number; lo: number; hi: number; parts: number[] }[];
  peak: { at: number; mg: number };
  bed: { at: number; mg: number; lo: number; hi: number; sleepMax: number; sleepMaxAt: number };
  /** When the level drops under a trace for good (mid, and the band's slow end). */
  clear: { at: number | null; slowAt: number | null };
  /** Still on its way from the gut right now. */
  gutNow: number;
};

/** Everything the clock draws, for a day of drinks seen at minute `now`. */
export function day(ds: Drink[], bed: number, now: number, from = 5 * 60, to = 29 * 60): Day {
  const curve: Day["curve"] = [];
  for (let t = from; t <= to; t += 5) {
    const parts = ds.map((d) => inBlood(d, t));
    const a = level(ds, t, HALF_LIFE.lo), b = level(ds, t, HALF_LIFE.hi);
    curve.push({ t, mg: parts.reduce((x, y) => x + y, 0), lo: Math.min(a, b), hi: Math.max(a, b), parts });
  }
  const peak = maxIn(ds, from, to, HALF_LIFE.mid);
  const sleep = maxIn(ds, bed, bed + SLEEP_GUARD_MIN, HALF_LIFE.mid);
  const lastDrink = Math.max(from, ...ds.map((d) => d.at + (d.sipMin ?? 0)));
  const clearAt = (hl: number) => {
    if (!ds.length) return null;
    for (let t = Math.max(peak.at, lastDrink); t <= to + 24 * 60; t += 5) if (level(ds, t, hl) < TRACE_MG) return t;
    return null;
  };
  const a = level(ds, bed, HALF_LIFE.lo), b = level(ds, bed, HALF_LIFE.hi);
  return {
    curve, peak,
    bed: { at: bed, mg: level(ds, bed), lo: Math.min(a, b), hi: Math.max(a, b), sleepMax: sleep.mg, sleepMaxAt: sleep.at },
    clear: { at: clearAt(HALF_LIFE.mid), slowAt: clearAt(HALF_LIFE.hi) },
    gutNow: ds.reduce((s, d) => s + inGut(d, now), 0),
  };
}

/**
 * The latest minute (from `now`) you can start `drink` and still stay at or under `targetMg` for
 * the first 3 hours of sleep. "never" = you're already over; "any" = even at bedtime it fits.
 */
export function lastCall(ds: Drink[], drink: Omit<Drink, "at" | "id">, bed: number, targetMg: number, now: number, hl = HALF_LIFE.mid): number | "never" | "any" {
  const over = (t: number) => maxIn([...ds, { ...drink, id: "?", at: t }], bed, bed + SLEEP_GUARD_MIN, hl).mg > targetMg;
  if (maxIn(ds, bed, bed + SLEEP_GUARD_MIN, hl).mg > targetMg || over(now)) return "never";
  if (!over(bed)) return "any";
  let ok = now, bad = bed; // a later drink leaves more in the first hours of sleep
  while (bad - ok > 1) { const m = Math.floor((ok + bad) / 2); if (over(m)) bad = m; else ok = m; }
  return ok;
}

/** A level in words people can picture. */
export function likeA(mg: number): string {
  if (mg < TRACE_MG) return "a trace";
  if (mg < 45) return "about a cola";
  if (mg < 80) return "about an espresso";
  if (mg < 110) return "about a mug of filter coffee";
  return `about ${Math.round(mg / 63)} espressos`;
}

export const clock = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
