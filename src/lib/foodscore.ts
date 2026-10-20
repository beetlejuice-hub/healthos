/**
 * A score for each thing you ate and each plate, 0–100 (PLAN 139; owner, 20 Oct: "a food/plate score system … how
 * healthy, how good it is for my goal, etc, how good is the timing … a score next to the plate, for each item and for in
 * total too"). Worked out by the app — nothing to type ("I wont really b able to add the number or letter for home foods").
 * Goal first (his pick):
 *
 *   Goal 45     protein per 100 kcal — what keeps muscle while losing fat: 8 g+ full, 5 g half, 3 g or less little
 *               (chicken breast 19, eggs 9, pizza 4, rice 2).
 *   Quality 35  its Nutri-Score (lib/nutriscore): A 35 · B 28 · C 18 · D 9 · E 0. Alcohol 0.
 *   Timing 20   hours before your bedtime: 3 h+ full, 1 h or less none (a late meal goes with worse sleep in your own
 *               nights — the Sleep page's "last meal before bed").
 *
 * No score until its quality is known: without it an apple scores like a pizza (both low in protein), so it says what's
 * missing instead. Under 15 kcal (black coffee) isn't scored. A plate is its items weighed by calories. Never "bad food":
 * a score says how it fits the goal. Pure.
 */

import type { Food } from "./types";
import type { FoodItem } from "./foodday";
import { macrosOf } from "./nutrition";
import { nutriScore, type NutriGrade } from "./nutriscore";
import { bedtimeOn } from "./caffeine-sleep";
import { addDays, localDay } from "./time";

export const FOOD_SCORE = { goal: 45, quality: 35, timing: 20, minKcal: 15 } as const;
const QUALITY: Record<NutriGrade, number> = { a: 1, b: 0.8, c: 0.5, d: 0.25, e: 0 };
const H = 3_600_000;

export type ScorePart = { id: "goal" | "quality" | "timing"; name: string; got: number; max: number; why: string };
export type ItemScore = { score: number | null; parts: ScorePart[]; grade: NutriGrade | null; missing?: string };

/** Straight lines between points, flat past the ends. */
const curve = (pts: [number, number][], x: number) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0); }
  return pts[pts.length - 1][1];
};
const r1 = (v: number) => Math.round(v * 10) / 10;

/** A food's Nutri-Score: the pack's (Open Food Facts), else worked out from its nutrients; or why there isn't one. */
export function gradeOf(food: Food | undefined): { grade: NutriGrade | null; why: string } {
  if (!food) return { grade: null, why: "not a food the app knows" };
  if (food.grade) return { grade: food.grade, why: `Nutri-Score ${food.grade.toUpperCase()}, from the pack` };
  if (food.nutri) {
    const n = nutriScore({ kcal: food.per100.kcal, protein: food.per100.p, ...food.nutri });
    return { grade: n.grade, why: `Nutri-Score ${n.grade.toUpperCase()}` };
  }
  return { grade: null, why: food.noGrade === "drink" ? "drinks have their own Nutri-Score table — not graded yet"
    : food.noGrade === "fats" ? "oils, butter and nuts have their own Nutri-Score table — not graded yet"
    : food.parts?.length ? "a plate you made — what's in it isn't graded yet"
    : "its sugar, saturated fat, fibre and salt aren't known yet" };
}

/** Hours from eating to that evening's bedtime (after midnight, before 04:00: the night already started — negative). */
export function hoursBeforeBed(at: number, bedMinute: number): number {
  const d = new Date(at), day = d.getHours() < 4 ? addDays(localDay(at), -1) : localDay(at);
  return (bedtimeOn(day, bedMinute) - at) / H;
}

/** One logged item's score, or null when it's too small to score. `food`: what it was logged from, when known. */
export function itemScore(e: FoodItem, food: Food | undefined, bedMinute: number): ItemScore | null {
  const m = macrosOf(e);
  if (!m || m.kcal < FOOD_SCORE.minKcal) return null;
  const alcohol = e.kind === "drink" && e.alcoholG > 0;
  const per100 = (100 * m.p) / m.kcal;
  const goal: ScorePart = { id: "goal", name: "For your goal", max: FOOD_SCORE.goal, got: r1(FOOD_SCORE.goal * curve([[0, 0], [3, 0.15], [5, 0.5], [8, 1]], per100)), why: `${per100.toFixed(1)} g protein per 100 kcal` };
  const g = alcohol ? { grade: null, why: "alcohol" } : gradeOf(food);
  const quality: ScorePart | null = alcohol ? { id: "quality", name: "Quality", max: FOOD_SCORE.quality, got: 0, why: "alcohol" }
    : g.grade ? { id: "quality", name: "Quality", max: FOOD_SCORE.quality, got: r1(FOOD_SCORE.quality * QUALITY[g.grade]), why: g.why } : null;
  const h = hoursBeforeBed(e.at, bedMinute);
  const timing: ScorePart = { id: "timing", name: "Timing", max: FOOD_SCORE.timing, got: r1(FOOD_SCORE.timing * curve([[1, 0], [3, 1]], h)),
    why: h >= 3 ? "3 h or more before bed" : h <= 0 ? "after your bedtime" : `${h.toFixed(1)} h before bed` };
  const parts = [goal, ...(quality ? [quality] : []), timing];
  return quality ? { score: Math.round(parts.reduce((a, p) => a + p.got, 0)), parts, grade: g.grade } : { score: null, parts, grade: null, missing: g.why };
}

/** A plate: its scored items weighed by calories; null while any item big enough to count has no score. */
export function plateScore(items: { kcal: number; s: ItemScore | null }[]): { score: number | null; unscored: number } {
  const counted = items.filter((x) => x.kcal >= FOOD_SCORE.minKcal), unscored = counted.filter((x) => x.s?.score == null).length;
  if (!counted.length || unscored) return { score: null, unscored };
  const kcal = counted.reduce((a, x) => a + x.kcal, 0);
  return { score: Math.round(counted.reduce((a, x) => a + x.kcal * x.s!.score!, 0) / kcal), unscored: 0 };
}
