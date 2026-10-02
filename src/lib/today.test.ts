import { describe, expect, it } from "vitest";
import { nowItems, type NowContext } from "./today";
import type { Entry, Supplement } from "./types";
import { fromOff } from "./off";
import { DEFAULT_GOALS } from "./types";

const at = (h: number, m = 0) => new Date(2026, 8, 29, h, m).getTime();
const stack: Supplement[] = [
  { id: "cre", name: "Creatine", dose: "5 g", slot: "morning", at: 8 * 60, active: true },
  { id: "cumin", name: "Black cumin oil", dose: "1 tsp", slot: "morning", at: 8 * 60, active: true },
  { id: "mag", name: "Magnesium", dose: "400 mg", slot: "evening", at: 21 * 60 + 30, active: true },
  { id: "old", name: "Zinc", dose: "", slot: "morning", at: 9 * 60, active: false },
];
const coffee = (h: number, m = 0): Entry => ({ id: `c${h}${m}`, kind: "drink", at: at(h, m), name: "Filter coffee", ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 });
const ctx = (now: number, entries: Entry[]): NowContext => ({ now, entries, supplements: stack, goals: DEFAULT_GOALS, bedMinute: 23 * 60, caffeineTargetMg: 50, halfLifeMin: 300, coffeeMg: 95 });

