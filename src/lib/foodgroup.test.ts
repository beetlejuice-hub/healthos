import { describe, expect, it } from "vitest";
import { groupFoods, nameKey, plausible, typicalOf } from "./foodgroup";
import type { Food } from "./types";

let n = 0;
const off = (name: string, kcal: number, brand?: string, extra: Partial<Food> = {}): Food => {
  // Macros consistent with kcal unless overridden: mostly carbs, like pasta.
  const p = Math.round(kcal * 0.035), f = Math.round(kcal * 0.004), c = Math.round((kcal - 4 * p - 9 * f) / 4);
  return { id: `off:${++n}`, name, brand, source: "off", per100: { kcal, p, c, f }, ...extra };
};

describe("nameKey", () => {
  it("ignores spelling, accents, case, pack size and word order", () => {
    expect(nameKey("Spaghetti")).toBe(nameKey("spagetti"));
    expect(nameKey("SPAGETTI 500g")).toBe(nameKey("spagetti"));
    expect(nameKey("Zabpehely finom")).toBe(nameKey("finom zabpehely"));
    expect(nameKey("Túró")).toBe(nameKey("turo"));
  });
  it("keeps different foods apart", () => {
    expect(nameKey("Spagetti")).not.toBe(nameKey("Spagetti bolognese"));
    expect(nameKey("Rice, cooked")).not.toBe(nameKey("Rice, dry"));
  });
});

describe("plausible", () => {
  it("accepts real labels", () => {
    expect(plausible({ kcal: 357, p: 13, c: 71, f: 1.5 })).toBe(true);
    expect(plausible({ kcal: 884, p: 0, c: 0, f: 100 })).toBe(true); // oil
    expect(plausible({ kcal: 2, p: 0.1, c: 0, f: 0 })).toBe(true); // black coffee
  });
  it("flags labels that don't add up", () => {
    expect(plausible({ kcal: 1490, p: 13, c: 71, f: 1.5 })).toBe(false); // kJ in the kcal field
    expect(plausible({ kcal: 36, p: 13, c: 71, f: 1.5 })).toBe(false); // a digit lost
    expect(plausible({ kcal: 350, p: 0, c: 0, f: 0 })).toBe(false); // macros missing
    expect(plausible({ kcal: 400, p: 50, c: 50, f: 20 })).toBe(false); // 120 g of macros in 100 g
  });
});

describe("typicalOf", () => {
  it("takes the median, so one bad label can't drag it", () => {
    const items = [off("Spagetti", 350), off("Spagetti", 357), off("spagetti", 360), off("Spagetti", 3570, "Typo")];
    const t = typicalOf("k", items);
    expect(t.per100.kcal).toBe(357);
    expect(t.name).toBe("Spagetti");
    expect(t.basis).toBe(3);
    expect(t.source).toBe("typical");
  });
  it("gives a serving size only when most products have one", () => {
    expect(typicalOf("k", [off("A", 100, "x", { servingG: 30 }), off("A", 100, "y", { servingG: 40 }), off("A", 100)]).servingG).toBe(35);
    expect(typicalOf("k", [off("A", 100, "x", { servingG: 30 }), off("A", 100), off("A", 100)]).servingG).toBeUndefined();
  });
});

describe("groupFoods", () => {
  const results = [
    off("Spagetti", 375, "Colavita"), off("Spagetti", 353, "Myllyn paras"), off("Spagetti", 358), off("Spaghetti", 350, "Combino"),
    off("Spagetti Bolognese", 105, "Lute n' Easy"), off("Thin spagetti", 360, "Barilla"), off("spagetti", 357, "Auchan"),
  ];

  it("collapses the same food from many brands into one typical row, first", () => {
    const rows = groupFoods(results, "spagetti");
    expect(rows[0].kind).toBe("group");
    if (rows[0].kind !== "group") return;
    expect(rows[0].items).toHaveLength(5);
    expect(rows[0].typical.per100.kcal).toBe(357);
    expect(rows[0].kcalRange).toEqual([350, 375]);
    expect(rows[0].varies).toBe(false);
    expect(rows).toHaveLength(3); // spaghetti ×5, bolognese, thin
  });

  it("keeps a product on its own row, at the top, when you typed its brand", () => {
    const rows = groupFoods(results, "combino spagetti");
    expect(rows[0]).toMatchObject({ kind: "one", food: { brand: "Combino" } });
    const g = rows.find((r) => r.kind === "group");
    expect(g && g.kind === "group" && g.items.length).toBe(4);
  });

  it("sinks labels that don't add up", () => {
    const rows = groupFoods([off("Zabpehely", 3720, "Bad"), off("Zabpehely keksz", 450, undefined, { per100: { kcal: 450, p: 7, c: 65, f: 18 } })], "zabpehely");
    expect(rows.map((r) => (r.kind === "one" ? r.food.name : ""))).toEqual(["Zabpehely keksz", "Zabpehely"]);
    expect(rows[1]).toMatchObject({ suspect: true });
  });

  it("never merges plain reference foods", () => {
    const usda: Food = { id: "usda:1", name: "Spaghetti, cooked", source: "usda", per100: { kcal: 158, p: 5.8, c: 30.9, f: 0.9 } };
    const rows = groupFoods([usda, off("Spaghetti, cooked", 150), off("Spaghetti, cooked", 160)], "spaghetti cooked");
    expect(rows.filter((r) => r.kind === "one" && r.food.source === "usda")).toHaveLength(1);
    expect(rows.filter((r) => r.kind === "group")).toHaveLength(1);
  });

  it("says when grouped products disagree a lot", () => {
    const [row] = groupFoods([off("Pasta", 150), off("Pasta", 360)], "pasta");
    expect(row).toMatchObject({ kind: "group", varies: true });
  });
});
