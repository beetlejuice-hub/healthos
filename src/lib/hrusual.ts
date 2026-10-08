/**
 * Heart rate against your own usual (PLAN 49; owner picked A, B and C on the canvas, 8 Oct).
 * Pure: minutes in (lib/band's [t, avg, min, max]), numbers out. The timeline draws them, Insights words them.
 *
 *  - usualByHour: what your heart rate normally is at each quarter hour, from the days before today —
 *    workouts and the hour after them left out, so a habit of training at 17:00 doesn't make 17:00 "usual".
 *  - coffeeWindows / workoutWindows: what happened in the 2 hours after a coffee, and during and after a
 *    workout — the numbers the timeline writes on (B).
 *  - afterCoffee: every coffee lined up at zero against the same clock hours on days without caffeine,
 *    each coffee measured against its own half hour before (so a day you're higher all day, or the morning
 *    rise after waking, isn't counted as the coffee) — the card (C). "Goes with", never "causes".
 *  - afterWorkouts: how fast you come back down.
 */

import type { HrMinute } from "./band";
import { addDays, atMinute, localDay, minuteOfDay, MIN } from "./time";

export type Span = { start: number; end: number };
export type Dose = { at: number; mg: number };
export type Band = { mid: number; lo: number; hi: number; days: number };
export type Usual = { slots: (Band | null)[]; days: number; need: number };

const SLOT = 15;
const SLOTS = (24 * 60) / SLOT;
/** Days with data before "usual" means anything. */
export const USUAL_MIN_DAYS = 4;
/** Coffees before the card says anything about them. */
export const COFFEE_MIN_N = 8;
/** Back to usual = within this many bpm of it, five minutes running. */
export const BACK_BPM = 3;

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const quantile = (sorted: number[], q: number) => { const i = (sorted.length - 1) * q, lo = Math.floor(i); return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo); };

/** Minute start (ms) → average bpm. */
export function minuteMap(hr: HrMinute[]): Map<number, number> {
  return new Map(hr.map((m) => [Math.floor(m[0] / MIN) * MIN, m[1]]));
}

/** Mean of the minutes held in [a, b); null if fewer than `need` of them. */
export function meanIn(mins: Map<number, number>, a: number, b: number, need = 1): number | null {
  let s = 0, n = 0;
  for (let t = Math.ceil(a / MIN) * MIN; t < b; t += MIN) { const v = mins.get(t); if (v != null) { s += v; n++; } }
  return n >= need ? s / n : null;
}

/** Training, or the first hour after it. */
const busy = (t: number, workouts: Span[]) => workouts.some((w) => t >= w.start - 5 * MIN && t <= w.end + 60 * MIN);

/**
 * Your usual for each quarter hour: for every earlier day, the mean of that day's minutes within ±15 min
 * of the slot; across days the median, and the middle 60 % as the band (never narrower than ±3 bpm).
 * A slot needs USUAL_MIN_DAYS days; today is never part of its own usual.
 */
export function usualByHour(hr: HrMinute[], workouts: Span[], today: string, lookback = 14): Usual {
  const first = addDays(today, -lookback);
  const perDay = new Map<string, Map<number, number[]>>();
  for (const [t, avg] of hr) {
    const d = localDay(t);
    if (d < first || d >= today || busy(t, workouts)) continue;
    let m = perDay.get(d); if (!m) perDay.set(d, (m = new Map()));
    const md = minuteOfDay(t);
    // Each minute counts toward the slots whose ±15-min window holds it.
    for (const s of [Math.floor((md - 7.5) / SLOT), Math.floor(md / SLOT), Math.floor((md + 7.5) / SLOT)]) {
      const k = (s + SLOTS) % SLOTS; const a = m.get(k); if (a) a.push(avg); else m.set(k, [avg]);
    }
  }
  const slots: (Band | null)[] = [];
  for (let s = 0; s < SLOTS; s++) {
    const vals: number[] = [];
    for (const m of perDay.values()) { const a = m.get(s); if (a && a.length >= 10) vals.push(mean(a)); }
    if (vals.length < USUAL_MIN_DAYS) { slots.push(null); continue; }
    vals.sort((a, b) => a - b);
    const mid = quantile(vals, 0.5);
    slots.push({ mid, lo: Math.min(quantile(vals, 0.2), mid - 3), hi: Math.max(quantile(vals, 0.8), mid + 3), days: vals.length });
  }
  return { slots, days: perDay.size, need: USUAL_MIN_DAYS };
}

export const usualReady = (u: Usual | null): u is Usual => !!u && u.slots.some((s) => s != null);

