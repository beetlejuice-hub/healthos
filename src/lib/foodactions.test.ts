// Owner, 3 Nov: "I should be able to delete or change my logged food, maybe we can do long press and add options there or
// swipe". Known answers: half of 300 g of chicken rice is 150 g with half of every number; a drink's caffeine and alcohol
// scale too; grams typed in are the same as a factor; another time stays on the food's own day; again is a copy, now.
import { describe, expect, it } from "vitest";
import { again, atTime, scaled, toAmount, type Logged } from "./foodactions";
import { atMinute } from "./time";

const AT = atMinute("2026-11-02", 13 * 60 + 5);
const rice: Logged = { id: "r", kind: "food", at: AT, name: "Chicken rice", grams: 300, macros: { kcal: 540, p: 36, c: 66, f: 12.5 } };
const eggs: Logged = { id: "e", kind: "food", at: AT, name: "Egg", grams: 120, count: 2, unit: "egg", macros: { kcal: 172, p: 15, c: 1, f: 12 } };
const beer: Logged = { id: "b", kind: "drink", at: AT, name: "Beer", ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 215, c: 18 };
const latte: Logged = { id: "l", kind: "drink", at: AT, name: "Latte", ml: 300, caffeineMg: 130, alcoholG: 0, kcal: 150, p: 8, c: 12, f: 7 };

describe("a different amount", () => {
  it("half: grams and every number halved; 2 eggs → 1", () => {
    expect(scaled(rice, 0.5)).toEqual({ grams: 150, macros: { kcal: 270, p: 18, c: 33, f: 6.3 } });
    expect(scaled(eggs, 0.5)).toEqual({ grams: 60, macros: { kcal: 86, p: 7.5, c: 0.5, f: 6 }, count: 1 });
  });
  it("a drink: ml, caffeine, alcohol, calories and what it has of protein, carbs, fat", () => {
    expect(scaled(beer, 2)).toEqual({ ml: 1000, caffeineMg: 0, alcoholG: 40, kcal: 430, c: 36 });
    expect(scaled(latte, 1.5)).toEqual({ ml: 450, caffeineMg: 195, alcoholG: 0, kcal: 225, p: 12, c: 18, f: 10.5 });
  });
  it("grams typed in: 200 g of a 300 g plate is two thirds of it; a comma works", () => {
    expect(toAmount(rice, "200")).toEqual({ grams: 200, macros: { kcal: 360, p: 24, c: 44, f: 8.3 } });
    expect(toAmount(beer, "330,0")).toMatchObject({ ml: 330, alcoholG: 13.2 });
  });
  it("controls: 0, negative, nonsense, empty, absurd — nothing changes", () => {
    expect([scaled(rice, 0), scaled(rice, -1), scaled(rice, NaN), scaled(rice, 50), toAmount(rice, ""), toAmount(rice, "abc"), toAmount(rice, "0")]).toEqual([null, null, null, null, null, null, null]);
    expect(toAmount({ ...rice, grams: 0 }, "100")).toBeNull();
  });
});

describe("another time, the same again", () => {
  it("a time moves it on its own day; a time that isn't one doesn't", () => {
    expect(atTime(rice, "08:30")).toBe(atMinute("2026-11-02", 8 * 60 + 30));
    expect(atTime(rice, "9:05")).toBe(atMinute("2026-11-02", 9 * 60 + 5));
    expect([atTime(rice, "24:00"), atTime(rice, "12:60"), atTime(rice, ""), atTime(rice, "noon")]).toEqual([null, null, null, null]);
  });
  it("again: the same thing, now, without its id", () => {
    const now = atMinute("2026-11-03", 19 * 60);
    expect(again(beer, now)).toEqual({ kind: "drink", at: now, name: "Beer", ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 215, c: 18 });
  });
});
