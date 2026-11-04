import { describe, expect, it } from "vitest";
import { byDay, forGrams, split } from "./nutrition";
import type { Entry } from "./types";

const at = (d: number, h: number) => new Date(2026, 8, d, h).getTime();
const food = (d: number, h: number, kcal: number, p = 0, c = 0, f = 0): Entry => ({ id: `${d}-${h}`, kind: "food", at: at(d, h), name: "x", grams: 100, macros: { kcal, p, c, f } });

describe("forGrams", () => {
  it("scales per-100 g values", () => {
    expect(forGrams({ kcal: 380, p: 13, c: 60, f: 7 }, 60)).toEqual({ kcal: 228, p: 7.8, c: 36, f: 4.2 });
  });
});

describe("byDay and averages — unlogged days are left out", () => {
  const entries: Entry[] = [
    food(26, 8, 600, 40), food(26, 13, 800, 60),
    food(27, 9, 2000, 150),
    // 28th: nothing logged at all.
    { id: "beer", kind: "drink", at: at(28, 21), name: "Beer", ml: 500, caffeineMg: 0, alcoholG: 19.7, kcal: 215 },
  ];
  const days = byDay(entries);

  it("totals each day", () => {
    expect(days.get("2026-09-26")!.totals.kcal).toBe(1400);
    expect(days.get("2026-09-27")!.totals.p).toBe(150);
  });

  it("a day with only a drink is not a logged day", () => {
    expect(days.get("2026-09-28")!.logged).toBe(false);
  });
});

describe("split", () => {
  it("splits calories by macro", () => {
    const s = split({ kcal: 0, p: 100, c: 200, f: 50 });
    expect(s.p + s.c + s.f).toBeCloseTo(1, 9);
    expect(s.f).toBeCloseTo(450 / 1650, 9);
  });
});