/** Your usual at time t, blended between the two nearest quarter hours. */
export function usualAt(u: Usual | null, t: number): Band | null {
  if (!u) return null;
  const x = (minuteOfDay(t) - SLOT / 2) / SLOT, i = Math.floor(x), f = x - i;
  const a = u.slots[(i + SLOTS) % SLOTS], b = u.slots[(i + 1) % SLOTS];
  if (!a || !b) return a ?? b ?? null;
  const mix = (p: number, q: number) => p + (q - p) * f;
  return { mid: mix(a.mid, b.mid), lo: mix(a.lo, b.lo), hi: mix(a.hi, b.hi), days: Math.min(a.days, b.days) };
}

/** Mean of (minute − usual) in [a, b), when at least `share` of the minutes are there. */
function deltaIn(mins: Map<number, number>, u: Usual, a: number, b: number, share = 0.5): number | null {
  const d: number[] = [];
  for (let t = Math.ceil(a / MIN) * MIN; t < b; t += MIN) { const v = mins.get(t), us = usualAt(u, t); if (v != null && us) d.push(v - us.mid); }
  return d.length >= ((b - a) / MIN) * share ? mean(d) : null;
}

/** When the 10-minute average peaks in [a, b) (null when most of it is missing). */
function peakIn(mins: Map<number, number>, a: number, b: number): number | null {
  let best: [number, number] | null = null, have = 0;
  for (let t = Math.ceil(a / MIN) * MIN; t < b; t += MIN) {
    if (mins.has(t)) have++;
    const v = meanIn(mins, t - 5 * MIN, t + 5 * MIN, 4);
    if (v != null && (!best || v > best[1])) best = [t, v];
  }
  return best && have >= ((b - a) / MIN) * 0.3 ? best[0] : null;
}

export type CoffeeWindow = { at: number; end: number; count: number; mg: number; peakAt: number | null; delta: number | null; vs: "usual" | "before" | null };

/**
 * B: the 2 hours after each coffee (coffees within 2 h of each other share one window), and how far above
 * your usual the 30–90 minutes after it ran — or, before there's a usual, above the half hour before it.
 */
export function coffeeWindows(doses: Dose[], mins: Map<number, number>, usual: Usual | null): CoffeeWindow[] {
  const out: CoffeeWindow[] = [];
  for (const d of [...doses].filter((x) => x.mg > 0).sort((a, b) => a.at - b.at)) {
    const last = out.at(-1);
    if (last && d.at < last.end) { last.end = d.at + 2 * 3600_000; last.count++; last.mg += d.mg; continue; }
    out.push({ at: d.at, end: d.at + 2 * 3600_000, count: 1, mg: d.mg, peakAt: null, delta: null, vs: null });
  }
  for (const w of out) {
    w.peakAt = peakIn(mins, w.at, w.end);
    const a = w.at + 30 * MIN, b = w.at + 90 * MIN;
    const vsUsual = usualReady(usual) ? deltaIn(mins, usual, a, b) : null;
    if (vsUsual != null) { w.delta = vsUsual; w.vs = "usual"; continue; }
    const after = meanIn(mins, a, b, 30), before = meanIn(mins, w.at - 30 * MIN, w.at, 10);
    if (after != null && before != null) { w.delta = after - before; w.vs = "before"; }
  }
  return out;
}

export type WorkoutWindow = Span & { peak: number | null; avg: number | null; backAt: number | null; backMin: number | null; vs: "usual" | "before" | null };

/** The level you come back down to after a workout: your usual then, or (no usual yet) the half hour before + 5. */
function restingRef(mins: Map<number, number>, usual: Usual | null, w: Span): ((t: number) => number) | null {
  if (usualReady(usual) && usualAt(usual, w.end)) return (t) => (usualAt(usual, t) ?? usualAt(usual, w.end)!).mid;
  const before = meanIn(mins, w.start - 40 * MIN, w.start - 10 * MIN, 10);
  return before == null ? null : () => before + 2;
}

