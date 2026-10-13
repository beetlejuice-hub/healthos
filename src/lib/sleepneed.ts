/**
 * Your sleep need and best bedtime (PLAN 88, phase 4; owner, 13 Oct: "I'm big on sleep and how it affects me"). A straight
 * line through "feeling against hours asleep" can't say "best around 7½ h, worse at 6 and at 9", so: the nights in
 * half-hour bands (hours asleep, or the clock time you went to bed), the next day's feeling in each band, and the window
 * of neighbouring bands whose days went best against all the others — one band ("7–7½ h") or a run ("before 00:00": a
 * step, the usual shape for bedtime, which one band alone can't show). How sure: shuffle which night went with which day
 * and pick the best window again each time — so choosing among 21 windows is counted, not flattered. Same bars as the slope next to it (four
 * feelings to pick from): clear p < 0.00125, likely p < 0.0125. "Went with", never "you need". Pure.
 */

import type { Sure } from "./sleep";

export type Band = { lo: number; hi: number; label: string; vals: number[]; mean: number | null };
export type Window = { lo: number; hi: number; label: string; n: number; mean: number };
export type BestBand = { bands: Band[]; best: Window | null; rest: number | null; diff: number | null; p: number | null; sure: Sure; n: number };

/** Hours asleep, in half hours from 6 to 8. */
export const SLEEP_EDGES = [6, 6.5, 7, 7.5, 8];
/** Bedtime as hours on the evening's clock (23.5 = 23:30, 24.5 = 00:30), in half hours from 23:00 to 00:30. */
export const BED_EDGES = [23, 23.5, 24, 24.5];
/** A band needs this many days to be the best one. */
export const BAND_MIN = 4;
/** Days needed before anything is said. */
export const NEED_MIN_DAYS = 14;

const hh = (h: number) => { const m = Math.round(((h % 24) + 24) % 24 * 60); return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
const hrs = (h: number) => (h % 1 ? `${Math.floor(h)}½` : String(h));
/** Band labels: "under 6 h", "6–6½ h" … "8 h+" for hours; "before 23:00" … "after 00:30" for clock times. */
export function bandLabels(edges: number[], kind: "hours" | "clock"): string[] {
  const f = kind === "hours" ? hrs : hh, u = kind === "hours" ? " h" : "";
  return [kind === "hours" ? `under ${f(edges[0])}${u}` : `before ${f(edges[0])}`,
    ...edges.slice(1).map((e, i) => `${f(edges[i])}–${f(e)}${u}`),
    kind === "hours" ? `${f(edges.at(-1)!)}${u}+` : `after ${f(edges.at(-1)!)}`];
}

/** A window's name: "7–8 h", "8 h+", "under 6 h"; "before 00:00", "23:00–23:30", "after 00:30". */
export function windowLabel(lo: number, hi: number, kind: "hours" | "clock"): string {
  if (kind === "hours") return lo === -Infinity ? `under ${hrs(hi)} h` : hi === Infinity ? `${hrs(lo)} h+` : `${hrs(lo)}–${hrs(hi)} h`;
  return lo === -Infinity ? `before ${hh(hi)}` : hi === Infinity ? `after ${hh(lo)}` : `${hh(lo)}–${hh(hi)}`;
}

const bandOf = (x: number, edges: number[]) => { let i = 0; while (i < edges.length && x >= edges[i]) i++; return i; };
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

/**
 * `pts`: [x, value] per day (hours asleep or bedtime, and the next day's feeling, or the night's own measure).
 * `better`: +1 when more is better (energy, mood, deep), −1 when less is (stress).
 */
export function bestBand(pts: [number, number][], edges: number[], kind: "hours" | "clock", better: 1 | -1 = 1, opts: { perms?: number; seed?: number } = {}): BestBand {
  const labels = bandLabels(edges, kind), idx = pts.map(([x]) => bandOf(x, edges)), ys = pts.map((p) => p[1]);
  const bandsOf = (y: number[]): Band[] => labels.map((label, i) => {
    const vals = y.filter((_, k) => idx[k] === i);
    return { lo: i === 0 ? -Infinity : edges[i - 1], hi: i === edges.length ? Infinity : edges[i], label, vals, mean: vals.length ? mean(vals) : null };
  });
  const bands = bandsOf(ys);
  if (pts.length < NEED_MIN_DAYS) return { bands, best: null, rest: null, diff: null, p: null, sure: "too few", n: pts.length };
  // the best window's lead over every other day, in the better direction (windows: bands i..j, 4+ days in and out)
  const B = labels.length;
  const lead = (y: number[]) => {
    const sums = new Array(B).fill(0), ns = new Array(B).fill(0), total = y.reduce((a, v) => a + v, 0);
    y.forEach((v, k) => { sums[idx[k]] += v; ns[idx[k]]++; });
    let top = -Infinity, at: [number, number] = [-1, -1];
    for (let i = 0; i < B; i++) {
      let sw = 0, nw = 0;
      for (let j = i; j < B; j++) {
        sw += sums[j]; nw += ns[j];
        if (nw < BAND_MIN || y.length - nw < BAND_MIN) continue;
        const d = better * (sw / nw - (total - sw) / (y.length - nw));
        if (d > top) { top = d; at = [i, j]; }
      }
    }
    return { top, at };
  };
  const obs = lead(ys);
  if (obs.at[0] < 0) return { bands, best: null, rest: null, diff: null, p: null, sure: "too few", n: pts.length };
  let seed = (opts.seed ?? 29) >>> 0;
  const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const perms = opts.perms ?? 2000, sh = [...ys];
  let hits = 0;
  for (let k = 0; k < perms; k++) {
    for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
    if (lead(sh).top >= obs.top - 1e-9) hits++;
  }
  const p = (hits + 1) / (perms + 1), [i0, j0] = obs.at, inW = (k: number) => idx[k] >= i0 && idx[k] <= j0;
  const vin = ys.filter((_, k) => inW(k)), vout = ys.filter((_, k) => !inW(k)), lo = bands[i0].lo, hi = bands[j0].hi;
  const best: Window = { lo, hi, label: windowLabel(lo, hi, kind), n: vin.length, mean: mean(vin) };
  return { bands, best, rest: mean(vout), diff: best.mean - mean(vout), p, sure: p < 0.00125 ? "clear" : p < 0.0125 ? "likely" : "not clear", n: pts.length };
}
