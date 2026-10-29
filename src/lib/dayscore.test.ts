import { describe, expect, it } from "vitest";
import { dayScore, dayScoreLines, leftLine, weakest } from "./dayscore";
import { BASIC_FOODS } from "./foods-basic";
import type { Entry, Food } from "./types";

// Owner, 21 Oct: "food notrution score can be bult too" … "do whatever" (the day score first). Foods with round numbers so
// every part can be worked out by hand.
const DAY = "2026-10-20", at = (hm: string) => new Date(`${DAY}T${hm}:00`).getTime();
const GOALS = { kcal: 2000, p: 150 }, BED = 23 * 60;
const food = (id: string, kcal: number, p: number, c: number, f: number, nutri?: Food["nutri"]): Food => ({ id, name: id, per100: { kcal, p, c, f }, source: "custom", ...(nutri ? { nutri } : {}) } as Food);
const FOODS = [
  food("porridge", 380, 13, 68, 7, { sugar: 1, satFat: 1, fiber: 10, salt: 0 }),
  food("whey", 400, 80, 8, 6, { sugar: 4, satFat: 2, fiber: 0, salt: 0.5 }),
  food("chicken", 165, 31, 0, 3.6, { sugar: 0, satFat: 1, fiber: 0, salt: 0.2 }),
  food("rice", 130, 2.7, 28, 0.3, { sugar: 0.1, satFat: 0.1, fiber: 0.4, salt: 0 }),
  food("veg", 35, 2.5, 6, 0.3, { sugar: 2, satFat: 0, fiber: 3, salt: 0.1, fvl: 100 }),
  food("apple", 52, 0.3, 14, 0.2, { sugar: 10, satFat: 0, fiber: 2.4, salt: 0, fvl: 100 }),
  food("salmon", 200, 22, 0, 12, { sugar: 0, satFat: 2.5, fiber: 0, salt: 0.2 }),
  food("potato", 77, 2, 17, 0.1, { sugar: 0.9, satFat: 0, fiber: 1.8, salt: 0.01 }),
  food("pizza", 250, 10, 31, 9, { sugar: 3.5, satFat: 4.5, fiber: 2, salt: 1.3 }),
  food("chips", 540, 6, 50, 35, { sugar: 1, satFat: 3, fiber: 4, salt: 1.5 }),
  food("homemade", 200, 10, 20, 8),
];
let n = 0;
const eat = (foodId: string, grams: number, hm: string): Entry => {
  const f = FOODS.find((x) => x.id === foodId) ?? BASIC_FOODS.find((x) => x.id === foodId)!, k = grams / 100;
  return { id: `e${n++}`, kind: "food", at: at(hm), foodId, name: f.name, grams, macros: { kcal: f.per100.kcal * k, p: f.per100.p * k, c: f.per100.c * k, f: f.per100.f * k } };
};
const beer = (hm: string): Entry => ({ id: `b${n++}`, kind: "drink", at: at(hm), name: "Beer", ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 210 });
const part = (s: NonNullable<ReturnType<typeof dayScore>>, id: string) => s.parts.find((p) => p.id === id);