describe("nowItems", () => {
  it("lists missed supplements, not answered or inactive ones", () => {
    const items = nowItems(ctx(at(14, 20), [{ id: "t", kind: "supp", at: at(8, 20), suppId: "cre", status: "taken" }]));
    const supps = items.filter((i) => i.kind === "supp-missed");
    expect(supps).toHaveLength(1);
    expect(supps[0]).toMatchObject({ suppIds: ["cumin"], title: "Black cumin oil 1 tsp" });
  });

  it("treats a skip as an answer", () => {
    const items = nowItems(ctx(at(14, 20), [{ id: "s", kind: "supp", at: at(9), suppId: "cumin", status: "skipped" }, { id: "t", kind: "supp", at: at(8), suppId: "cre", status: "taken" }]));
    expect(items.some((i) => i.kind === "supp-missed")).toBe(false);
  });

  it("a supplement taken twice a day is due twice, and each tick only answers its own slot", () => {
    const theanine: Supplement = { id: "lth", name: "L-theanine", dose: "200 mg", slot: "morning", slots: ["morning", "midday"], at: 8 * 60, active: true };
    const c = (now: number, entries: Entry[]): NowContext => ({ ...ctx(now, entries), supplements: [theanine] });
    const morningTick: Entry = { id: "m", kind: "supp", at: at(8, 5), suppId: "lth", status: "taken", slot: "morning" };
    // 13:10: the morning one is answered; the midday one is due.
    const mid = nowItems(c(at(13, 10), [morningTick])).filter((i) => i.kind === "supp-due" || i.kind === "supp-missed");
    expect(mid).toHaveLength(1);
    expect(mid[0]).toMatchObject({ slot: "midday", suppIds: ["lth"] });
    // Both ticked: nothing left.
    expect(nowItems(c(at(15), [morningTick, { id: "d", kind: "supp", at: at(13), suppId: "lth", status: "taken", slot: "midday" }])).some((i) => i.kind.startsWith("supp"))).toBe(false);
    // The twin: without the morning tick, at 13:10 both are open (morning missed, midday due).
    expect(nowItems(c(at(13, 10), [])).filter((i) => i.kind.startsWith("supp")).map((i) => (i as { slot: string }).slot).sort()).toEqual(["midday", "morning"]);
  });

  it("a tick from before multi-slot (no slot on it) counts for the first slot only", () => {
    const theanine: Supplement = { id: "lth", name: "L-theanine", dose: "", slot: "morning", slots: ["morning", "midday"], at: 8 * 60, active: true };
    const items = nowItems({ ...ctx(at(13, 10), [{ id: "o", kind: "supp", at: at(8), suppId: "lth", status: "taken" }]), supplements: [theanine] });
    expect(items.filter((i) => i.kind.startsWith("supp")).map((i) => (i as { slot: string }).slot)).toEqual(["midday"]);
  });

  it("shows a supplement as due within the hour before its time", () => {
    const items = nowItems(ctx(at(21, 45), [{ id: "t", kind: "supp", at: at(8), suppId: "cre", status: "taken" }, { id: "u", kind: "supp", at: at(8), suppId: "cumin", status: "taken" }]));
    expect(items.find((i) => i.kind === "supp-due")).toMatchObject({ suppIds: ["mag"] });
  });

  it("warns the coffee cut-off has passed, with the numbers from the prototype", () => {
    const item = nowItems(ctx(at(14, 20), [coffee(8, 10), coffee(13)])).find((i) => i.kind === "caffeine")!;
    expect(item.title).toMatch(/^Coffee cut-off was \d\d:\d\d$/);
    expect(item.body).toContain("about 64 mg in you at your planned bedtime, 23:00");
  });

  it("gives advance notice when the cut-off is under 90 minutes away", () => {
    // One espresso-sized trace at 08:00 barely moves the cut-off (~18:2x).
    const tiny: Entry = { id: "t", kind: "drink", at: at(8), name: "Tea", ml: 250, caffeineMg: 1, alcoholG: 0, kcal: 0 };
    expect(nowItems(ctx(at(9), [tiny])).find((i) => i.kind === "caffeine")).toBeUndefined();
    const late = nowItems(ctx(at(17, 30), [tiny])).find((i) => i.kind === "caffeine")!;
    expect(late.title).toMatch(/^Last coffee by 18:2\d$/);
  });

  it("says nothing about a coffee cut-off on a day with no caffeine", () => {
    expect(nowItems(ctx(at(20), [])).some((i) => i.kind === "caffeine")).toBe(false);
  });

  it("groups supplements due at the same time into one card", () => {
    const items = nowItems({ ...ctx(at(10), []), supplements: stack.map((s) => (s.id === "cumin" ? { ...s, at: 8 * 60 + 15 } : s)) });
    const g = items.filter((i) => i.kind === "supp-missed");
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ suppIds: ["cre", "cumin"], title: "Morning stack: Creatine, Black cumin oil" });
  });

  it("says nothing about caffeine after bedtime", () => {
    expect(nowItems(ctx(at(23, 30), [coffee(22)])).some((i) => i.kind === "caffeine")).toBe(false);
  });

  it("nudges food only once it's late enough", () => {
    expect(nowItems(ctx(at(9), [])).some((i) => i.kind === "food")).toBe(false);
    expect(nowItems(ctx(at(12, 30), [])).some((i) => i.kind === "food")).toBe(true);
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

describe("basic foods", () => {
  it("finds everyday foods in English or Hungarian, with or without accents", async () => {
    const { searchBasic } = await import("./foods-basic");
    expect(searchBasic("chicken breast").map((f) => f.name)).toContain("Chicken breast, cooked");
    expect(searchBasic("turo")[0].name).toBe("Túró (quark), half-fat");
    expect(searchBasic("csirkemell").length).toBeGreaterThan(0);
    expect(searchBasic("")).toEqual([]);
  });

  it("has sane numbers: macros add up to roughly the calories", async () => {
    const { BASIC_FOODS } = await import("./foods-basic");
    for (const f of BASIC_FOODS) {
      const est = f.per100.p * 4 + f.per100.c * 4 + f.per100.f * 9;
      // Fibre and alcohol-free rounding: within 20% or 25 kcal.
      expect(Math.abs(est - f.per100.kcal), f.name).toBeLessThanOrEqual(Math.max(25, f.per100.kcal * 0.2));
    }
  });

  it("maps brands given as an array by the newer search", () => {
    expect(fromOff({ product_name: "X", brands: ["Brand B"], nutriments: { "energy-kcal_100g": 100 } })!.brand).toBe("Brand B");
  });

  it("asks how the day was in the evening, until you've rated it", () => {
    expect(nowItems(ctx(at(18, 50), [])).some((i) => i.kind === "feel")).toBe(false);
    expect(nowItems(ctx(at(19, 5), [])).some((i) => i.kind === "feel")).toBe(true);
    expect(nowItems(ctx(at(21), [{ id: "f", kind: "feel", at: at(20), mood: 7 }])).some((i) => i.kind === "feel")).toBe(false);
  });

  it("asks for a morning weigh-in until you've weighed, offering yesterday's weight", () => {
    const yest: Entry = { id: "w", kind: "weight", at: at(7) - 24 * 3600_000, kg: 80.4 };
    expect(nowItems(ctx(at(7, 30), [yest])).find((i) => i.kind === "weight")).toMatchObject({ lastKg: 80.4 });
    expect(nowItems(ctx(at(7, 30), [yest, { id: "w2", kind: "weight", at: at(7), kg: 80.1 }])).some((i) => i.kind === "weight")).toBe(false);
    expect(nowItems(ctx(at(11, 30), [yest])).some((i) => i.kind === "weight")).toBe(false);
  });

  it("reminds about supplements running low or out", () => {
    const low = { ...ctx(at(10), []), supplements: [{ ...stack[0], status: "low" as const }, { ...stack[1], active: false, status: "out" as const }] };
    expect(nowItems(low).find((i) => i.kind === "restock")).toMatchObject({ title: "Out of Black cumin oil · low on Creatine", out: ["cumin"], low: ["cre"] });
    const justLow = { ...ctx(at(10), []), supplements: [{ ...stack[0], status: "low" as const }] };
    expect(nowItems(justLow).find((i) => i.kind === "restock")?.title).toBe("Running low: Creatine");
    expect(nowItems(ctx(at(10), [])).some((i) => i.kind === "restock")).toBe(false);
  });
});
