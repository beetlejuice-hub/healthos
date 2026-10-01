import { describe, expect, it } from "vitest";
import type { Food } from "./types";
import { fromOff } from "./off";
import { caffeinePer100, drinkFromFood, mlInName, sizesFor } from "./drinkdb";

const food = (name: string, kcal: number, extra: Partial<Food> = {}): Food => ({ id: `off:${name}`, name, per100: { kcal, p: 0, c: kcal / 4, f: 0 }, source: "off", ...extra });

describe("sizes", () => {
  it("reads the size on the label", () => {
    expect(mlInName("Sprite 0,5 l")).toBe(500);
    expect(mlInName("Coca-Cola 330ml")).toBe(330);
    expect(mlInName("Szentkirályi 1.5L")).toBe(1500);
    expect(mlInName("Pepsi 33 cl")).toBe(330);
    expect(mlInName("Sprite")).toBeNull();
    expect(mlInName("Vitamin 5000 l")).toBeNull();
  });
  it("offers the label size first, then the serving, then the usual ones", () => {
    expect(sizesFor(food("Fanta Orange 0,5 l", 19))).toEqual([500, 330, 250]);
    expect(sizesFor(food("Sprite", 19, { servingG: 250 }))).toEqual([250, 330, 500]);
    expect(sizesFor(food("Sprite", 19))).toEqual([330, 500, 250]);
  });
});

describe("a product becomes a drink", () => {
  it("Sprite 500 ml: label calories and carbs, no caffeine", () => {
    const d = drinkFromFood(food("Sprite", 19, { brand: "Sprite", per100: { kcal: 19, p: 0, c: 4.5, f: 0 } }), 500);
    expect(d).toMatchObject({ name: "Sprite 500 ml", ml: 500, kcal: 95, c: 22.5, caffeineMg: 0, alcoholG: 0 });
    expect(d.note).toBeUndefined();
  });

  it("caffeine from the label when it's there (OFF lists it in g per 100 g)", () => {
    const f = fromOff({ code: "9", product_name: "Monster Energy", nutriments: { "energy-kcal_100g": 47, caffeine_100g: 0.032 } })!;
    expect(f.caffeine100).toBe(32);
    expect(drinkFromFood(f, 500).caffeineMg).toBe(160);
  });

  it("otherwise the typical amount for its kind, and says so", () => {
    const d = drinkFromFood(food("Pepsi Max", 0.4), 330);
    expect(d.caffeineMg).toBe(33);
    expect(d.note).toMatch(/typical for colas/);
    expect(caffeinePer100(food("Hell Energy Classic", 46)).mg).toBe(32);
    expect(caffeinePer100(food("Coca-Cola koffeinmentes", 42)).mg).toBe(0);
    expect(caffeinePer100(food("Fanta Narancs", 19)).mg).toBe(0);
  });

  it("alcohol from % vol, and the size isn't repeated when it's on the label", () => {
    const f = fromOff({ code: "7", product_name: "Dreher Gold 0,5 l", brands: "Dreher", nutriments: { "energy-kcal_100g": 42, alcohol_100g: 5 } })!;
    expect(f.alcohol100).toBe(5);
    const d = drinkFromFood(f, 500);
    expect(d.name).toBe("Dreher Gold 0,5 l");
    expect(d.alcoholG).toBeCloseTo(19.7, 1);
  });

  it("nonsense label values are ignored, not trusted", () => {
    const f = fromOff({ code: "8", product_name: "Odd", nutriments: { "energy-kcal_100g": 40, caffeine_100g: 32, alcohol_100g: 300 } })!;
    expect(f.caffeine100).toBeUndefined(); // 32 g per 100 ml would be lethal: a unit mix-up
    expect(f.alcohol100).toBeUndefined();
  });

  it("the same product at the same size keeps one id (saved once, offered again)", () => {
    expect(drinkFromFood(food("Sprite", 19), 330).id).toBe(drinkFromFood(food("Sprite", 19), 330).id);
    expect(drinkFromFood(food("Sprite", 19), 330).id).not.toBe(drinkFromFood(food("Sprite", 19), 500).id);
  });
});
