import { describe, expect, it } from "vitest";
import { fromDatabase } from "./fillin";
import { gramsOf, macrosOfLine } from "./units";
import type { Food } from "./types";

const off = (id: string, name: string, kcal: number, p: number, c: number, f: number, servingG?: number): Food => ({ id: `off:${id}`, name, brand: `B${id}`, per100: { kcal, p, c, f }, source: "off", servingG });

describe("typed food not in the built-in list → the database median", () => {
  const salami = [
    off("1", "Salami", 380, 22, 1, 32), off("2", "Salami", 400, 24, 1, 33), off("3", "salami", 420, 25, 2, 35),
    off("4", "Salami", 3900, 22, 1, 32), // a typo label: left out
    off("5", "Salami sticks", 450, 26, 2, 37),
  ];
  it("takes the median of similar products and ignores a broken label", () => {
    const e = fromDatabase("2 slices of salami", salami)!;
    expect(e.line.food.per100.kcal).toBe(400);
    expect(e.basis).toBe(3);
    expect(e.line.unit).toBe("slice");
    expect(gramsOf(e.line)).toBe(50); // 2 × ~25 g
    expect(Math.round(macrosOfLine(e.line).kcal)).toBe(200);
  });
  it("uses the labels' serving when no unit is typed, grams when they are", () => {
    const bars = [off("a", "Protein bar", 360, 33, 35, 10, 60), off("b", "Protein bar", 380, 30, 38, 12, 60), off("c", "protein bar", 370, 32, 36, 11, 55)];
    expect(gramsOf(fromDatabase("protein bar", bars)!.line)).toBe(60);
    expect(gramsOf(fromDatabase("protein bar 45g", bars)!.line)).toBe(45);
    expect(gramsOf(fromDatabase("2 small protein bars", bars)!.line)).toBe(90); // 2 × ¾ serving
  });
  it("nothing that matches the words → no guess", () => {
    expect(fromDatabase("bacon", salami)).toBeNull();
    expect(fromDatabase("salami", [off("x", "Salami", 3900, 22, 1, 32)])).toBeNull();
  });
});