/** B: a workout's peak and average, and when you were back to usual (5 minutes running, within 2 h). */
export function workoutWindows(workouts: Span[], hrMinutes: HrMinute[], usual: Usual | null): WorkoutWindow[] {
  const mins = minuteMap(hrMinutes);
  const maxAt = new Map(hrMinutes.map((m) => [Math.floor(m[0] / MIN) * MIN, m[3]]));
  return [...workouts].sort((a, b) => a.start - b.start).map((w) => {
    let peak: number | null = null; const during: number[] = [];
    for (let t = Math.ceil(w.start / MIN) * MIN; t < w.end; t += MIN) { const v = mins.get(t); if (v != null) { during.push(v); peak = Math.max(peak ?? 0, maxAt.get(t) ?? v); } }
    const enough = during.length >= ((w.end - w.start) / MIN) * 0.3;
    const ref = restingRef(mins, usual, w);
    let backAt: number | null = null;
    if (ref) {
      let run = 0;
      for (let t = Math.ceil(w.end / MIN) * MIN; t < w.end + 120 * MIN; t += MIN) {
        const v = mins.get(t); if (v == null) continue;
        run = v - ref(t) <= BACK_BPM ? run + 1 : 0;
        if (run >= 5) { backAt = t - 4 * MIN; break; }
      }
    }
    return { start: w.start, end: w.end, peak: enough ? peak : null, avg: enough ? mean(during) : null, backAt, backMin: backAt == null ? null : Math.max(0, Math.round((backAt - w.end) / MIN)), vs: ref ? (usualReady(usual) ? "usual" : "before") : null };
  });
}

export type Sure = "clear" | "likely" | "not clear" | "too few";
export type AfterCoffee = {
  /** Coffees measured, and on how many days. */
  n: number; days: number;
  /** Minutes from the coffee → average bpm against coffee-free days, lined up so the half hour before is 0. */
  curve: [number, number][];
  /** The same per coffee (the thin lines). */
  each: [number, number][][];
  /** Half-width of the strip chance alone could draw (2 × the effect's standard error). */
  wobble: number;
  /** 30–90 min after vs the half hour before, against coffee-free days; ± its standard error. */
  effect: number | null; se: number | null; sure: Sure; peakMin: number | null;
};

const FROM = -30, TO = 180, STEP = 5;
const isCaffeineNear = (doses: Dose[], t: number) => doses.some((d) => d.mg > 0 && Math.abs(d.at - t) < 3 * 3600_000);

/**
 * C: each coffee against the same clock minutes on days without caffeine near that hour (and no workout),
 * relative to its own half hour before. Coffees with another one in the 3 hours before, or a workout in
 * their window, are left out — they'd measure the wrong thing.
 */
