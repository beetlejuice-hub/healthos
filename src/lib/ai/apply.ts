/**
 * Turning AI answers into the app's own data, and judging an experiment you chose to try.
 * Everything the AI estimates is saved as yours — a food, a drink — so it's used once and free
 * after that, marked "AI estimate" with what it assumed.
 */

import type { Drink, Food } from "../types";
import type { Line } from "../units";
import type { DrinkLine } from "../quickadd";
import type { DescribedItem } from "./tasks";
import type { DayFacts } from "../insights";
import type { Experiment } from "../store";
import { ols, tCrit } from "../regress";
import { pT } from "../connect";
import { addDays } from "../time";
import { xpCounted, xpEnd } from "./xpdays";
import { blockOn, nap } from "./blocks";

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** One described item → a saved food or drink and the basket line for it. `typed` is matched next time. */
export function fromDescribed(it: DescribedItem, id: string, typed?: string): { food: Food; line: Line } | { drink: Drink; line: DrinkLine } {
  const aka = typed ? fold(typed) : undefined;
  if (it.kind === "drink" && it.drink) {
    const d = it.drink;
    const drink: Drink = { id, name: it.name, ml: Math.round(d.ml), caffeineMg: Math.round(d.caffeineMg), alcoholG: Math.round(d.alcoholG * 10) / 10, kcal: Math.round(d.kcal), ...(aka ? { aka } : {}), note: it.note };
    return { drink, line: { drink, count: 1 } };
  }
  const unit = { name: it.unit!.name.toLowerCase(), g: Math.round(it.unit!.g) };
  const p = it.per100!;
  const n = it.nutri;
  const nutri = n ? { nutri: { sugar: n.sugar, satFat: n.satFat, salt: n.salt, fiber: n.fiber, ...(n.fvl ? { fvl: n.fvl } : {}), ...(n.redMeat ? { redMeat: true } : {}), ...(n.cheese ? { cheese: true } : {}) } } : {};
  const food: Food = { id, name: it.name, per100: { kcal: Math.round(p.kcal), p: p.p, c: p.c, f: p.f }, units: [unit], servingG: unit.g, source: "ai", ...(aka ? { aka } : {}), note: it.note, ...nutri };
  return { food, line: { food, count: Math.round((it.count ?? 1) * 4) / 4 || 1, unit: unit.name } };
}

export type Verdict = { state: "running" | "too-few" | "better" | "worse" | "no-clear-change"; daysIn: number; before: number | null; during: number | null; diff?: number; ci?: [number, number]; n: [number, number];
  /** How sure it went the good way (PLAN 210; owner, 11 Nov: "how sure"): from the same fit, the chance the true difference is on the good side (a flat prior: one-sided t). */
  sure?: number;
  /** ON beat OFF in this share of day pairs (PLAN 227: NAP, a second readout; before/during for the older kind). */ nap?: number };

/** The ratings, and (PLAN 229) the band's resting heart rate and HRV — a step in one can be tested as an experiment. */
type Measure = "energy" | "mood" | "focus" | "stress" | "sleep" | "rhr" | "hrv";
export const MEASURES: Measure[] = ["energy", "mood", "focus", "stress", "sleep", "rhr", "hrv"];

/**
 * Before vs during: the 14 days before the start against the days since, on what it measures.
 * mood ~ during + weekend, so a protocol that started on a Friday doesn't get credit for the
 * weekend. "Better" only when the 95% interval excludes zero; with fewer than 5 rated days on
 * either side it says so instead of guessing. Stress counts as better when it goes down.
 * Sleep is the rating given the next morning, so a day's night is credited to that day (the
 * morning rating on the start day is the night before it began, and doesn't count as "during").
 */
/**
 * A step's standard error and degrees of freedom with the days counted as fewer when what the fit leaves over carries over
 * from one day to the next (`days` in order; only neighbouring days count toward the correlation). The step itself runs in
 * one block, so its own carry-over is taken as full.
 */
