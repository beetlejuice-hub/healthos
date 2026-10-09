/**
 * After a supplement (PLAN 63; owner, 9 Oct: "keep in mind at what time i log supplements, can check whether it affects
 * mental, or bpm changes"). Heart rate comes from lib/hrusual `afterEach` (each intake against the same clock time on days
 * without it, coffee left out). How you felt, here: check-ins 1–4 hours after taking it against check-ins at about the same
 * time of day (3-hour windows) with none in the 4 hours before — so a supplement taken at noon isn't credited with the
 * afternoon's usual mood. How sure: shuffle which check-ins were "after" within each window. Four feelings are looked at
 * per supplement, so the bars are four times stricter than for one: clear p < 0.00125, likely p < 0.0125. Pure.
 */

import type { Check } from "./feelgraph";
import type { Sure } from "./sleep";
import { minuteOfDay } from "./time";

export type FeelKey = "mood" | "energy" | "stress" | "focus";
export type FeelAfter = { key: FeelKey; nWith: number; nWithout: number; diff: number | null; p: number | null; sure: Sure };
const H = 3_600_000, WINDOW_MIN = 180;
/** Check-ins on each side before it says anything. */
export const FEEL_AFTER_MIN = 5;

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

export function feelAfter(times: number[], checks: Check[], key: FeelKey, opts: { perms?: number; seed?: number } = {}): FeelAfter {
  // with: 1–4 h after an intake · without: none in the 4 h before · the first hour after is neither (too soon to tell)
  const pts: { bin: number; v: number; after: boolean }[] = [];
  for (const c of checks) {
    const v = c[key]; if (v == null) continue;
    const since = times.filter((t) => t <= c.at && c.at - t <= 4 * H).map((t) => c.at - t);
    if (since.length && since.every((d) => d < H)) continue;
    pts.push({ bin: Math.floor(minuteOfDay(c.at) / WINDOW_MIN), v, after: since.some((d) => d >= H) });
  }
  // Only windows that hold both: a window with no "without" (taken every day at that time) can't be compared.
  const bins = new Map<number, number[]>();
  pts.forEach((p, i) => { const a = bins.get(p.bin); if (a) a.push(i); else bins.set(p.bin, [i]); });
  const used: number[] = [];
  for (const ix of bins.values()) if (ix.some((i) => pts[i].after) && ix.some((i) => !pts[i].after)) used.push(...ix);
  const nWith = used.filter((i) => pts[i].after).length, nWithout = used.length - nWith;
  if (nWith < FEEL_AFTER_MIN || nWithout < FEEL_AFTER_MIN) return { key, nWith, nWithout, diff: null, p: null, sure: "too few" };
  // each check-in against its window's average, then with − without
  const dev = new Map<number, number>();
  for (const ix of bins.values()) { const us = ix.filter((i) => used.includes(i)); if (!us.length) continue; const m = mean(us.map((i) => pts[i].v)); us.forEach((i) => dev.set(i, pts[i].v - m)); }
  const diffOf = (lab: Map<number, boolean>) => { const a: number[] = [], b: number[] = []; for (const i of used) (lab.get(i) ? a : b).push(dev.get(i)!); return mean(a) - mean(b); };
  const lab = new Map(used.map((i) => [i, pts[i].after])), diff = diffOf(lab);
  const perms = opts.perms ?? 2000; let seed = opts.seed ?? 17, hits = 0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const groups = [...bins.values()].map((ix) => ix.filter((i) => used.includes(i))).filter((g) => g.length);
  for (let k = 0; k < perms; k++) {
    const sh = new Map<number, boolean>();
    for (const g of groups) { const l = g.map((i) => pts[i].after); for (let a = l.length - 1; a > 0; a--) { const b = Math.floor(rnd() * (a + 1)); [l[a], l[b]] = [l[b], l[a]]; } g.forEach((i, j) => sh.set(i, l[j])); }
    if (Math.abs(diffOf(sh)) >= Math.abs(diff) - 1e-9) hits++;
  }
  const p = (hits + 1) / (perms + 1);
  return { key, nWith, nWithout, diff, p, sure: p < 0.00125 ? "clear" : p < 0.0125 ? "likely" : "not clear" };
}
