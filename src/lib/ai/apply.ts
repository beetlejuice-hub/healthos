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
import { addDays } from "../time";

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
  const food: Food = { id, name: it.name, per100: { kcal: Math.round(p.kcal), p: p.p, c: p.c, f: p.f }, units: [unit], servingG: unit.g, source: "ai", ...(aka ? { aka } : {}), note: it.note };
  return { food, line: { food, count: Math.round((it.count ?? 1) * 4) / 4 || 1, unit: unit.name } };
}

export type Verdict = { state: "running" | "too-few" | "better" | "worse" | "no-clear-change"; daysIn: number; before: number | null; during: number | null; diff?: number; ci?: [number, number]; n: [number, number] };

type Measure = "energy" | "mood" | "focus" | "stress" | "sleep";
const MEASURES: Measure[] = ["energy", "mood", "focus", "stress", "sleep"];

/**
 * Before vs during: the 14 days before the start against the days since, on what it measures.
 * mood ~ during + weekend, so a protocol that started on a Friday doesn't get credit for the
 * weekend. "Better" only when the 95% interval excludes zero; with fewer than 5 rated days on
 * either side it says so instead of guessing. Stress counts as better when it goes down.
 * Sleep is the rating given the next morning, so a day's night is credited to that day (the
 * morning rating on the start day is the night before it began, and doesn't count as "during").
 */
export function judge(x: Experiment, days: DayFacts[], today: string): Verdict {
  const m: Measure = (MEASURES as string[]).includes(x.measure) ? (x.measure as Measure) : "energy";
  const from = addDays(x.start, -14), end = x.ended ?? today;
  const next = new Map(days.map((d) => [d.day, d.sleep]));
  const value = (d: DayFacts): number | null => (m === "sleep" ? next.get(addDays(d.day, 1)) ?? null : (d[m] as number | null));
  const rows = days.filter((d) => d.day >= from && d.day < end && value(d) != null);
  const before = rows.filter((d) => d.day < x.start), during = rows.filter((d) => d.day >= x.start);
  const mean = (r: DayFacts[]) => (r.length ? r.reduce((a, d) => a + value(d)!, 0) / r.length : null);
  const daysIn = Math.max(0, Math.round((Date.parse(end) - Date.parse(x.start)) / 86_400_000));
  const base = { daysIn, before: mean(before), during: mean(during), n: [before.length, during.length] as [number, number] };
  if (before.length < 5 || during.length < 5) return { ...base, state: daysIn < x.days ? "running" : "too-few" };
  const fit = ols(rows.map((d) => [1, d.day >= x.start ? 1 : 0, d.weekend ? 1 : 0]), rows.map((d) => value(d)!));
  if (!fit) return { ...base, state: "too-few" };
  const diff = fit.coef[1], half = tCrit(fit.df) * fit.se[1];
  const ci: [number, number] = [diff - half, diff + half];
  const good = m === "stress" ? -1 : 1;
  const state = daysIn < x.days ? "running" : ci[0] > 0 ? (good > 0 ? "better" : "worse") : ci[1] < 0 ? (good > 0 ? "worse" : "better") : "no-clear-change";
  return { ...base, state, diff, ci };
}
