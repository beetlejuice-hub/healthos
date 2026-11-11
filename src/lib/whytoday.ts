/**
 * Why today (PLAN 208; owner, 11 Nov: "yea lets do this 4"). Today's focus (or mood, energy) from your usual: a ridge
 * regression over your last 120 days of what came before each day (lib/daytable) — every thing weighed together, so late
 * nights and drinks, which come together, aren't counted twice — gives what days like today tend to be, and how much each
 * thing about last night and yesterday pushed it up or down. Then what you rated, and what nothing logged explains. A
 * thing counts only with 5 days each way when it's yes/no (as Whoop's journal does), 14 days with it otherwise. Goes with,
 * not causes. Pure.
 */

import { FACTORS, PER, type DayRow, type FactorKey, type OutcomeKey } from "./daytable";

export const WHY = { minDays: 21, lambda: 3, minEach: 5, minSeen: 14, show: 0.1 } as const;

export type Push = { key: FactorKey; say: string; pts: number };
export type Why = { outcome: OutcomeKey; day: string; usual: number; expected: number; pushes: Push[]; rated: number | null; n: number; week: { day: string; expected: number; rated: number | null }[] };
type Model = { keys: FactorKey[]; mu: number[]; sd: number[]; w: number[]; b: number };

function solve(A: number[][], y: number[]): number[] {
  const n = y.length, M = A.map((r, i) => [...r, y[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / d; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / (r[i] || 1e-12));
}

/** The model from the rated days before `day`: standardized inputs, a missing one at its usual (0), ridge λ. */
export function fitWhy(rows: DayRow[], outcome: OutcomeKey, day: string): Model | null {
  const past = rows.filter((r) => r.day < day && r[outcome] != null);
  if (past.length < WHY.minDays) return null;
  const keys = (Object.keys(FACTORS) as FactorKey[]).filter((k) => {
    const v = past.map((r) => r[k]).filter((x): x is number => x != null);
    if (FACTORS[k].binary) return v.filter((x) => x >= 0.5).length >= WHY.minEach && v.filter((x) => x < 0.5).length >= WHY.minEach;
    return v.length >= WHY.minSeen && new Set(v.map((x) => Math.round(x * 10))).size >= 3;
  });
  const mu = keys.map((k) => { const v = past.map((r) => r[k]).filter((x): x is number => x != null); return v.reduce((a, b) => a + b, 0) / v.length; });
  const sd = keys.map((k, j) => { const v = past.map((r) => r[k]).filter((x): x is number => x != null); return Math.sqrt(v.reduce((a, b) => a + (b - mu[j]) ** 2, 0) / v.length) || 1; });
  const X = past.map((r) => keys.map((k, j) => (r[k] == null ? 0 : (r[k]! - mu[j]) / sd[j]))), y = past.map((r) => r[outcome]!);
  const b = y.reduce((a, v) => a + v, 0) / y.length, yc = y.map((v) => v - b);
  const A = keys.map((_, i) => keys.map((__, j) => X.reduce((s, x) => s + x[i] * x[j], 0) + (i === j ? WHY.lambda : 0)));
  const w = keys.length ? solve(A, keys.map((_, i) => X.reduce((s, x, n) => s + x[i] * yc[n], 0))) : [];
  return { keys, mu, sd, w, b };
}

function expect(m: Model, r: DayRow): { expected: number; pushes: Push[] } {
  const pushes: Push[] = [];
  let e = m.b;
  m.keys.forEach((k, j) => {
    if (r[k] == null) return;
    const pts = m.w[j] * ((r[k]! - m.mu[j]) / m.sd[j]);
    e += pts;
    if (Math.abs(pts) >= WHY.show) pushes.push({ key: k, say: FACTORS[k].fmt(r[k]!), pts: Math.round(pts * 10) / 10 });
  });
  return { expected: e, pushes: pushes.sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts)) };
}

/** Why `day` went as it did (or is going): from the days before it. Null with too few rated days. */
export function whyToday(rows: DayRow[], outcome: OutcomeKey, day: string): Why | null {
  const m = fitWhy(rows, outcome, day), r = rows.find((x) => x.day === day);
  if (!m || !r) return null;
  const { expected, pushes } = expect(m, r);
  const week = rows.filter((x) => x.day < day && x.day >= addDaysLite(day, -7)).map((x) => ({ day: x.day, expected: Math.round(expect(m, x).expected * 10) / 10, rated: x[outcome] }));
  return { outcome, day, usual: Math.round(m.b * 10) / 10, expected: Math.round(expected * 10) / 10, pushes, rated: r[outcome], n: rows.filter((x) => x.day < day && x[outcome] != null).length, week };
}
const addDaysLite = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** For the words: one step of a factor, per what's said ("each drink"). */
export const perStep = (k: FactorKey) => PER[k];
