import { describe, expect, it } from "vitest";
import { tasteOf } from "./rank";
import { groupFoods } from "./foodgroup";
import type { Entry, Food } from "./types";

const F = (id: string, name: string, brand: string | undefined, kcal: number): Food => ({ id, name, brand, per100: { kcal, p: 13, c: 70, f: 1.5 }, source: "off" });
const ate = (foodId: string, n: number): Entry[] => Array.from({ length: n }, (_, i) => ({ id: `${foodId}${i}`, kind: "food", at: Date.now() - i * 86_400_000, foodId, name: "x", grams: 100, macros: { kcal: 350, p: 13, c: 70, f: 1.5 } }));

const results = [F("off:1", "Spagetti", "Colavita", 355), F("off:2", "Spagetti", "Barilla", 359), F("off:3", "Spagetti", "Gyermelyi", 352), F("off:4", "Penne", "Barilla", 359), F("off:5", "Penne", "Gyermelyi", 357), F("off:6", "Fusilli", "Gyermelyi", 356)];

describe("your brands and foods first", () => {
  it("a brand you buy goes first inside its group, and its group rises", () => {
    const saved = [F("off:old", "Tagliatelle", "Gyermelyi", 360)];
    const taste = tasteOf(ate("off:old", 5), saved);
    const plain = groupFoods(results, "pasta"), mine = groupFoods(results, "pasta", taste);
    const spag = mine.find((r) => r.kind === "group" && r.typical.name === "Spagetti")!;
    expect(spag.kind === "group" && spag.items[0].brand).toBe("Gyermelyi");
    // Fusilli (only Gyermelyi) climbs above where it was without your history.
    const pos = (rs: typeof plain) => rs.findIndex((r) => (r.kind === "one" ? r.food.name : r.typical.name) === "Fusilli");
    expect(pos(mine)).toBeLessThan(pos(plain));
  });

  it("the exact product you've logged beats a brand you merely buy", () => {
    const taste = tasteOf([...ate("off:6", 3), ...ate("off:old", 6)], [F("off:old", "Tagliatelle", "Barilla", 360), F("off:6", "Fusilli", "Gyermelyi", 356)]);
    const rs = groupFoods([F("off:6", "Fusilli", "Gyermelyi", 356), F("off:7", "Rotini", "Barilla", 358)], "f", taste);
    expect(rs[0].kind === "one" && rs[0].food.id).toBe("off:6");
  });

  it("no history: same order as before (the twin)", () => {
    const empty = tasteOf([], []);
    expect(groupFoods(results, "pasta", empty)).toEqual(groupFoods(results, "pasta"));
  });

  it("history older than 180 days doesn't count", () => {
    const old: Entry[] = [{ id: "o", kind: "food", at: Date.now() - 200 * 86_400_000, foodId: "off:3", name: "x", grams: 100, macros: { kcal: 1, p: 0, c: 0, f: 0 } }];
    expect(tasteOf(old, [F("off:3", "Spagetti", "Gyermelyi", 352)]).ids.size).toBe(0);
  });
});
