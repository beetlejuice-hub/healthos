/**
 * Two things together (PLAN 209; owner, 11 Nov: "3, 4" — combinations: a late night *and* drinks against either alone).
 * Each pair of yes/no things about the evening and night before (late to bed, drinks, a short night, late caffeine,
 * trained, few steps, little protein, a low-HRV morning) splits the rated days four ways — neither, one, the other, both.
 * If the two just added up, days with both would sit at one alone + the other alone − neither; how far the days with both
 * sit from that is the pair's "together" (a 2×2 interaction), its standard error from each square's own spread
 * (Welch), a t-test, then Benjamini–Hochberg across every pair looked at (below). Needs 4+ days in
 * each square; q ≤ 0.05, stricter than lib/connect — a pair is noisier than a single link (PLAN 209 e2e: a chance
 * "drinks and a low-HRV morning: better together" at q 0.1). Goes with, not causes. Pure.
 */

import { bh, pT } from "./connect";
import { OUTCOMES, type DayRow, type OutcomeKey } from "./daytable";

export type FlagKey = "late" | "drinks" | "short" | "lateCaf" | "trained" | "fewSteps" | "lowProtein" | "lowHrv";
/** What each yes/no thing is: its yes and no in words, and whether a day is a yes (`cut` the median where it's relative). */
export const FLAGS: Record<FlagKey, { yes: string; no: string; of: (r: DayRow, med: Partial<Record<FlagKey, number>>) => boolean | null }> = {
  late: { yes: "late to bed", no: "to bed on time", of: (r) => (r.bed == null ? null : r.bed >= 0.5) },
  drinks: { yes: "drinks", no: "no drinks", of: (r) => (r.drinks == null ? null : r.drinks >= 0.75) },
  short: { yes: "a short night", no: "a full night", of: (r) => (r.asleep == null ? null : r.asleep < 6.5) },
  lateCaf: { yes: "late caffeine", no: "no late caffeine", of: (r) => (r.lateCaf == null ? null : r.lateCaf >= 50) },
  trained: { yes: "trained", no: "a rest day", of: (r) => (r.trained == null ? null : r.trained >= 0.5) },
  fewSteps: { yes: "few steps", no: "your usual steps", of: (r, m) => (r.steps == null || m.fewSteps == null ? null : r.steps < m.fewSteps) },
  lowProtein: { yes: "little protein", no: "your usual protein", of: (r, m) => (r.protein == null || m.lowProtein == null ? null : r.protein < m.lowProtein) },
  lowHrv: { yes: "a low-HRV morning", no: "a usual HRV morning", of: (r, m) => (r.hrv == null || m.lowHrv == null ? null : r.hrv < m.lowHrv) },
};
export const COMBO = { minEach: 4, minDays: 30, q: 0.05 } as const;

export type Cell = { m: number; n: number };
export type Verdict = "worse together" | "better together" | "one softens the other" | "one takes the edge off the other's good" | "adds up";
export type Combo = { a: FlagKey; b: FlagKey; outcome: OutcomeKey; cells: [[Cell, Cell], [Cell, Cell]]; add: number; both: number; inter: number; se: number; p: number; q: number;
  clear: boolean; verdict: Verdict; say: string; explainedBy?: string };

const median = (v: number[]) => { const s = [...v].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : undefined; };
const f1 = (v: number) => v.toFixed(1);

/** A pair's "together" and its variance from days split four ways (Welch), or null with fewer than `min` a square. */
function together(g: number[][][], min: number): { inter: number; v: number; df: number } | null {
  if (g.flat().some((c) => c.length < min)) return null;
  const m = g.map((row) => row.map((c) => c.reduce((s, v) => s + v, 0) / c.length));
  const w = g.flat().map((c, k) => { const mk = m[k >> 1][k & 1]; return Math.max(c.reduce((t, v) => t + (v - mk) ** 2, 0) / (c.length - 1), 0.05) / c.length; });
  const v = w.reduce((a, b) => a + b, 0);
  return { inter: m[1][1] - m[1][0] - m[0][1] + m[0][0], v, df: v ** 2 / w.reduce((a, b, k) => a + b ** 2 / (g.flat()[k].length - 1), 0) };
}