export function carried(days: string[], e: number[], se: number, df: number): { se: number; df: number } {
  let c0 = 0, c1 = 0, k1 = 0;
  for (let i = 0; i < e.length; i++) { c0 += e[i] ** 2; if (i && days[i] === addDays(days[i - 1], 1)) { c1 += e[i] * e[i - 1]; k1++; } }
  const n = e.length, r0 = k1 >= 5 && c0 ? (c1 / k1) / (c0 / n) : 0, r = Math.min(0.9, Math.max(0, r0 + (1 + 4 * r0) / n));
  const nEff = Math.max(4, (n * (1 - r)) / (1 + r));
  return { se: se * Math.sqrt(n / nEff), df: Math.max(1, Math.min(df, nEff - 3)) };
}

/** `alpha`: the two-sided bar (0.05 at the end; stricter for a look before it, lib/ai/xpauto). */
export function judge(x: Experiment, days: DayFacts[], today: string, alpha = 0.05): Verdict {
  const m: Measure = (MEASURES as string[]).includes(x.measure) ? (x.measure as Measure) : "energy";
  // its days: from the start to its end (PLAN 189: later when you said you didn't do it), or to when you stopped it
  const last = xpEnd(x), stop = [x.ended ?? today, last].sort()[0], from = x.blocks ? x.start : addDays(x.start, -14);
  const next = new Map(days.map((d) => [d.day, d.sleep]));
  const value = (d: DayFacts): number | null => (m === "sleep" ? next.get(addDays(d.day, 1)) ?? null : (d[m] as number | null));
  // a day you said you didn't do it is left out — it's neither before nor during. In blocks (PLAN 227): ON days against
  // OFF days of the same weeks, each block's washout day left out; "before" is OFF and "during" ON.
  const place = (d: DayFacts) => (x.blocks ? blockOn(x.blocks, x.start, d.day) : null);
  const isOn = (d: DayFacts) => (x.blocks ? !!place(d)?.on : d.day >= x.start);
  const rows = days.filter((d) => d.day >= from && d.day < stop && value(d) != null && !(x.blocks && place(d)?.washout) && !(isOn(d) && x.did?.[d.day] === false) && (x.blocks || x.did?.[d.day] !== false));
  const before = rows.filter((d) => !isOn(d)), during = rows.filter(isOn);
  const mean = (r: DayFacts[]) => (r.length ? r.reduce((a, d) => a + value(d)!, 0) / r.length : null);
  // ended early because the answer was already clear (lib/ai/xpauto): judged on the days it had
  const daysIn = xpCounted(x, stop), going = stop < last && !x.early;
  const base = { daysIn, before: mean(before), during: mean(during), n: [before.length, during.length] as [number, number] };
  if (before.length < 5 || during.length < 5) return { ...base, state: going ? "running" : "too-few" };
  // (a straight line over the weeks was tried in blocks, 24 Nov: it found more, +1.5 in 39–47 % against 27–38 %, but
  // called drift alone in 10–14 % against 4–8 % — not a better trade for an app that mustn't sound sure on noise)
  const xs = (d: DayFacts) => [1, isOn(d) ? 1 : 0, d.weekend ? 1 : 0];
  const fit = ols(rows.map(xs), rows.map((d) => value(d)!));
  if (!fit) return { ...base, state: "too-few" };
  // Ratings carry over from day to day (a good week follows a good week), and before/during is one block against another:
  // with no allowance, flat ratings gave a verdict in 18 % of fake people at a carry-over of 0.4 and 37 % at 0.7 (audit,
  // 17 Nov). So the days count as fewer — effective n from the leftovers' lag-1 correlation — for the range and its t.
  const { se, df } = carried(rows.map((d) => d.day), rows.map((d) => value(d)! - xs(d).reduce((a, v, i) => a + v * fit.coef[i], 0)), fit.se[1], fit.df);
  const diff = fit.coef[1], half = tCrit(df, alpha) * se;
  const ci: [number, number] = [diff - half, diff + half];
  const good = m === "stress" || m === "rhr" ? -1 : 1;
  const state = going ? "running" : ci[0] > 0 ? (good > 0 ? "better" : "worse") : ci[1] < 0 ? (good > 0 ? "worse" : "better") : "no-clear-change";
  const t = se > 0 ? (good * diff) / se : 0, p = pT(Math.abs(t), df), sure = t >= 0 ? 1 - p / 2 : p / 2;
  const pairs = nap(during.map((d) => value(d)!), before.map((d) => value(d)!), good);
  return { ...base, state, diff, ci, sure, ...(pairs != null ? { nap: pairs } : {}) };
}
