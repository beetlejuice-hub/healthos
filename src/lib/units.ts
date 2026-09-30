/**
 * Counting food instead of weighing it (owner: "I would not weigh my food… good enough is good
 * enough"). A food's everyday units (egg, slice, apple…) turn a count into grams; totals are shown
 * as ≈ and rounded to 10 kcal, which is the honest precision of a counted meal.
 */

import type { Food, Macros, Unit } from "./types";
import { forGrams } from "./nutrition";

/** The units a food can be counted in: its own list, else its serving, else none (grams only). */
export function unitsOf(f: Food): Unit[] {
  if (f.units?.length) return f.units;
  if (f.servingG) return [{ name: "serving", g: f.servingG }];
  return [];
}

const IRREGULAR: Record<string, string> = { half: "halves", "palm-size": "palm-size", tbsp: "tbsp", tsp: "tsp", "thin spread": "thin spreads", splash: "splashes", glass: "glasses", sandwich: "sandwiches", lángos: "lángos", gyros: "gyros", kifli: "kifli", "egg white": "egg whites", "small apple": "small apples", "large apple": "large apples", "large egg": "large eggs", "big bag": "big bags", peach: "peaches", potato: "potatoes", tomato: "tomatoes", portion: "portions" };

export function plural(unit: string, n: number): string {
  if (n > 0 && n <= 1) return unit;
  if (IRREGULAR[unit]) return IRREGULAR[unit];
  if (/(s|x|ch|sh)$/.test(unit)) return `${unit}es`;
  return `${unit}s`;
}

const FRACTIONS: [number, string][] = [[0.25, "¼"], [0.5, "½"], [0.75, "¾"]];
/** 2 → "2", 0.5 → "½", 1.5 → "1½". */
export function countText(n: number): string {
  const whole = Math.floor(n), frac = n - whole;
  const f = FRACTIONS.find(([v]) => Math.abs(v - frac) < 0.01)?.[1];
  if (f) return `${whole || ""}${f}`;
  return String(Math.round(n * 100) / 100);
}

export const amountText = (count: number, unit: string) => `${countText(count)} ${plural(unit, count)}`;

/** One line in the meal basket: a food and how much of it. */
export type Line = { food: Food; count: number; unit: string | null; /** Only when unit is null. */ grams?: number };

export function gramsOf(l: Line): number {
  if (l.unit == null) return l.grams ?? 100;
  const u = unitsOf(l.food).find((x) => x.name === l.unit);
  return (u?.g ?? 100) * l.count;
}

export const macrosOfLine = (l: Line): Macros => forGrams(l.food.per100, gramsOf(l));

/** ≈ rounded to 10 kcal. */
export const approx = (kcal: number) => Math.round(kcal / 10) * 10;

/** The next count on the − / + stepper: halves below 1, whole numbers above. */
export const step = (n: number, dir: 1 | -1) => {
  if (dir > 0) return n < 1 ? n + 0.5 : Math.floor(n) + 1;
  return n <= 1 ? Math.max(0.5, n - 0.5) : Math.ceil(n) - 1;
};

/** A basket saved as a meal: "Arnold's special", makes 6 pieces → a food counted in pieces. */
export function mealFood(id: string, name: string, lines: Line[], pieces: number, unit = "piece"): Food {
  const grams = lines.reduce((a, l) => a + gramsOf(l), 0);
  const m = lines.reduce((a, l) => { const x = macrosOfLine(l); return { kcal: a.kcal + x.kcal, p: a.p + x.p, c: a.c + x.c, f: a.f + x.f }; }, { kcal: 0, p: 0, c: 0, f: 0 });
  const k = 100 / grams;
  return {
    id, name, source: "custom",
    per100: { kcal: m.kcal * k, p: m.p * k, c: m.c * k, f: m.f * k },
    units: [{ name: unit, g: Math.round((grams / pieces) * 10) / 10 }, { name: "whole batch", g: Math.round(grams) }],
    servingG: Math.round(grams / pieces),
  };
}
