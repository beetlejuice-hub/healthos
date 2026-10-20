/**
 * Nutri-Score, the EU front-of-pack grade, for one food per 100 g (PLAN 139; owner, 20 Oct: "how healthy … i know theres
 * a website or app for checking how good is the food … but thats for barcode readings only"). The 2023 update of the
 * public formula for general foods:
 *
 *   bad points   energy (kJ) 0–10 · sugars 0–15 · saturated fat 0–10 · salt 0–20
 *   good points  protein 0–7 · fibre 0–5 · fruit, vegetables and legumes 0–5
 *   score        bad − good, but protein isn't counted once bad points reach 11 (a salty, fatty food can't buy its way
 *                back with protein) — except in cheese; red meat counts at most 2 protein points
 *   grade        A ≤ 0 · B 1–2 · C 3–10 · D 11–18 · E 19+
 *
 * Drinks and fats/oils/nuts have their own tables in the formula; they aren't graded here (null) rather than graded wrong
 * — a packaged one gets Open Food Facts' own grade instead. Pure.
 */

export type NutriGrade = "a" | "b" | "c" | "d" | "e";
/** Per 100 g. `fvl`: fruit, vegetables and legumes, % of the food. */
export type NutriIn = { kcal: number; sugar: number; satFat: number; salt: number; protein: number; fiber: number; fvl?: number; redMeat?: boolean; cheese?: boolean };

/** Points: how many of the thresholds the value is above. */
const above = (v: number, steps: number[]) => steps.filter((t) => v > t).length;
const ENERGY_KJ = [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350];
const SUGARS = [3.4, 6.8, 10, 14, 17, 20, 24, 27, 31, 34, 37, 41, 44, 48, 51];
const SAT_FAT = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SALT = Array.from({ length: 20 }, (_, i) => Math.round((i + 1) * 0.2 * 10) / 10);
const PROTEIN = [2.4, 4.8, 7.2, 9.6, 12, 14, 17];
const FIBRE = [3.0, 4.1, 5.2, 6.3, 7.4];

export type NutriScore = { score: number; grade: NutriGrade; bad: number; good: number; parts: Record<"energy" | "sugar" | "satFat" | "salt" | "protein" | "fiber" | "fvl", number> };

export function nutriScore(x: NutriIn): NutriScore {
  const energy = above(x.kcal * 4.184, ENERGY_KJ), sugar = above(x.sugar, SUGARS), satFat = above(x.satFat, SAT_FAT), salt = above(x.salt, SALT);
  const fvlPct = x.fvl ?? 0, fvl = fvlPct > 80 ? 5 : fvlPct > 60 ? 2 : fvlPct > 40 ? 1 : 0;
  const fiber = above(x.fiber, FIBRE), protein = Math.min(x.redMeat ? 2 : 7, above(x.protein, PROTEIN));
  const bad = energy + sugar + satFat + salt;
  const counts = bad < 11 || !!x.cheese;
  const good = (counts ? protein : 0) + fiber + fvl;
  const score = bad - good;
  const grade: NutriGrade = score <= 0 ? "a" : score <= 2 ? "b" : score <= 10 ? "c" : score <= 18 ? "d" : "e";
  return { score, grade, bad, good, parts: { energy, sugar, satFat, salt, protein: counts ? protein : 0, fiber, fvl } };
}
