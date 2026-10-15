import { describe, expect, it } from "vitest";
import type { Entry } from "./types";
import { atMinute, addDays } from "./time";
import { bandBurn, energyPlan, goalFrom, measuredBurn, withKcal, DEFAULT_ENERGY } from "./energy";

const TODAY = "2026-10-15";
let n = 0;
const food = (day: string, kcal: number): Entry => ({ id: `f${n++}`, kind: "food", at: atMinute(day, 13 * 60), name: "x", grams: 100, macros: { kcal, p: 0, c: 0, f: 0 } });
const weigh = (day: string, kg: number): Entry => ({ id: `w${n++}`, kind: "weight", at: atMinute(day, 7 * 60), kg });

/** 27 full days before today eating `kcal`, weighed every morning on a line moving `perWeek` kg, ±0.4 kg of scale bounce. */
function world(kcal: number, perWeek: number): Entry[] {
  const out: Entry[] = [];
  for (let i = 27; i >= 0; i--) {
    const d = addDays(TODAY, -i);
    if (i > 0) out.push(food(d, kcal));
    out.push(weigh(d, 80 + (perWeek / 7) * (27 - i) + [0.4, -0.3, 0.1, -0.4, 0.2, 0, -0.1][i % 7]));
  }
  return out;
}

describe("the calorie goal from what you burn (PLAN 95)", () => {
  it("burn − the pace's deficit: 0.5 kg a week is 550 kcal a day under", () => {
    expect(goalFrom(2600, 0.5)).toMatchObject({ kcal: 2050, cut: 550, capped: false, floored: false });
    expect(goalFrom(2600, 0.5).perWeek).toBeCloseTo(0.5, 5);
    expect(goalFrom(2600, 0.35).kcal).toBe(2220); // 385 under
  });
  it("the cut stops at a quarter of your burn, and the goal at 1,500", () => {
    // 0.65 kg a week wants 715 under; a quarter of 2,600 is 650 → 1,950, about 0.59 kg a week
    const g = goalFrom(2600, 0.65);
    expect([g.kcal, g.capped]).toEqual([1950, true]);
    expect(g.perWeek).toBeCloseTo(0.591, 3);
    expect(goalFrom(1800, 0.5)).toMatchObject({ kcal: 1500, floored: true });
    expect(goalFrom(2000, 0.65)).toMatchObject({ kcal: 1500, floored: false, capped: true });
  });
  it("the check-ins' ±150 sits on top of the burn", () => {
    expect([goalFrom(2600, 0.5, -150).kcal, goalFrom(2600, 0.5, 150).kcal]).toEqual([1900, 2200]);
  });
  it("carbs move with the calories; under 50 kcal off changes nothing", () => {
    expect(withKcal({ kcal: 2600, p: 160, c: 300, f: 80 }, 2050)).toEqual({ kcal: 2050, p: 160, c: 162, f: 80 });
    expect(withKcal({ kcal: 2600, p: 160, c: 300, f: 80 }, 2560)).toBeNull();
    expect(withKcal({ kcal: 2600, p: 160, c: 100, f: 80 }, 1900)!.c).toBe(0);
  });
  it("the band's average day: the last 14 full days, today and a day it was off left out, from 5 days", () => {
    const k: Record<string, number> = { [TODAY]: 600 };
    for (let i = 1; i <= 16; i++) k[addDays(TODAY, -i)] = i === 3 ? 900 : i === 15 ? 4000 : i % 2 ? 2450 : 2550;
    // 14 days: day 3's 900 left out → six 2,450s and seven 2,550s = 2,504; day 15's 4,000 is too old to count
    expect(bandBurn(k, TODAY)).toEqual({ kcal: 2500, days: 13 });
    expect(bandBurn({ [addDays(TODAY, -1)]: 2500, [addDays(TODAY, -2)]: 2500 }, TODAY)).toBeNull();
    expect(bandBurn(undefined, TODAY)).toBeNull();
  });
  it("planted: eating 2,900 while gaining 0.25 kg a week is a burn of about 2,625 — and the goal follows it", () => {
    const e = world(2900, 0.25);
    const m = measuredBurn(e, TODAY)!;
    expect(Math.abs(m.kcal - 2625)).toBeLessThanOrEqual(30);
    const plan = energyPlan(e, { [addDays(TODAY, -1)]: 3400 }, TODAY, { ...DEFAULT_ENERGY, mode: "burn" });
    expect(plan.burn?.from).toBe("measured"); // your own burn beats the band's
    expect(plan.goal!.kcal).toBe(Math.round((m.kcal - 550) / 10) * 10);
  });
  it("planted: steady weight on 2,300 is a burn of 2,300, not more", () => {
    expect(Math.abs(measuredBurn(world(2300, 0), TODAY)!.kcal - 2300)).toBeLessThanOrEqual(30);
  });
  it("no measured burn → the band's; neither → says what's missing", () => {
    const k: Record<string, number> = {};
    for (let i = 1; i <= 6; i++) k[addDays(TODAY, -i)] = 2700;
    const few = [food(addDays(TODAY, -1), 2000), weigh(addDays(TODAY, -1), 80)];
    expect(energyPlan(few, k, TODAY, { mode: "burn", pace: 0.5, offset: 0 })).toMatchObject({ burn: { from: "band", kcal: 2700 }, goal: { kcal: 2150 } });
    const none = energyPlan(few, undefined, TODAY, DEFAULT_ENERGY);
    expect(none.goal).toBeNull();
    expect(none.need).toContain("(1 and 1 so far)");
  });
});
