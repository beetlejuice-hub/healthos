import { describe, expect, it } from "vitest";
import { amountOf, foodDay, mealOf } from "./foodday";
import { byDay } from "./nutrition";
import type { Entry } from "./types";

// PLAN 128 / #113 — owner, 20 Oct: "a simple window showing what i ate, the macros summary basically for the day".
const at = (d: string, hm: string) => new Date(`2026-10-${d}T${hm}:00`).getTime();
const food = (id: string, t: number, name: string, kcal: number, p: number, more: Partial<Extract<Entry, { kind: "food" }>> = {}): Entry => ({ id, kind: "food", at: t, name, grams: 100, macros: { kcal, p, c: 10, f: 5 }, ...more });
const drink = (id: string, t: number, name: string, kcal: number, ml = 250): Entry => ({ id, kind: "drink", at: t, name, ml, caffeineMg: 0, alcoholG: 0, kcal });
const entries: Entry[] = [
  food("oats", at("19", "07:40"), "Oats", 380, 13, { count: 1, unit: "bowl", grams: 80 }),
  drink("coffee", at("19", "07:45"), "Long coffee", 4, 300),
  food("toast", at("19", "12:30"), "Toast", 180, 6, { count: 2, unit: "slice", grams: 70 }),
  drink("water", at("19", "13:00"), "Water", 0, 500),
  food("schnitzel", at("19", "19:10"), "Schnitzel", 450, 30),
  drink("beer", at("19", "23:20"), "Beer", 210, 500),
  { id: "w", kind: "weight", at: at("19", "07:00"), kg: 80 },
  food("y", at("18", "20:00"), "Pizza", 900, 35),
  food("t", at("20", "00:10"), "Crisps", 300, 4),
];

describe("one day's food", () => {
  it("everything with calories on that calendar day, by meal, each meal's calories", () => {
    const d = foodDay(entries, "2026-10-19");
    expect(d.meals.map((m) => [m.name, m.items.map((e) => e.id), m.kcal])).toEqual([
      ["Breakfast", ["oats", "coffee"], 384], ["Lunch", ["toast"], 180], ["Dinner", ["schnitzel"], 450], ["Late", ["beer"], 210],
    ]);
    expect(d.count).toBe(5);
  });
  it("the same day and the same sum as Today's Food card (nutrition.byDay)", () => {
    const d = foodDay(entries, "2026-10-19"), t = byDay(entries).get("2026-10-19")!.totals;
    expect(d.totals).toEqual(t);
    expect(d.totals).toMatchObject({ kcal: 1224, p: 49 });
  });
  it("yesterday is yesterday; a day with nothing is empty, not an error", () => {
    expect(foodDay(entries, "2026-10-18").meals.map((m) => m.items.map((e) => e.id))).toEqual([["y"]]);
    expect(foodDay(entries, "2026-10-20").meals.map((m) => [m.name, m.items.map((e) => e.id)])).toEqual([["Night", ["t"]]]);
    expect(foodDay(entries, "2026-10-17")).toEqual({ day: "2026-10-17", meals: [], totals: { kcal: 0, p: 0, c: 0, f: 0 }, count: 0 });
  });
  it("meals by the hour; amounts as logged", () => {
    expect(["06:00", "10:59", "11:00", "15:30", "18:00", "22:00", "00:30"].map((hm) => mealOf(at("19", hm)))).toEqual(["Breakfast", "Breakfast", "Lunch", "Afternoon", "Dinner", "Late", "Night"]);
    expect(amountOf(entries[2] as never)).toBe("2 slices · 70 g");
    expect(amountOf(entries[4] as never)).toBe("100 g");
    expect(amountOf(entries[5] as never)).toBe("500 ml");
  });
});
