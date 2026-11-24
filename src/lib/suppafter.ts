/**
 * After a supplement (PLAN 63; owner, 9 Oct: "keep in mind at what time i log supplements, can check whether it affects
 * mental, or bpm changes"). Heart rate comes from lib/hrusual `afterEach` (each intake against the same clock time on days
 * without it, coffee left out). How you felt, here: check-ins 1–4 hours after taking it against check-ins at about the same
 * time of day (3-hour windows) with none in the 4 hours before — so a supplement taken at noon isn't credited with the
 * afternoon's usual mood. How sure: shuffle which check-ins were "after" within each window. Four feelings are looked at
 * per supplement, so the bars are four times stricter than for one: clear p < 0.00125, likely p < 0.0125. Pure.
 */

import type { Check } from "./feelgraph";
import { goesWith, OUTCOMES, type Cell, type Evening, type Night, type Sure } from "./sleep";
import { localDay, minuteOfDay } from "./time";

export type FeelKey = "mood" | "energy" | "stress" | "focus";
export type FeelAfter = { key: FeelKey; nWith: number; nWithout: number; diff: number | null; p: number | null; sure: Sure };
const H = 3_600_000, WINDOW_MIN = 180;
/** Check-ins on each side before it says anything. */
export const FEEL_AFTER_MIN = 5;

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

export function feelAfter(times: number[], checks: Check[], key: FeelKey, opts: { perms?: number; seed?: number; known?: Set<string> } = {}): FeelAfter {
  // with: 1–4 h after an intake · without: none in the 4 h before · the first hour after is neither (too soon to tell)
  const pts: { bin: number; v: number; after: boolean }[] = [];
  for (const c of checks) {
    const v = c[key]; if (v == null) continue;
    const since = times.filter((t) => t <= c.at && c.at - t <= 4 * H).map((t) => c.at - t);
    if (since.length && since.every((d) => d < H)) continue;
    // a "without" check-in only on a day it's known — taken, said "didn't", or not logged on a day the app was used (lib/suppdays)
    if (!since.some((d) => d >= H) && opts.known && !opts.known.has(localDay(c.at))) continue;
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

/**
 * That night, by when you took it (PLAN 226; owner, 24 Nov: "log the time when i log the supplements so it can see what
 * happens after taking, not just on the day of taking"). The nights it was taken in the 12 hours before bed, split by how
 * long before bed: within `closeH` hours against earlier (or, when one side is short, at the middle of your times) — then
 * the Sleep grid's own test (lib/sleep goesWith: the shuffle, and the nights counted as fewer when they run in stretches)
 * on asleep, deep, how long it took to fall asleep and HRV. Goes with, not causes. Pure.
 */
export const DOSE_TIMING = { closeH: 2, windowH: 12, minEach: 5 } as const;
export type DoseTiming = { nights: number; cutH: number; close: number; early: number; cells: Cell[] };

export function doseTiming(times: number[], ns: Night[], perms = 2000): DoseTiming | null {
  const rows = ns.flatMap((n) => {
    const before = times.filter((t) => t <= n.bed && t > n.bed - DOSE_TIMING.windowH * 3_600_000);
    return before.length ? [{ n, h: (n.bed - Math.max(...before)) / 3_600_000 }] : [];
  });
  if (rows.length < 2 * DOSE_TIMING.minEach) return null;
  let cut: number = DOSE_TIMING.closeH;
  const closeN = rows.filter((r) => r.h <= cut).length;
  if (closeN < DOSE_TIMING.minEach || rows.length - closeN < DOSE_TIMING.minEach) {
    const hs = rows.map((r) => r.h).sort((a, b) => a - b);
    cut = hs[Math.floor(hs.length / 2) - 1];
    if (!(hs[hs.length - 1] - hs[0] >= 1)) return null; // all at about the same time: nothing to compare
  }
  const close = rows.filter((r) => r.h <= cut).length;
  if (close < DOSE_TIMING.minEach || rows.length - close < DOSE_TIMING.minEach) return null;
  const outs = OUTCOMES.filter((o) => ["asleep", "deep", "latency", "hrv"].includes(o.id));
  const cells = goesWith(rows.map((r) => r.n), rows.map((r) => ({ h: r.h })) as unknown as Evening[], {
    perms, factors: [{ id: "close", name: "close to bed", has: (_, e) => (e as unknown as { h: number }).h <= cut }], outcomes: outs });
  return { nights: rows.length, cutH: Math.round(cut * 10) / 10, close, early: rows.length - close, cells };
}