/** Every pair with 4+ days in each square, clear ones first (then by how far "together" is from adding up). */
export function combos(rows: DayRow[], outcome: OutcomeKey): Combo[] | null {
  const rated = rows.filter((r) => r[outcome] != null);
  if (rated.length < COMBO.minDays) return null;
  const med: Partial<Record<FlagKey, number>> = {
    fewSteps: median(rated.map((r) => r.steps).filter((v): v is number => v != null)),
    lowProtein: median(rated.map((r) => r.protein).filter((v): v is number => v != null)),
    lowHrv: median(rated.map((r) => r.hrv).filter((v): v is number => v != null)),
  };
  const keys = Object.keys(FLAGS) as FlagKey[], flag = new Map(keys.map((k) => [k, rated.map((r) => FLAGS[k].of(r, med))]));
  const out: Omit<Combo, "q" | "clear" | "verdict" | "say">[] = [];
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const fa = flag.get(keys[i])!, fb = flag.get(keys[j])!, g: number[][][] = [[[], []], [[], []]];
    rated.forEach((r, k) => { if (fa[k] != null && fb[k] != null) g[+fa[k]!][+fb[k]!].push(r[outcome]!); });
    // each square's own spread (Welch): other things mixed into a square widen it; degrees of freedom by Welch–Satterthwaite
    const t = together(g, COMBO.minEach);
    if (!t) continue;
    const cells = g.map((row) => row.map((c) => ({ m: c.reduce((s, v) => s + v, 0) / c.length, n: c.length }))) as Combo["cells"];
    const add = cells[1][0].m + cells[0][1].m - cells[0][0].m, both = cells[1][1].m, se = Math.sqrt(t.v);
    out.push({ a: keys[i], b: keys[j], outcome, cells, add, both, inter: t.inter, se, p: pT(t.inter / se, t.df) });
  }
  const qs = bh(out.map((c) => c.p)), name = OUTCOMES[outcome].name.toLowerCase();
  // a pair can be another pair showing through: one thing shared, and the other thing of a stronger clear pair unevenly
  // spread across its squares (PLAN 209 e2e: drink days with a low-HRV morning happened to have less late coffee, so
  // "drinks and a low-HRV morning" looked better together). Each clear pair, weakest last, is worked out again with that
  // other thing held still — within its days with it and without, weighed together — and kept only if it still holds.
  const order = out.map((_, k) => k).filter((k) => qs[k] <= COMBO.q).sort((x, y) => out[x].p - out[y].p), kept: number[] = [], explained = new Map<number, string>();
  for (const k of order) {
    const c = out[k];
    const by = kept.map((j) => out[j]).find((o) => [o.a, o.b].some((f) => f === c.a || f === c.b) && !(o.a === c.a && o.b === c.b));
    if (by) {
      const z = [by.a, by.b].find((f) => f !== c.a && f !== c.b)!, fz = flag.get(z)!, fa = flag.get(c.a)!, fb = flag.get(c.b)!;
      const parts = [false, true].map((zv) => { const g: number[][][] = [[[], []], [[], []]]; rated.forEach((r, i) => { if (fz[i] === zv && fa[i] != null && fb[i] != null) g[+fa[i]!][+fb[i]!].push(r[outcome]!); }); return together(g, 2); }).filter((x): x is NonNullable<typeof x> => !!x);
      const wsum = parts.reduce((a, x) => a + 1 / x.v, 0), inter = parts.reduce((a, x) => a + x.inter / x.v, 0) / (wsum || 1);
      // held to the same bar it first passed: its Benjamini–Hochberg step (q × its rank ÷ pairs looked at)
      const step = (COMBO.q * (out.filter((o) => o.p <= c.p).length)) / out.length;
      const still = parts.length > 0 && Math.sign(inter) === Math.sign(c.inter) && pT(inter * Math.sqrt(wsum), parts.reduce((a, x) => a + x.df, 0)) <= step;
      if (!still) { explained.set(k, `${by.a}:${by.b}`); continue; }
    }
    kept.push(k);
  }
  return out.map((c, k): Combo => {
    const clear = kept.includes(k), hurt = c.cells[1][0].m < c.cells[0][0].m || c.cells[0][1].m < c.cells[0][0].m;
    const verdict: Verdict = !clear ? "adds up" : c.inter < 0 ? (hurt ? "worse together" : "one takes the edge off the other's good") : hurt ? "one softens the other" : "better together";
    const A = FLAGS[c.a], B = FLAGS[c.b];
    const say = clear
      ? `${A.yes.charAt(0).toUpperCase() + A.yes.slice(1)} and ${B.yes} together: ${name} ${f1(c.both)} — ${f1(Math.abs(c.inter))} ${c.inter < 0 ? "lower" : "higher"} than the two alone would add up to (${f1(c.add)}).`
      : `${A.yes.charAt(0).toUpperCase() + A.yes.slice(1)} and ${B.yes}: about what the two add up to${explained.has(k) ? `, once ${FLAGS[explained.get(k)!.split(":").find((f) => f !== c.a && f !== c.b) as FlagKey].yes} is held still` : ""}.`;
    return { ...c, q: qs[k], clear, verdict, say, ...(explained.has(k) ? { explainedBy: explained.get(k) } : {}) };
  }).sort((x, y) => +y.clear - +x.clear || Math.abs(y.inter) / (y.se || 1) - Math.abs(x.inter) / (x.se || 1));
}
