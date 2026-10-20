/**
 * One day's food at a glance (PLAN 128; owner, 20 Oct: "a simple window showing what i ate, the macros summary basically
 * for the day … when clicking on food on today page", "looking back to yesterday too" — and #113: "WHY CANT I REMOVE A
 * FOOD I LOGGED…??"). Everything eaten and every drink with calories on a calendar day — the same day and the same sum
 * as Today's Food card — grouped by meal, with each meal's calories and the day's macros. Pure.
 */

import type { Entry, EntryOf, Macros } from "./types";
import { add, macrosOf, ZERO } from "./nutrition";
import { localDay } from "./time";
import { amountText } from "./units";

export type FoodItem = EntryOf<"food"> | EntryOf<"drink">;
export type Meal = { name: string; items: FoodItem[]; kcal: number };
export type FoodDay = { day: string; meals: Meal[]; totals: Macros; count: number };

/** Meals by the hour they were logged at: night to 04, breakfast to 11, lunch to 15, afternoon to 18, dinner to 22, then late. */
const MEALS: [string, number][] = [["Night", 4], ["Breakfast", 11], ["Lunch", 15], ["Afternoon", 18], ["Dinner", 22], ["Late", 24]];
export const mealOf = (at: number) => { const h = new Date(at).getHours(); return MEALS.find(([, to]) => h < to)![0]; };

export function foodDay(entries: Entry[], day: string): FoodDay {
  const items = entries.filter((e): e is FoodItem => (e.kind === "food" || e.kind === "drink") && localDay(e.at) === day && macrosOf(e) != null).sort((a, b) => a.at - b.at);
  const meals = MEALS.map(([name]) => {
    const its = items.filter((e) => mealOf(e.at) === name);
    return { name, items: its, kcal: its.reduce((s, e) => s + macrosOf(e)!.kcal, 0) };
  }).filter((m) => m.items.length);
  return { day, meals, totals: items.reduce((a, e) => add(a, macrosOf(e)!), ZERO), count: items.length };
}

/** "1 bowl · 350 g", "330 ml": how much, as it was logged. */
export function amountOf(e: FoodItem): string {
  if (e.kind === "drink") return `${Math.round(e.ml)} ml`;
  return e.count != null && e.unit ? `${amountText(e.count, e.unit)} · ${Math.round(e.grams)} g` : `${Math.round(e.grams)} g`;
}
