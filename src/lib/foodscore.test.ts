import { describe, expect, it } from "vitest";
import { foodScore, hoursBeforeBed, itemScore, plateScore } from "./foodscore";
import { BASIC_FOODS } from "./foods-basic";
import type { EntryOf, Food } from "./types";

// PLAN 139 — owner, 20 Oct: "a food/plate score system … how healthy, how good it is for my goal, etc, how good is the timing".
const B = (name: string) => BASIC_FOODS.find((f) => f.name === name)!;
const BED = 23 * 60;
const at = (hm: string) => new Date(`2026-10-20T${hm}:00`).getTime();
const eat = (f: Food, grams: number, hm: string): EntryOf<"food"> => ({ id: f.id, kind: "food", at: at(hm), foodId: f.id, name: f.name, grams,
  macros: { kcal: f.per100.kcal * grams / 100, p: f.per100.p * grams / 100, c: f.per100.c * grams / 100, f: f.per100.f * grams / 100 } });
const S = (f: Food, g: number, hm: string) => itemScore(eat(f, g, hm), f, BED)!;
const parts = (s: ReturnType<typeof S>) => s.parts.map((p) => `${p.id} ${p.got}/${p.max}`).join(" · ");

describe("each thing you ate, 0–100: goal 45, quality 35, timing 20", () => {
  it("chicken breast at lunch: 18.8 g protein per 100 kcal, Nutri-Score A, 10 h before bed → 100", () => {
    const s = S(B("Chicken breast, cooked"), 150, "13:00");
    expect([s.score, parts(s), s.grade]).toEqual([100, "goal 45/45 · quality 35/35 · timing 20/20", "a"]);
  });
  it("an apple beats a pizza — the quality part is why there's no score without it", () => {
    const apple = S(B("Apple"), 180, "13:00"), pizza = S(B("Pizza margherita"), 300, "13:00");
    expect([apple.score, pizza.score, pizza.grade]).toEqual([56, 43, "d"]); // apple 1.3 + 35 + 20; pizza 14.6 + 8.8 + 20
    expect(apple.score!).toBeGreaterThan(pizza.score!);
  });
  it("oats at breakfast: 3.4 g protein per 100 kcal, A (fibre 10) → 65", () => {
    expect([S(B("Oats (zabpehely)"), 80, "07:40").score, S(B("Oats (zabpehely)"), 80, "07:40").grade]).toEqual([65, "a"]);
  });
  it("timing: 3 h+ full, 1.5 h a quarter, 1 h or less none, after midnight none", () => {
    const t = (hm: string) => S(B("Greek yoghurt 0%"), 150, hm).parts.find((p) => p.id === "timing")!;
    expect(["20:00", "21:30", "22:00", "23:30"].map((hm) => t(hm).got)).toEqual([20, 5, 0, 0]);
    expect(t("21:30").why).toBe("1.5 h before bed");
    expect(hoursBeforeBed(at("00:40"), BED)).toBeLessThan(0); // a 00:40 snack is after that night's bedtime
  });
  it("milk chocolate at 22:30: E and late → 3; a beer: alcohol scores no quality", () => {
    expect(S(B("Milk chocolate"), 40, "22:30").score).toBe(3);
    const beer: EntryOf<"drink"> = { id: "b", kind: "drink", at: at("19:00"), name: "Beer", ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 215 };
    expect(itemScore(beer, undefined, BED)).toMatchObject({ score: 20, parts: [{ id: "goal", got: 0 }, { id: "quality", got: 0, why: "alcohol" }, { id: "timing", got: 20 }] });
  });
  it("no score without quality — it says what's missing; under 15 kcal isn't scored", () => {
    const mine: Food = { id: "custom:x", name: "Mom's stew", per100: { kcal: 120, p: 8, c: 10, f: 5 }, source: "custom" };
    expect(itemScore(eat(mine, 300, "13:00"), mine, BED)).toMatchObject({ score: null, missing: "its sugar, saturated fat, fibre and salt aren't known yet" });
    expect(itemScore(eat(B("Olive oil"), 10, "13:00"), B("Olive oil"), BED)).toMatchObject({ score: null, missing: expect.stringContaining("oils, butter and nuts") });
    const coffee: EntryOf<"drink"> = { id: "c", kind: "drink", at: at("08:00"), name: "Long coffee", ml: 300, caffeineMg: 150, alcoholG: 0, kcal: 4 };
    expect(itemScore(coffee, undefined, BED)).toBeNull();
  });
  it("a pack's own grade wins over working it out", () => {
    const bar = { ...B("Protein bar"), id: "off:1", grade: "e" as const, source: "off" as const };
    expect(S(bar, 60, "13:00").grade).toBe("e");
  });
});

describe("a plate: its items weighed by calories", () => {
  it("chicken 247.5 kcal at 100 + rice 195 kcal at 60 → (24 750 + 11 700) / 442.5 = 82.4 → 82", () => {
    const c = S(B("Chicken breast, cooked"), 150, "13:00"), r = S(B("White rice, cooked"), 150, "13:00");
    expect([c.score, r.score]).toEqual([100, 60]);
    expect(plateScore([{ kcal: 247.5, s: c }, { kcal: 195, s: r }])).toEqual({ score: 82, unscored: 0 });
  });
  it("no plate score while something big enough has none; a black coffee doesn't hold it up", () => {
    const c = S(B("Chicken breast, cooked"), 150, "13:00");
    expect(plateScore([{ kcal: 247.5, s: c }, { kcal: 360, s: { score: null, parts: [], grade: null, missing: "x" } }])).toEqual({ score: null, unscored: 1 });
    expect(plateScore([{ kcal: 247.5, s: c }, { kcal: 4, s: null }])).toEqual({ score: 100, unscored: 0 });
  });
});

// owner, 27 Oct: "FOR each food if i click on it it should show the score - based on how much macro it has, and how good it is
// for my goal" — "3c": in the search results too, before it's logged
describe("a food's score before it's logged (the search rows)", () => {
  it("the same as logging it then — any portion — chicken breast 100 at lunch, a pizza 43", () => {
    expect(foodScore(B("Chicken breast, cooked"), at("13:00"), BED)!.score).toBe(S(B("Chicken breast, cooked"), 150, "13:00").score);
    expect(foodScore(B("Pizza margherita"), at("13:00"), BED)!.score).toBe(S(B("Pizza margherita"), 300, "13:00").score);
    expect(foodScore(B("Chicken breast, cooked"), at("13:00"), BED)!.score).toBe(100);
  });
  it("timed by when you're logging it for: the same yoghurt at 22:00 loses its timing", () => {
    const y = B("Greek yoghurt 0%");
    expect(foodScore(y, at("13:00"), BED)!.score! - foodScore(y, at("22:00"), BED)!.score!).toBe(20);
  });
  it("a saved copy of a basic food gets the table's nutrients (as on the day sheet); a food with none says what's missing", () => {
    const { nutri: _n, ...bare } = B("Apple") as Food & { nutri?: unknown };
    expect(foodScore(bare as Food, at("13:00"), BED)!.score).toBe(56);
    const mystery: Food = { id: "x1", name: "Something", per100: { kcal: 200, p: 5, c: 20, f: 10 }, source: "custom" } as Food;
    expect(foodScore(mystery, at("13:00"), BED)).toMatchObject({ score: null, missing: "its sugar, saturated fat, fibre and salt aren't known yet" });
  });
});
