/**
 * Insights → Body lab, your body clock (PLAN 177, body lab 6; owner, 27 Oct: "yea"). From the last 30 days, your own
 * numbers only: when you sleep (the middle of your falling-asleep and waking times), your night low (when your heart
 * rate bottoms out), how much later weekends run — and from your check-ins, the 2 hours your focus is best and the hour
 * your energy dips in the afternoon. Picking the best of 15 windows makes any one look special, so each is checked by
 * shuffling which check-in had which rating and asking how often the best (or worst) window does as well by chance; a
 * window is only named when that's rare. No population labels ("night owl") — those need norms this app can't check.
 * The slump drives an opt-in ping 15 minutes before it (lib/push/plan). Pure.
 */

import type { Night } from "./sleep";
import { clockH, weekendShift } from "./sleep";
import { addDays, localDay } from "./time";
import type { Entry } from "./types";

/** days: looked back; minNights: nights for the sleep part; focusH: the focus window's length; minIn: check-ins in a window; slump hours: 12:00–19:00. */
export const CLOCK = { days: 30, minNights: 10, focusH: 2, minIn: 6, minChecks: 20, slumpFrom: 12, slumpTo: 19, dayFrom: 7, dayTo: 23, perms: 2000 } as const;

export type Sure = "clear" | "likely" | "not clear" | "too few";
export type Window = { from: number; to: number; mean: number; rest: number; n: number; p: number; sure: Sure };
export type BodyClock = {
  /** Minutes on the evening's clock (23:30 → 1410, 07:30 → 1890), medians of the last 30 nights. */
  sleep: { onset: number; wake: number; mid: number; nights: number } | null;
  low: number | null;
  /** Weekend nights' midpoint later than the rest, minutes. */
  shift: number | null;
  focus: Window | null;
  slump: Window | null;
};

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b), h = Math.floor(s.length / 2); return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * The best (dir 1) or worst (dir −1) `len`-hour window starting at from..to−len, by the mean rating of check-ins in it
 * against the rest of the day's; how sure by 2,000 shuffles of the ratings across the same check-in times.
 */
function bestWindow(pts: { h: number; v: number }[], len: number, from: number, to: number, dir: 1 | -1, seed: number): Window | null {
  const day = pts.filter((p) => p.h >= CLOCK.dayFrom && p.h < CLOCK.dayTo);
  if (day.length < CLOCK.minChecks) return null;
  const hs = day.map((p) => p.h);
  const scan = (vs: number[]) => {
    let best: { s: number; from: number; mean: number; rest: number; n: number } | null = null;
    for (let w = from; w + len <= to; w++) {
      let a = 0, n = 0, b = 0;
      for (let i = 0; i < vs.length; i++) if (hs[i] >= w && hs[i] < w + len) { a += vs[i]; n++; } else b += vs[i];
      if (n < CLOCK.minIn || vs.length - n < CLOCK.minIn) continue;
      const m = a / n, r = b / (vs.length - n), s = dir * (m - r);
      if (!best || s > best.s) best = { s, from: w, mean: m, rest: r, n };
    }
    return best;
  };
  const vs = day.map((p) => p.v), got = scan(vs);
  if (!got) return null;
  const r = rng(seed), sh = [...vs];
  let hits = 0;
  for (let k = 0; k < CLOCK.perms; k++) {
    for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
    const x = scan(sh);
    if (x && x.s >= got.s - 1e-9) hits++;
  }
  const p = (hits + 1) / (CLOCK.perms + 1);
  return { from: got.from, to: got.from + len, mean: got.mean, rest: got.rest, n: got.n, p, sure: p < 0.002 ? "clear" : p < 0.02 ? "likely" : "not clear" };
}

/** A rating's hour of day (fractional), from check-ins in the last 30 days. */
function ratings(entries: Entry[], today: string, k: "focus" | "energy"): { h: number; v: number }[] {
  const first = addDays(today, -CLOCK.days);
  return entries.flatMap((e) => {
    if (e.kind !== "feel" || e[k] == null || localDay(e.at) < first) return [];
    const d = new Date(e.at);
    return [{ h: d.getHours() + d.getMinutes() / 60, v: e[k]! }];
  });
}

/** The afternoon slump — the hour (12:00–19:00) your energy is lowest — when it's at least likely; else null. The ping uses this. */
export function slumpOf(entries: Entry[], today: string): Window | null {
  const w = bestWindow(ratings(entries, today, "energy").map((p) => ({ h: Math.floor(p.h), v: p.v })), 1, CLOCK.slumpFrom, CLOCK.slumpTo, -1, 31);
  return w && (w.sure === "clear" || w.sure === "likely") ? w : null;
}

export function bodyClock(ns: Night[], entries: Entry[], today: string): BodyClock {
  const first = addDays(today, -CLOCK.days), recent = ns.filter((n) => n.day > first && n.day <= today);
  const sleep = recent.length >= CLOCK.minNights ? (() => {
    const onset = median(recent.map((n) => clockH(n.onset, n.eve) * 60)), wake = median(recent.map((n) => clockH(n.wake, n.eve) * 60));
    return { onset, wake, mid: median(recent.map((n) => clockH((n.onset + n.wake) / 2, n.eve) * 60)), nights: recent.length };
  })() : null;
  const lows = recent.flatMap((n) => (n.lowAt == null ? [] : [clockH(n.lowAt, n.eve) * 60]));
  const focusPts = ratings(entries, today, "focus").map((p) => ({ h: Math.floor(p.h), v: p.v }));
  const focus = bestWindow(focusPts, CLOCK.focusH, CLOCK.dayFrom, CLOCK.dayTo, 1, 17);
  const slump = bestWindow(ratings(entries, today, "energy").map((p) => ({ h: Math.floor(p.h), v: p.v })), 1, CLOCK.slumpFrom, CLOCK.slumpTo, -1, 31);
  return { sleep, low: lows.length >= CLOCK.minNights ? median(lows) : null, shift: recent.length >= CLOCK.minNights ? weekendShift(recent) : null, focus, slump };
}

/** "04:30" from minutes on the evening's clock (1710 → 04:30). */
export const clockOf = (m: number) => { const t = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
