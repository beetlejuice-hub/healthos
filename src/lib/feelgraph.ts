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
