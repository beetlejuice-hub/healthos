import { describe, expect, it } from "vitest";
import { convert, cookKind, cookState } from "./cooked";
import type { Food } from "./types";
import { BASIC_FOODS } from "./foods-basic";

const F = (name: string, kcal: number, brand?: string): Food => ({ id: `off:${name}`, name, brand, per100: { kcal, p: 13, c: 72, f: 1.5 }, source: "off" });

describe("dry or cooked", () => {
  it("knows pasta, rice and meat — and leaves sauces, soups and snacks alone", () => {
    expect(cookKind(F("Spagetti", 355))).toBe("pasta");
    expect(cookKind(F("Basmati rizs", 350))).toBe("rice");
    expect(cookKind(F("Csirkemell filé", 110))).toBe("meat");
    expect(cookKind(F("Bolognese sauce", 80))).toBeNull();
    expect(cookKind(F("Rice cakes puffasztott", 387))).toBeNull();
    expect(cookKind(F("Chicken nuggets", 250))).toBeNull();
    expect(cookKind(F("Apple", 52))).toBeNull();
  });

  it("which version the values are for: name first, else calories (label pasta is dry)", () => {
    expect(cookState(F("Pasta, cooked", 158), "pasta")).toBe("cooked");
    expect(cookState(F("Spagetti", 355), "pasta")).toBe("uncooked");
    expect(cookState(F("Spagetti", 160), "pasta")).toBe("cooked");
    expect(cookState(F("Csirkemell", 110), "meat")).toBe("uncooked");
    expect(cookState(F("Csirkemell sült", 165), "meat")).toBe("cooked");
  });

  it("converts with known answers: 355 dry pasta → ~158 cooked; 360 dry rice → ~133; raw chicken 120 → 160 cooked", () => {
    expect(Math.round(convert(F("Spagetti", 355), "pasta", "cooked").per100.kcal)).toBe(158);
    expect(Math.round(convert(F("White rice, dry", 360), "rice", "cooked").per100.kcal)).toBe(133);
    const ch = convert(F("Chicken breast, raw", 120), "meat", "cooked");
    expect(Math.round(ch.per100.kcal)).toBe(160);
    expect(ch.name).toBe("Chicken breast, cooked");
  });

  it("round trip comes back to the same values, and converting to the same version is a no-op", () => {
    const f = F("Penne", 357);
    const back = convert(convert(f, "pasta", "cooked"), "pasta", "uncooked");
    expect(back.per100.kcal).toBeCloseTo(357, 0);
    expect(back.name).toBe("Penne, dry");
    expect(convert(f, "pasta", "uncooked")).toBe(f);
  });

  it("uses measured values for the other version when the built-in list has them (salmon is not lean meat)", () => {
    const raw = BASIC_FOODS.find((f) => f.name === "Salmon, raw")!;
    const c = convert(raw, "meat", "cooked");
    expect(c.name).toBe("Salmon, cooked");
    expect(c.per100.kcal).toBe(206); // the factor alone said 277
    expect(convert(c, "meat", "uncooked")).toBe(raw);
    expect(convert(BASIC_FOODS.find((f) => f.name === "Chicken breast, raw")!, "meat", "cooked").per100.kcal).toBe(165);
  });
});
