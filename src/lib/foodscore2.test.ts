import { describe, expect, it } from "vitest";
import { fromOff } from "./off";
import { checkDescribe, type DescribedItem } from "./ai/tasks";
import { fromDescribed } from "./ai/apply";
import { gradeOf, itemScore } from "./foodscore";
import type { EntryOf, Food } from "./types";

// PLAN 139 phase 2 — where a food's quality comes from: the pack (Open Food Facts), or the AI's nutrients for home food.
describe("packaged food: Open Food Facts' own grade and label", () => {
  it("keeps the pack's Nutri-Score, and the label's sugar, saturated fat, salt and fibre", () => {
    const f = fromOff({ code: "1", product_name: "Müzli", nutriscore_grade: "B", nutriments: { "energy-kcal_100g": 370, proteins_100g: 9, carbohydrates_100g: 62, fat_100g: 7, sugars_100g: 14, "saturated-fat_100g": 1.2, salt_100g: 0.1, fiber_100g: 8 } })!;
    expect([f.grade, f.nutri]).toEqual(["b", { sugar: 14, satFat: 1.2, salt: 0.1, fiber: 8 }]);
    expect(gradeOf(f)).toEqual({ grade: "b", why: "Nutri-Score B, from the pack" });
  });
  it("no grade on the pack: worked out from the label; salt from sodium when that's all there is", () => {
    const f = fromOff({ code: "2", product_name: "Chips", nutriscore_grade: "unknown", nutriments: { "energy-kcal_100g": 536, proteins_100g: 7, carbohydrates_100g: 53, fat_100g: 34, sugars_100g: 0.5, "saturated-fat_100g": 3.1, sodium_100g: 0.52, fiber_100g: 4.4 } })!;
    expect(f.grade).toBeUndefined();
    expect(f.nutri!.salt).toBeCloseTo(1.3, 5);
    expect(gradeOf(f).grade).toBe("d");
  });
  it("half a label isn't graded — a grade from half the numbers would be a guess", () => {
    const f = fromOff({ code: "3", product_name: "Bar", nutriments: { "energy-kcal_100g": 400, proteins_100g: 5, carbohydrates_100g: 60, fat_100g: 15, sugars_100g: 30 } })!;
    expect([f.grade, f.nutri, gradeOf(f).grade]).toEqual([undefined, undefined, null]);
  });
});

describe("home food: the AI's nutrients, in the same call that describes it", () => {
  const stew: DescribedItem = { kind: "food", name: "Paprikás krumpli", amount: "1 plate", per100: { kcal: 95, p: 3, c: 12, f: 4 }, unit: { name: "plate", g: 400 }, count: 1, confidence: "medium", note: "home recipe with sausage",
    nutri: { sugar: 2, satFat: 1.4, salt: 0.8, fiber: 1.8, fvl: 20, redMeat: true, cheese: false } };
  it("kept, saved on the food, and the food gets a score", () => {
    const { items } = checkDescribe({ items: [stew] });
    const made = fromDescribed(items[0], "custom:ai-1") as { food: Food };
    expect(made.food.nutri).toEqual({ sugar: 2, satFat: 1.4, salt: 0.8, fiber: 1.8, fvl: 20, redMeat: true });
    const e: EntryOf<"food"> = { id: "e", kind: "food", at: new Date("2026-10-20T13:00:00").getTime(), foodId: made.food.id, name: stew.name, grams: 400, macros: { kcal: 380, p: 12, c: 48, f: 16 } };
    const s = itemScore(e, made.food, 23 * 60)!;
    expect([s.grade, s.score]).toEqual(["c", 46]); // energy 1 + salt 4 = 5 bad, protein 1 → 4: C · 3.16 g/100 kcal → 8.0 + 17.5 + 20 = 45.5
  });
  it("nutrients that can't be right (sugar above the carbs) are dropped — the food stays, ungraded", () => {
    const { items, dropped } = checkDescribe({ items: [{ ...stew, nutri: { ...stew.nutri!, sugar: 40 } }] });
    expect([items.length, dropped.length, items[0].nutri]).toEqual([1, 0, undefined]);
  });
});
