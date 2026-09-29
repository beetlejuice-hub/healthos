import { describe, expect, it } from "vitest";
import { nowItems, type NowContext } from "./today";
import type { Entry, Supplement } from "./types";
import { fromOff } from "./off";
import { DEFAULT_GOALS } from "./types";

const at = (h: number, m = 0) => new Date(2026, 8, 29, h, m).getTime();
const stack: Supplement[] = [
  { id: "cre", name: "Creatine", dose: "5 g", at: 8 * 60 + 15, active: true },
  { id: "cumin", name: "Black cumin oil", dose: "1 tsp", at: 8 * 60 + 18, active: true },
  { id: "mag", name: "Magnesium", dose: "400 mg", at: 22 * 60 + 30, active: true },
  { id: "old", name: "Zinc", dose: "", at: 9 * 60, active: false },
];
const coffee = (h: number, m = 0): Entry => ({ id: `c${h}${m}`, kind: "drink", at: at(h, m), name: "Filter coffee", ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 });
const ctx = (now: number, entries: Entry[]): NowContext => ({ now, entries, supplements: stack, goals: DEFAULT_GOALS, bedMinute: 23 * 60, caffeineTargetMg: 50, halfLifeMin: 300, coffeeMg: 95 });

describe("nowItems", () => {
  it("lists missed supplements, not answered or inactive ones", () => {
    const items = nowItems(ctx(at(14, 20), [{ id: "t", kind: "supp", at: at(8, 20), suppId: "cre", status: "taken" }]));
    const supps = items.filter((i) => i.kind === "supp-missed");
    expect(supps.map((i) => i.id)).toEqual(["supp:cumin"]);
  });

  it("treats a skip as an answer", () => {
    const items = nowItems(ctx(at(14, 20), [{ id: "s", kind: "supp", at: at(9), suppId: "cumin", status: "skipped" }, { id: "t", kind: "supp", at: at(8), suppId: "cre", status: "taken" }]));
    expect(items.some((i) => i.kind === "supp-missed")).toBe(false);
  });

  it("shows a supplement as due within the hour before its time", () => {
    const items = nowItems(ctx(at(21, 45), [{ id: "t", kind: "supp", at: at(8), suppId: "cre", status: "taken" }, { id: "u", kind: "supp", at: at(8), suppId: "cumin", status: "taken" }]));
    expect(items.find((i) => i.id === "supp:mag")?.kind).toBe("supp-due");
  });

  it("warns the coffee cut-off has passed, with the numbers from the prototype", () => {
    const item = nowItems(ctx(at(14, 20), [coffee(8, 10), coffee(13)])).find((i) => i.kind === "caffeine")!;
    expect(item.title).toMatch(/^Coffee cut-off was \d\d:\d\d$/);
    expect(item.body).toContain("64 mg at 23:00");
  });

  it("gives advance notice when the cut-off is under 90 minutes away", () => {
    const item = nowItems(ctx(at(8), [])).find((i) => i.kind === "caffeine");
    expect(item).toBeUndefined(); // cut-off is ~18:22 with an empty body
    const late = nowItems(ctx(at(17, 30), [])).find((i) => i.kind === "caffeine")!;
    expect(late.title).toBe("Last coffee by 18:22");
  });

  it("says nothing about caffeine after bedtime", () => {
    expect(nowItems(ctx(at(23, 30), [coffee(22)])).some((i) => i.kind === "caffeine")).toBe(false);
  });

  it("nudges food and feelings only once it's late enough", () => {
    expect(nowItems(ctx(at(9), [])).some((i) => i.kind === "food")).toBe(false);
    expect(nowItems(ctx(at(12, 30), [])).map((i) => i.kind)).toEqual(expect.arrayContaining(["food", "feel"]));
  });
});

describe("fromOff", () => {
  it("maps an Open Food Facts product", () => {
    const f = fromOff({ code: "599", product_name: "Zabpehely", brands: "Brand A, Other", serving_quantity: "40", nutriments: { "energy-kcal_100g": 372, proteins_100g: 13.5, carbohydrates_100g: 58.7, fat_100g: 7 } })!;
    expect(f).toMatchObject({ id: "off:599", name: "Zabpehely", brand: "Brand A", servingG: 40, per100: { kcal: 372, p: 13.5, c: 58.7, f: 7 } });
  });

  it("converts kJ when kcal is missing, and drops products without energy or a name", () => {
    expect(fromOff({ product_name: "X", nutriments: { energy_100g: 1674 } })!.per100.kcal).toBe(400);
    expect(fromOff({ product_name: "X", nutriments: {} })).toBeNull();
    expect(fromOff({ nutriments: { "energy-kcal_100g": 100 } })).toBeNull();
  });
});
