/**
 * When a typed item isn't one of your foods or the built-in ones: look it up in the food database
 * and take the **median** of the matching products (owner: "if it finds bacon at 5 g and 10 g
 * protein… if they're all similar it should take the median"). One odd label can't move a median,
 * and labels that don't add up are left out (foodgroup.plausible). The amount: grams if you typed
 * them, else the products' typical serving, else a rough weight for the unit word you used
 * ("2 slices of salami" → 2 × 10 g). Always marked as an estimate, with how many products it's from.
 */

import type { Food } from "./types";
import { fold, groupFoods, plausible } from "./foodgroup";
import { readAmount, tokens } from "./quickadd";
import type { Line } from "./units";

/** Rough weights for a unit word when the database gives no serving. Generic, so marked "about". */
export const GENERIC_UNIT_G: Record<string, number> = {
  slice: 25, piece: 50, serving: 100, portion: 250, plate: 300, bowl: 250, glass: 250, tbsp: 15, spoon: 15, tsp: 5, handful: 30, scoop: 30,
};

export type Estimate = { line: Line; basis: number; kcalRange?: [number, number]; how: string };

export function fromDatabase(text: string, foods: Food[]): Estimate | null {
  const a = readAmount(tokens(text));
  const query = a.words.join(" ");
  if (query.length < 2) return null;
  const words = fold(query).split(" ").filter((w) => w.length >= 3);
  const named = (name: string) => { const n = fold(name); return words.every((w) => n.includes(w) || n.includes(w.replace(/s$/, ""))); };
  const row = groupFoods(foods, query).find((r) => (r.kind === "group" ? named(r.typical.name) : named(r.food.name) && !r.suspect));
  if (!row) return null;
  const food: Food = row.kind === "group" ? row.typical : row.food;
  if (!plausible(food.per100)) return null;
  const basis = row.kind === "group" ? (food.basis ?? row.items.length) : 1;
  const n = (a.count ?? 1) * a.size;
  const unitWord = a.unitWant?.[0];
  let line: Line, how: string;
  if (a.grams != null) { line = { food, count: 1, unit: null, grams: a.grams }; how = `${a.grams} g as typed`; }
  else if (unitWord && GENERIC_UNIT_G[unitWord]) {
    const g = GENERIC_UNIT_G[unitWord];
    line = { food: { ...food, units: [{ name: unitWord, g }] }, count: n, unit: unitWord };
    how = `a ${unitWord} ≈ ${g} g (rough)`;
  } else if (food.servingG) { line = { food, count: n, unit: "serving" }; how = `a serving ≈ ${food.servingG} g (from the labels)`; }
  else { line = { food, count: 1, unit: null, grams: Math.round(100 * n) }; how = "100 g each — tap to change"; }
  return { line, basis, kcalRange: row.kind === "group" ? row.kcalRange : undefined, how };
}
