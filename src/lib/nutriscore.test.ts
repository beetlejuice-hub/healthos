import { describe, expect, it } from "vitest";
import { nutriScore } from "./nutriscore";

// Worked by hand from the 2023 thresholds (bad: energy kJ, sugars, saturated fat, salt; good: protein, fibre, fruit/veg).
describe("Nutri-Score, general foods (2023)", () => {
  it("chicken breast, cooked: 690 kJ → 2 bad; protein 31 → 7 good; −5 → A", () => {
    const s = nutriScore({ kcal: 165, sugar: 0, satFat: 1.0, salt: 0.2, protein: 31, fiber: 0 });
    expect([s.bad, s.good, s.score, s.grade]).toEqual([2, 7, -5, "a"]);
    expect(s.parts).toMatchObject({ energy: 2, satFat: 0, salt: 0 }); // on a threshold is not above it
  });
  it("an apple: sugar 10.4 → 3 bad; all fruit → 5 good; −2 → A", () => {
    const s = nutriScore({ kcal: 52, sugar: 10.4, satFat: 0, salt: 0, protein: 0.3, fiber: 2.4, fvl: 100 });
    expect([s.bad, s.good, s.grade]).toEqual([3, 5, "a"]);
  });
  it("white toast: salt 1.2 → 5, energy 3, sugar 1 → 9 bad; protein 9 → 3 good; 6 → C", () => {
    const s = nutriScore({ kcal: 265, sugar: 5, satFat: 0.7, salt: 1.2, protein: 9, fiber: 2.7 });
    expect([s.parts.salt, s.bad, s.good, s.score, s.grade]).toEqual([5, 9, 3, 6, "c"]);
  });
  it("pizza: 14 bad, so its protein doesn't count; 14 → D", () => {
    const s = nutriScore({ kcal: 250, sugar: 3.6, satFat: 4.5, salt: 1.3, protein: 11, fiber: 2.3, fvl: 10 });
    expect([s.bad, s.parts.protein, s.score, s.grade]).toEqual([14, 0, 14, "d"]);
  });
  it("milk chocolate: 31 bad (sugar 15, saturated fat 10) → E", () => {
    const s = nutriScore({ kcal: 535, sugar: 59, satFat: 18.5, salt: 0.2, protein: 7.7, fiber: 3.4 });
    expect([s.parts.sugar, s.parts.satFat, s.bad, s.grade]).toEqual([15, 10, 31, "e"]);
  });
  it("cheese keeps its protein even past 11 bad points: Gouda 22 bad (salt 1.8 sits on a step: 8) − 7 protein = 15 → D, not E", () => {
    const gouda = { kcal: 356, sugar: 0.5, satFat: 17, salt: 1.8, protein: 25, fiber: 0 };
    expect([nutriScore(gouda).grade, nutriScore({ ...gouda, cheese: true }).score, nutriScore({ ...gouda, cheese: true }).grade]).toEqual(["e", 15, "d"]);
  });
  it("red meat counts at most 2 protein points", () => {
    const beef = { kcal: 176, sugar: 0, satFat: 4, salt: 0.2, protein: 20, fiber: 0 };
    expect([nutriScore(beef).parts.protein, nutriScore({ ...beef, redMeat: true }).parts.protein]).toEqual([7, 2]);
  });
  it("grade edges: 0 A, 1–2 B, 3–10 C, 11–18 D, 19 E", () => {
    // exact scores from salt points alone (0.2 g each)
    const at = (pts: number) => nutriScore({ kcal: 0, sugar: 0, satFat: 0, salt: pts * 0.2 + 0.01, protein: 0, fiber: 0 }).grade;
    expect([at(0), at(1), at(2), at(3), at(10), at(11), at(18), at(19)]).toEqual(["a", "b", "b", "c", "c", "d", "d", "e"]);
  });
});