export function afterCoffee(doses: Dose[], hrMinutes: HrMinute[], workouts: Span[]): AfterCoffee {
  const mins = minuteMap(hrMinutes);
  const days = [...new Set(hrMinutes.map((m) => localDay(m[0])))].sort();
  const caf = doses.filter((d) => d.mg > 0).sort((a, b) => a.at - b.at);
  const bins: number[] = []; for (let m = FROM; m < TO; m += STEP) bins.push(m);
  const clear = (t0: number) => !workouts.some((w) => w.end > t0 + FROM * MIN && w.start < t0 + TO * MIN);
  /** 30–90 min after t0 minus the half hour before it, on whatever day t0 is. */
  const rise = (t0: number) => { const pre = meanIn(mins, t0 - 30 * MIN, t0, 10), post = meanIn(mins, t0 + 30 * MIN, t0 + 90 * MIN, 30); return pre == null || post == null ? null : post - pre; };
  type Use = { day: string; mine: number; ctl: { day: string; v: number }[]; curve: [number, number][] };
  const uses: Use[] = [];
  for (const c of caf) {
    if (caf.some((o) => o.at < c.at && c.at - o.at < 3 * 3600_000) || !clear(c.at)) continue;
    const mine = rise(c.at);
    if (mine == null) continue;
    const day = localDay(c.at), cm = minuteOfDay(c.at);
    const ctl = days.filter((d) => d !== day).map((d) => ({ day: d, t0: atMinute(d, 0) + cm * MIN }))
      .filter((x) => !isCaffeineNear(caf, x.t0) && clear(x.t0))
      .flatMap((x) => { const v = rise(x.t0); return v == null ? [] : [{ day: x.day, v, t0: x.t0 }]; });
    if (ctl.length < 2) continue;
    // The thin line: this coffee minus the coffee-free days, per 5 minutes, lined up on its own half hour before.
    const delta = bins.map((m) => {
      const v = meanIn(mins, c.at + m * MIN, c.at + (m + STEP) * MIN, 2);
      const o = ctl.map((x) => meanIn(mins, x.t0 + m * MIN, x.t0 + (m + STEP) * MIN, 2)).filter((y): y is number => y != null);
      return v == null || o.length < 2 ? null : v - mean(o);
    });
    const pre = delta.filter((v, i) => v != null && bins[i] < 0) as number[];
    const base = pre.length ? mean(pre) : 0;
    uses.push({ day, mine, ctl: ctl.map(({ day: d, v }) => ({ day: d, v })), curve: bins.flatMap((m, i) => (delta[i] == null ? [] : [[m, delta[i]! - base] as [number, number]])) });
  }
  const n = uses.length, each = uses.map((u) => u.curve);
  const curve: [number, number][] = [];
  for (const m of bins) {
    const v = each.map((e) => e.find((p) => p[0] === m)?.[1]).filter((x): x is number => x != null);
    if (v.length >= Math.max(2, n / 2)) curve.push([m, mean(v)]);
  }
  /** The effect from a set of days (each counted as often as it's in the set). */
  const effectOf = (weight: Map<string, number>) => {
    let s = 0, k = 0;
    for (const u of uses) {
      const wu = weight.get(u.day) ?? 0; if (!wu) continue;
      let cs = 0, cn = 0; for (const c of u.ctl) { const wc = weight.get(c.day) ?? 0; cs += wc * c.v; cn += wc; }
      if (!cn) continue;
      s += wu * (u.mine - cs / cn); k += wu;
    }
    return k ? s / k : null;
  };
  if (n < 2) return { n, days: new Set(uses.map((u) => u.day)).size, curve, each, wobble: 0, effect: null, se: null, sure: "too few", peakMin: null };
  const effect = effectOf(new Map(days.map((d) => [d, 1])))!;
  // How sure: resample whole days (coffee days and coffee-free days alike), because every coffee is
  // compared with the same few coffee-free days — treating coffees as independent overstates it ~2×.
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const boots: number[] = [];
  for (let b = 0; b < 300; b++) {
    const w = new Map<string, number>();
    for (let i = 0; i < days.length; i++) { const d = days[Math.floor(rnd() * days.length)]; w.set(d, (w.get(d) ?? 0) + 1); }
    const e = effectOf(w); if (e != null) boots.push(e);
  }
  // Resampling a few weeks of days reads a little low; widened for the number of days, and the bar set so
  // that with nothing there it says "likely" about 1 time in 20 and "clear" practically never (hrusual.test).
  const bm = mean(boots), se = Math.sqrt(boots.reduce((a, x) => a + (x - bm) ** 2, 0) / Math.max(1, boots.length - 1)) * Math.sqrt(days.length / Math.max(1, days.length - 1));
  const t = se > 0 ? Math.abs(effect) / se : 0;
  const sure: Sure = n < COFFEE_MIN_N ? "too few" : t >= 3.5 && n >= 12 ? "clear" : t >= 2.4 ? "likely" : "not clear";
  const after = curve.filter((p) => p[0] >= 0);
  const peak = after.length ? after.reduce((a, b) => ((effect >= 0 ? b[1] > a[1] : b[1] < a[1]) ? b : a)) : null;
  return { n, days: new Set(uses.map((u) => u.day)).size, curve, each, wobble: 2 * se, effect, se, sure, peakMin: peak ? peak[0] : null };
}

export type AfterWorkouts = { n: number; curve: [number, number][]; each: [number, number][][]; backMin: number | null; backN: number };

/** C, right side: bpm above your resting level for 90 minutes after each workout, and the average time back. */
export function afterWorkouts(workouts: Span[], hrMinutes: HrMinute[], usual: Usual | null): AfterWorkouts {
  const mins = minuteMap(hrMinutes), wins = workoutWindows(workouts, hrMinutes, usual);
  const each: [number, number][][] = [];
  wins.forEach((w) => {
    const ref = restingRef(mins, usual, w);
    if (!ref) return;
    const pts: [number, number][] = [];
    for (let m = 0; m <= 90; m += 3) { const v = meanIn(mins, w.end + m * MIN, w.end + (m + 3) * MIN, 1); if (v != null) pts.push([m, v - ref(w.end + m * MIN)]); }
    if (pts.length >= 10) each.push(pts);
  });
  const curve: [number, number][] = [];
  for (let m = 0; m <= 90; m += 3) { const v = each.map((e) => e.find((p) => p[0] === m)?.[1]).filter((x): x is number => x != null); if (v.length >= Math.max(1, each.length / 2)) curve.push([m, mean(v)]); }
  const backs = wins.map((w) => w.backMin).filter((x): x is number => x != null);
  return { n: each.length, curve, each, backMin: backs.length ? Math.round(mean(backs)) : null, backN: backs.length };
}

/** For the lane's scale: everyday heart rate (outside workouts), 1st to 99th percentile. */
export function everydayRange(hr: HrMinute[], workouts: Span[]): [number, number] | null {
  const v = hr.filter((m) => !workouts.some((w) => m[0] >= w.start && m[0] <= w.end)).map((m) => m[1]).sort((a, b) => a - b);
  if (v.length < 30) return null;
  return [quantile(v, 0.01), quantile(v, 0.99)];
}
