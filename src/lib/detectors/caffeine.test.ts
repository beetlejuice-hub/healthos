import { describe, expect, it } from "vitest";
import { caffeineFindings, level } from "./caffeine";
import type { Entry } from "../types";
import { addDays, atMinute } from "../time";

const TODAY = "2026-09-30";
const coffee = (day: string, min: number, mg = 95): Entry => ({ id: `c${day}${min}`, kind: "drink", at: atMinute(day, min), name: "Coffee", ml: 250, caffeineMg: mg, alcoholG: 0, kcal: 2 });
const meal = (day: string): Entry => ({ id: `m${day}`, kind: "food", at: atMinute(day, 13 * 60), name: "Lunch", grams: 300, macros: { kcal: 600, p: 30, c: 70, f: 20 } });

/** `n` logged days back from yesterday; `cups(i)` coffees on day i at 08:00, 12:00, 15:00… */
const month = (n: number, cups: (i: number) => number) =>
  Array.from({ length: n }, (_, i) => addDays(TODAY, -1 - i)).flatMap((d, i) => [meal(d), ...[8, 12, 15, 17].slice(0, cups(i)).map((h) => coffee(d, h * 60))]);

describe("caffeine habit", () => {
  it("learns the daily amount, the usual drink and the timing", () => {
    const [f] = caffeineFindings(month(20, () => 3), TODAY, 80).found;
    expect(f.value).toBe("285");
    expect(f.title).toBe("You take about 285 mg of caffeine a day — moderate for your weight");
    expect(f.detail).toMatch(/3\.6 mg per kg.*first at 08:00, last at 15:00; a typical drink has 95 mg/);
  });

  it("counts a logged day without coffee as zero, not as missing", () => {
    const [f] = caffeineFindings(month(20, (i) => (i % 2 ? 0 : 4)), TODAY, 80).found;
    expect(f.evidence).toMatch(/10 without caffeine count as 0/);
    expect(Number(f.value)).toBeLessThan(380);
  });

  it("says high tolerance and the 400 mg line for a heavy habit", () => {
    const heavy = caffeineFindings(Array.from({ length: 14 }, (_, i) => addDays(TODAY, -1 - i)).flatMap((d) => [meal(d), coffee(d, 480, 200), coffee(d, 780, 160), coffee(d, 960, 80)]), TODAY, 70).found[0];
    expect(heavy.title).toMatch(/440 mg .* high for your weight/);
    expect(heavy.detail).toMatch(/most likely adapted/);
    expect(heavy.detail).toMatch(/above the 400 mg/);
  });

  it("waits for 10 logged days, and stays silent if you never log caffeine", () => {
    expect(caffeineFindings(month(6, () => 2), TODAY, 80)).toMatchObject({ found: [], checking: [{ missing: "6 of 10 logged days" }] });
    expect(caffeineFindings(month(20, () => 0), TODAY, 80)).toEqual({ found: [], checking: [] });
  });

  it("ignores today (not over yet)", () => {
    const base = month(20, () => 2);
    expect(caffeineFindings([...base, coffee(TODAY, 600, 300)], TODAY, 80)).toEqual(caffeineFindings(base, TODAY, 80));
  });

  it("bands by mg per kg", () => {
    expect([level(1).word, level(3).word, level(6).word]).toEqual(["light", "moderate", "high"]);
  });
});