describe("the day's food score", () => {
  it("a day that hits it all: 100 — and each part says why", () => {
    // 1,935 kcal, 161 g protein in 3 meals of 25 g+, fibre 30 g, 500 g of fruit and veg, last meal 4 h before bed, no alcohol
    const es = [eat("porridge", 100, "08:00"), eat("whey", 40, "08:00"), eat("chicken", 200, "13:00"), eat("rice", 250, "13:00"), eat("veg", 300, "13:00"),
      eat("apple", 200, "16:00"), eat("salmon", 150, "19:00"), eat("potato", 300, "19:00")];
    const s = dayScore(es, FOODS, GOALS, BED, DAY)!;
    expect(s.score).toBe(100);
    expect(s.word).toBe("great");
    expect(s.parts.map((p) => [p.id, p.got, p.why])).toEqual([
      ["protein", 25, "161 g of 150"], ["spread", 10, "3 meals with 25 g or more"], ["kcal", 15, "1,935 of 2,000 kcal"],
      ["fiber", 15, "30 g of 30"], ["plants", 15, "500 g of 400"], ["limits", 10, "all under their limits"],
      ["late", 5, "3 h or more before bed"], ["alcohol", 5, "none"],
    ]);
    expect(weakest(s)).toBeNull();
  });

  it("pizza, three beers and late chips: 32 — the parts that cost it, by hand", () => {
    // pizza 400 g (1,000 kcal, 40 g protein, fibre 8, salt 5.2), 3 beers (630 kcal, 60 g alcohol), chips 100 g at 22:30
    const es = [eat("pizza", 400, "13:00"), beer("21:30"), beer("21:45"), beer("22:00"), eat("chips", 100, "22:30")];
    const s = dayScore(es, FOODS, GOALS, BED, DAY)!;
    expect(part(s, "protein")).toMatchObject({ got: 0, why: "46 g of 150" });
    expect(part(s, "spread")).toMatchObject({ got: 3, why: "1 meal with 25 g or more" });
    expect(part(s, "kcal")).toMatchObject({ got: 15, why: "2,170 of 2,000 kcal" }); // within 110 %
    // the beers' calories have no nutrients: 1,540 of 2,170 kcal known (71 %) — just enough to judge the rest
    expect(part(s, "fiber")).toMatchObject({ got: 6, why: "12 g of 30 (71 % of the day has nutrients)" });
    expect(part(s, "plants")).toMatchObject({ got: 0 });
    // salt 6.7 g (1.34× the limit → 0.32), saturated fat 8.7 % and sugar 15 g under: 10 × 2.32 / 3
    expect(part(s, "limits")).toMatchObject({ got: 7.7, why: "over: salt 6.7 g" });
    expect(part(s, "late")).toMatchObject({ got: 0, why: "0.5 h before bed" });
    expect(part(s, "alcohol")).toMatchObject({ got: 0, why: "60 g" });
    expect(s.score).toBe(32);
    expect(s.word).toBe("off goal");
    expect(weakest(s)).toBe("protein low (46 g of 150)");
  });

  it("a deficit too deep to keep muscle on costs it, like going over", () => {
    const s = dayScore([eat("chicken", 400, "13:00"), eat("rice", 340, "19:00")], FOODS, GOALS, BED, DAY)!; // 660 + 442 = 1,102 kcal
    expect(part(s, "kcal")).toMatchObject({ got: 0, why: "1,102 of 2,000 kcal — 45 % under, a deep deficit" });
  });

  it("under 1,000 kcal logged isn't scored: a day not logged in full, not a day of eating little", () => {
    expect(dayScore([eat("chicken", 300, "13:00")], FOODS, GOALS, BED, DAY)).toBeNull();
    expect(dayScore([], FOODS, GOALS, BED, DAY)).toBeNull();
  });

  it("most of the day without nutrients: fibre, plants and limits left out and named, the rest scaled to 100", () => {
    const s = dayScore([eat("homemade", 600, "13:00"), eat("chicken", 200, "19:00")], FOODS, GOALS, BED, DAY)!; // 1,200 + 330 kcal, 78 % unknown
    expect(s.parts.map((p) => p.id)).toEqual(["protein", "spread", "kcal", "late", "alcohol"]);
    expect(s.left.map((l) => l.id)).toEqual(["fiber", "plants", "limits"]);
    expect(s.left[0].why).toBe("only 22 % of the day's calories have nutrients");
    const got = s.parts.reduce((a, p) => a + p.got, 0), max = s.parts.reduce((a, p) => a + p.max, 0);
    expect(max).toBe(60);
    expect(s.score).toBe(Math.round((got / max) * 100));
    expect(dayScoreLines(s, "Food score yesterday")[0]).toMatch(/^Food score yesterday: \d+\/100 \(\w[\w ]*\) — Protein [\d.]+\/25 .*; not judged: Fibre, Fruit, veg, legumes, Salt, sat\. fat, sugar \(only 22 % of the day's calories have nutrients\)\.$/);
  });
  it("…said in one plain line on the page (reform I6), no percentages; nothing left out → no line", () => {
    const s = dayScore([eat("homemade", 600, "13:00"), eat("chicken", 200, "19:00")], FOODS, GOALS, BED, DAY)!;
    expect(leftLine(s.left)).toBe("Fibre, veg, salt, fat and sugar aren't scored yet: too few of the foods you logged carry them.");
    expect(leftLine([])).toBeNull();
  });

  it("the built-in foods' nutrients count: a banana is 120 g of fruit", () => {
    const banana = BASIC_FOODS.find((f) => f.name === "Banana")!.id;
    const s = dayScore([eat("chicken", 500, "13:00"), eat(banana, 120, "16:00"), eat("rice", 300, "19:00")], FOODS, GOALS, BED, DAY)!;
    expect(part(s, "plants")?.why).toBe("120 g of 400");
  });
});
