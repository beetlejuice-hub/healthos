/**
 * How feelings are drawn on the master graph (owner, 2 Oct, picked prototype A): only what you rated.
 * A dot at each check-in; dots are joined only when they're within a few hours of each other, so a
 * 21:00 rating and the next morning's never look connected; a faint band shows each day's range.
 */

import { localDay } from "./time";

export type Check = { at: number; energy?: number; mood?: number; focus?: number; stress?: number; note?: string; doing?: string[] };
export type FeelK = "energy" | "mood" | "focus" | "stress";

/** Join two check-ins with a line only if they're at most this far apart. */
export const JOIN_GAP_MS = 4 * 3_600_000;

/** Runs of check-ins to join with a line: consecutive ratings of `k` no more than `gap` apart. */
export function feelRuns(checks: Check[], k: FeelK, gap = JOIN_GAP_MS): [number, number][][] {
  const pts = checks.filter((c) => c[k] != null).sort((a, b) => a.at - b.at);
  const runs: [number, number][][] = [];
  for (const c of pts) {
    const run = runs[runs.length - 1], last = run?.[run.length - 1];
    if (last && c.at - last[0] <= gap) run.push([c.at, c[k]!]);
    else runs.push([[c.at, c[k]!]]);
  }
  return runs;
}

/** Each day's range of `k`: lowest and highest rating, from the first to the last check-in that day. */
export function dayRanges(checks: Check[], k: FeelK): { day: string; lo: number; hi: number; from: number; to: number }[] {
  const by = new Map<string, Check[]>();
  for (const c of checks) if (c[k] != null) by.set(localDay(c.at), [...(by.get(localDay(c.at)) ?? []), c]);
  return [...by.entries()].map(([day, cs]) => {
    const v = cs.map((c) => c[k]!), t = cs.map((c) => c.at);
    return { day, lo: Math.min(...v), hi: Math.max(...v), from: Math.min(...t), to: Math.max(...t) };
  }).sort((a, b) => a.from - b.from);
}

/** The check-in nearest `t`, if within `tol` ms. */
export function nearestCheck(checks: Check[], t: number, tol: number): Check | null {
  let best: Check | null = null;
  for (const c of checks) if (Math.abs(c.at - t) <= tol && (!best || Math.abs(c.at - t) < Math.abs(best.at - t))) best = c;
  return best;
}

/** What you rated last, if within `within` ms before `t` — the readout's "as of 15:46". */
export function latestCheck(checks: Check[], t: number, within = 3 * 3_600_000): Check | null {
  let best: Check | null = null;
  for (const c of checks) if (c.at <= t && t - c.at <= within && (!best || c.at > best.at)) best = c;
  return best;
}

export const feelText = (c: Check) => (["energy", "mood", "focus", "stress"] as const).filter((k) => c[k] != null).map((k) => `${k} ${c[k]}`).join(" · ");

/**
 * One point per day for a feeling: the day's average at noon, with its lowest and highest check-in.
 * What the master graph draws once zoomed out past a few days, when single check-ins turn to noise.
 */
export function dailyFeel(checks: Check[], k: FeelK): { day: string; at: number; mean: number; lo: number; hi: number; n: number }[] {
  return dayRanges(checks, k).map((r) => {
    const vs = checks.filter((c) => c[k] != null && localDay(c.at) === r.day).map((c) => c[k]!);
    const d = new Date(r.from); d.setHours(12, 0, 0, 0);
    return { day: r.day, at: d.getTime(), mean: vs.reduce((a, b) => a + b, 0) / vs.length, lo: r.lo, hi: r.hi, n: vs.length };
  });
}

/* ---- the "How you felt" lane (owner, 5 Oct, picked versions A + C of the mood prototypes) ---- */

/** Feeling ribbon (C): thickness from energy, 2 px drained … 17 px charged; a middle width when not rated. */
export const ribbonWidth = (energy?: number) => 2 + (energy ?? 5) * 1.5;
/** Ribbon colour position from stress: 0 = calm … 1 = tense; null when not rated. */
export const stressMix = (stress?: number) => (stress == null ? null : Math.max(0, Math.min(1, (stress - 2) / 7)));

/** Check-ins with a mood, in runs that the ribbon joins: one run per local day, so nights stay gaps. */
export function ribbonRuns(checks: Check[]): Check[][] {
  const out: Check[][] = [];
  for (const c of [...checks].filter((x) => x.mood != null).sort((a, b) => a.at - b.at)) {
    const run = out[out.length - 1];
    if (run && localDay(run[run.length - 1].at) === localDay(c.at)) run.push(c); else out.push([c]);
  }
  return out;
}

/**
 * Life chart (A), past a week: each day's mood as distance from your own average (every mood check-in
 * given), with that day's energy and stress averages riding underneath, and whether you wrote a note.
 */
export function lifeBars(checks: Check[]): { base: number | null; days: { day: string; at: number; dev: number; mood: number; energy: number | null; stress: number | null; note: boolean }[] } {
  const rated = checks.filter((c) => c.mood != null);
  if (!rated.length) return { base: null, days: [] };
  const base = rated.reduce((a, c) => a + c.mood!, 0) / rated.length;
  const avg = (cs: Check[], k: FeelK) => { const v = cs.flatMap((c) => (c[k] == null ? [] : [c[k]!])); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const by = new Map<string, Check[]>();
  for (const c of checks) by.set(localDay(c.at), [...(by.get(localDay(c.at)) ?? []), c]);
  const days = [...by.entries()].flatMap(([day, cs]) => {
    const mood = avg(cs, "mood"); if (mood == null) return [];
    const d = new Date(Math.min(...cs.map((c) => c.at))); d.setHours(12, 0, 0, 0);
    return [{ day, at: d.getTime(), dev: mood - base, mood, energy: avg(cs, "energy"), stress: avg(cs, "stress"), note: cs.some((c) => !!c.note?.trim()) }];
  }).sort((a, b) => a.at - b.at);
  return { base, days };
}
