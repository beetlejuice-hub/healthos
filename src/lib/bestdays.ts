/**
 * What makes a day — clearer (PLAN 208; owner, 11 Nov, of the beeswarm: "i like E but its not that understandable, maybe
 * its just me"). Your days with a rating, split into your best third and your worst third; for each thing before them, the
 * middle of each group, how far apart in your usual spread, and a plain sentence: "Your best focus days: 7 h 40 asleep, no
 * drinks the evening before. Your worst: 6 h 30, 2 drinks." Only things with 5+ days in each group. Goes with, not causes.
 * Pure.
 */

import { FACTORS, OUTCOMES, type DayRow, type FactorKey, type OutcomeKey } from "./daytable";

/** How far apart, by rank (Cliff's delta: how often a best day had more of it than a worst day, minus how often less;
 * 0 alike, ±1 no overlap) — a few extreme days can't swing it (PLAN 209: two 4-drink nights on good days took the old
 * mean-over-spread measure from 0.77 to 0.23). 0.43 / 0.22 are where a shift of 0.8 / 0.4 standard deviations lands. */
export const BEST = { minDays: 15, minEach: 5, apart: { strong: 0.43, some: 0.22 } } as const;
/** Cliff's delta of a against b. */
export function cliff(a: number[], b: number[]): number {
  let gt = 0, lt = 0;
  for (const x of a) for (const y of b) { if (x > y) gt++; else if (x < y) lt++; }
  return (gt - lt) / (a.length * b.length || 1);
}

export type Contrast = { key: FactorKey; best: number; worst: number; bestVals: number[]; worstVals: number[]; apart: number; says: "strongly" | "some" | "not" };
export type BestDays = { outcome: OutcomeKey; n: number; cut: { best: number; worst: number }; rows: Contrast[]; best: string; worst: string };

const med = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

export function bestDays(rows: DayRow[], outcome: OutcomeKey): BestDays | null {
  const rated = rows.filter((r) => r[outcome] != null).sort((a, b) => a[outcome]! - b[outcome]!);
  if (rated.length < BEST.minDays) return null;
  const third = Math.floor(rated.length / 3), worst = rated.slice(0, third), best = rated.slice(-third);
  const out: Contrast[] = [];
  for (const key of Object.keys(FACTORS) as FactorKey[]) {
    const bv = best.map((r) => r[key]).filter((v): v is number => v != null), wv = worst.map((r) => r[key]).filter((v): v is number => v != null);
    if (bv.length < BEST.minEach || wv.length < BEST.minEach) continue;
    // yes/no things by their share, the rest by their middle day
    const b = FACTORS[key].binary ? mean(bv) : med(bv), w = FACTORS[key].binary ? mean(wv) : med(wv);
    const apart = Math.abs(cliff(bv, wv));
    out.push({ key, best: b, worst: w, bestVals: bv, worstVals: wv, apart, says: apart >= BEST.apart.strong ? "strongly" : apart >= BEST.apart.some ? "some" : "not" });
  }
  out.sort((a, b) => b.apart - a.apart);
  const words = (pick: "best" | "worst") => out.filter((c) => c.says !== "not").slice(0, 3).map((c) => (FACTORS[c.key].binary ? `${Math.round(c[pick] * 100)} % had trained the day before` : FACTORS[c.key].fmt(c[pick]))).join(", ");
  const name = OUTCOMES[outcome].name.toLowerCase();
  return { outcome, n: rated.length, cut: { best: best[0][outcome]!, worst: worst[worst.length - 1][outcome]! }, rows: out,
    best: out.some((c) => c.says !== "not") ? `Your best ${name} days: ${words("best")}.` : `Your best and worst ${name} days look alike on everything the app sees.`,
    worst: out.some((c) => c.says !== "not") ? `Your worst: ${words("worst")}.` : "" };
}
