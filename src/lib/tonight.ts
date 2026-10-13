/**
 * Tonight (PLAN 88): in the evening, what your own nights say about nights like this one — the grid's clear and likely
 * cells for the rows that hold this evening so far (caffeine by bedtime from what's logged, a late meal, a late workout,
 * evening stress, magnesium). Facts of the evening only: a planned bedtime isn't one yet, and today's steps aren't done.
 * Past tense on purpose — "nights like that went with", never "will". Pure.
 */

import { MIN, HOUR, addDays, localDay } from "./time";
import type { Cell, Evening, Factor, Night } from "./sleep";

/** Rows that need the night itself or a finished day, or a morning answer: not known in the evening. */
const NOT_TONIGHT = new Set(["latebed", "nap", "steps"]);

export type TonightLine = { factor: Factor; cell: Cell; kind: "holds" | "missing" };

/** A night that hasn't happened: the evening of `eve`, bed at `bed`. Enough for evenings() and the rows' `has`. */
export function tonightNight(eve: string, bed: number): Night {
  return { id: "tonight", day: addDays(eve, 1), eve, bed, up: bed + 8 * HOUR, onset: bed + 15 * MIN, wake: bed + 8 * HOUR - 5 * MIN, asleep: 0, deep: null, rem: null, light: null,
    awake: 0, wakes: 0, latency: 0, stages: [], low: null, lowAt: null, hrv: null, rhr: null, nap: null };
}

/** The evening `now` belongs to: before 04:00 you're still in last night's. */
export const tonightEve = (now: number) => localDay(new Date(now).getHours() < 4 ? now - 4 * HOUR : now);

/**
 * The lines, surest first, one per row, at most `max`: rows that hold tonight ("holds"), and a supplement whose nights
 * went with better sleep but that isn't logged today ("missing").
 */
export function tonightLines(factors: Factor[], cells: Cell[], n: Night, e: Evening, max = 3): TonightLine[] {
  const sure = (c: Cell) => c.sure === "clear" || c.sure === "likely";
  const out: TonightLine[] = [];
  for (const f of factors) {
    if (NOT_TONIGHT.has(f.id) || f.id.startsWith("tag:")) continue;
    const mine = cells.filter((c) => c.factor === f.id && sure(c)).sort((a, b) => a.p! - b.p!);
    if (!mine.length) continue;
    const known = !f.known || f.known(n, e);
    if (known && f.has(n, e)) out.push({ factor: f, cell: mine[0], kind: "holds" });
    else if (!known && f.id.startsWith("supp:")) { const better = mine.find((c) => c.toward === "better"); if (better) out.push({ factor: f, cell: better, kind: "missing" }); }
  }
  // rows that say the same thing about one evening ("ate after 21:00", "ate within 2 h of bed"): only the surer one
  const seen = new Set<string>();
  return out.sort((a, b) => a.cell.p! - b.cell.p!).filter((l) => { const g = SAME[l.factor.id] ?? l.factor.id; return seen.has(g) ? false : (seen.add(g), true); }).slice(0, max);
}
const SAME: Record<string, string> = { late: "lateMeal", meal2h: "lateMeal" };

const r0 = (v: number) => Math.round(Math.abs(v)), r1 = (v: number) => Math.round(Math.abs(v) * 10) / 10;
/** "22 min less deep sleep", "took 19 min longer to fall asleep" — a cell's difference in words. */
export function phrase(outcome: string, d: number): string {
  const up = d > 0;
  switch (outcome) {
    case "asleep": return `${r0(d)} min ${up ? "more" : "less"} asleep`;
    case "latency": return `${r0(d)} min ${up ? "longer" : "quicker"} to fall asleep`;
    case "deep": return `${r0(d)} min ${up ? "more" : "less"} deep sleep`;
    case "rem": return `${r0(d)} min ${up ? "more" : "less"} REM`;
    case "awake": return `${r0(d)} min ${up ? "more" : "less"} awake in the night`;
    case "wakes": return `${r1(d)} ${up ? "more" : "fewer"} wakings`;
    case "low": return `lowest heart rate ${r1(d)} bpm ${up ? "higher" : "lower"}`;
    case "lowAt": return `lowest heart rate ${r0(d)} min ${up ? "later" : "earlier"}`;
    case "hrv": return `HRV ${r1(d)} ms ${up ? "higher" : "lower"}`;
    case "rating": return `rated ${r1(d)} ${up ? "higher" : "lower"}`;
    default: return `${outcome} ${up ? "+" : "−"}${r1(d)}`;
  }
}
