/**
 * What makes a day — clearer (PLAN 208; owner, 11 Nov, of the beeswarm: "i like E but its not that understandable, maybe
 * its just me"). Your days with a rating, split into your best third and your worst third; for each thing before them, the
 * middle of each group, how far apart in your usual spread, and a plain sentence: "Your best focus days: 7 h 40 asleep, no
 * drinks the evening before. Your worst: 6 h 30, 2 drinks." Only things with 5+ days in each group. Goes with, not causes.
 * Pure.
 */

import { FACTORS, OUTCOMES, type DayRow, type FactorKey, type OutcomeKey } from "./daytable";

export const BEST = { minDays: 15, minEach: 5, apart: { strong: 0.8, some: 0.4 } } as const;

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
    const all = rated.map((r) => r[key]).filter((v): v is number => v != null), m = mean(all), sd = Math.sqrt(mean(all.map((v) => (v - m) ** 2)));
    // yes/no things by their share, the rest by their middle day
    const b = FACTORS[key].binary ? mean(bv) : med(bv), w = FACTORS[key].binary ? mean(wv) : med(wv);
    const apart = sd > 0 ? Math.abs(mean(bv) - mean(wv)) / sd : 0;
    out.push({ key, best: b, worst: w, bestVals: bv, worstVals: wv, apart, says: apart >= BEST.apart.strong ? "strongly" : apart >= BEST.apart.some ? "some" : "not" });
  }
  out.sort((a, b) => b.apart - a.apart);
  const words = (pick: "best" | "worst") => out.filter((c) => c.says !== "not").slice(0, 3).map((c) => (FACTORS[c.key].binary ? `${Math.round(c[pick] * 100)} % had trained the day before` : FACTORS[c.key].fmt(c[pick]))).join(", ");
  const name = OUTCOMES[outcome].name.toLowerCase();
  return { outcome, n: rated.length, cut: { best: best[0][outcome]!, worst: worst[worst.length - 1][outcome]! }, rows: out,
    best: out.some((c) => c.says !== "not") ? `Your best ${name} days: ${words("best")}.` : `Your best and worst ${name} days look alike on everything the app sees.`,
    worst: out.some((c) => c.says !== "not") ? `Your worst: ${words("worst")}.` : "" };
}
