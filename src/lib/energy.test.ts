import { describe, expect, it } from "vitest";
import type { Entry } from "./types";
import { atMinute, addDays } from "./time";
import { bandBurn, eatGoal, energyPlan, goalFrom, measuredBurn, mondayOf, usualIntake, withKcal, DEFAULT_ENERGY } from "./energy";

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

// owner, 27 Oct: "1500 … sounds way too low for me. i want it to change dynamically, and smartly so it adjusts to how much i
// actually eat and tries to slowly nudge it down" — "1a keep lowering but also learn what i actually eat and try to help do a
// managable goal"
describe("the calorie goal from what you eat (PLAN 173)", () => {
  const SINCE = "2026-09-07", END = "2026-10-15"; // a Monday; a Thursday six weeks on
  const weekdays = (d: string) => new Date(`${d}T12:00:00`).getDay() % 6 !== 0;
  /** Food each day from 4 weeks before SINCE (`kcal(day)`, null: nothing logged), weighed every morning on a line of `perWeek`. */
  function eats(kcal: (day: string) => number | null, perWeek: number): Entry[] {
    const out: Entry[] = [];
    for (let d = addDays(SINCE, -35), i = 0; d <= END; d = addDays(d, 1), i++) {
      const k = kcal(d);
      if (k != null && d < END) out.push(food(d, k));
      out.push(weigh(d, 85 - (perWeek / 7) * i + [0.4, -0.3, 0.1, -0.4, 0.2, 0, -0.1][i % 7]));
    }
    return out;
  }
  const kcals = (e: Entry[]) => eatGoal(e, SINCE, END)!.weeks.map((w) => w.kcal);

  it("weeks start on Monday", () => {
    expect([mondayOf("2026-10-15"), mondayOf("2026-10-12"), mondayOf("2026-10-18")]).toEqual(["2026-10-12", "2026-10-12", "2026-10-12"]);
  });
  it("planted: eating 2,400 and the scale not moving — it starts at 2,400 and steps 50 a week, never more than 150 under what you eat", () => {
    const g = eatGoal(eats(() => 2400, 0), SINCE, END)!;
    expect(g.weeks.map((w) => w.kcal)).toEqual([2400, 2350, 2300, 2250, 2250, 2250]);
    expect(g.weeks.map((w) => w.move)).toEqual(["start", "down", "down", "down", "down", "down"]);
    expect(g.weeks.at(-1)).toMatchObject({ usual: 2400, kept: "under" });
    expect(Math.abs(g.weeks[1].loss!)).toBeLessThan(0.1);
  });
  it("control: losing 0.5 kg a week on the same food — your rule's middle, so it holds", () => {
    expect(kcals(eats(() => 2400, 0.5))).toEqual([2400, 2400, 2400, 2400, 2400, 2400]);
  });
  it("losing 1 kg a week — faster than your 0.7 — it comes up, but not past 100 over what you eat", () => {
    const g = eatGoal(eats(() => 2400, 1), SINCE, END)!;
    expect(g.weeks.map((w) => w.kcal)).toEqual([2400, 2500, 2500, 2500, 2500, 2500]);
    expect(g.weeks[2]).toMatchObject({ move: "up", kept: "over" });
  });
  it("as you eat to it, what you eat comes down and it follows — 50 a week, past the 150", () => {
    // he eats each week's goal: 2,400 before, then 50 less every Monday
    const goalOn = (d: string) => (d < SINCE ? 2400 : 2400 - 50 * Math.floor((Date.parse(d) - Date.parse(SINCE)) / (7 * 86_400_000)));
    expect(kcals(eats(goalOn, 0))).toEqual([2400, 2350, 2300, 2250, 2200, 2150]);
  });
  it("a weekend not logged isn't a weekend of fasting: what you usually eat, and the goal, are the same as logging every day", () => {
    const all = eats(() => 2400, 0), gaps = eats((d) => (weekdays(d) ? 2400 : null), 0), coffee = eats((d) => (weekdays(d) ? 2400 : 5), 0);
    expect(usualIntake(gaps, "2026-08-24", "2026-09-06")).toEqual({ kcal: 2400, full: 10 });
    expect(usualIntake(coffee, "2026-08-24", "2026-09-06")).toEqual({ kcal: 2400, full: 10 }); // a black coffee is a gap too
    expect(kcals(gaps)).toEqual(kcals(all));
    expect(kcals(coffee)).toEqual(kcals(all));
  });
  it("never under 1,500", () => {
    const g = eatGoal(eats(() => 1500, 0), SINCE, END)!;
    expect(g.weeks.map((w) => w.kcal)).toEqual([1500, 1500, 1500, 1500, 1500, 1500]);
    expect(g.weeks[1].kept).toBe("floor");
  });
  it("it starts on the first week with 7 full days; before that it says what it needs", () => {
    const late = eats((d) => (d >= "2026-09-21" ? 2400 : null), 0);
    const g = eatGoal(late, SINCE, END)!;
    expect(g.weeks[0]).toMatchObject({ from: "2026-09-28", move: "start", kcal: 2400 });
    const plan = energyPlan(late.filter((e) => e.kind !== "food" || e.at < Date.parse("2026-09-25T00:00:00")), undefined, END, { ...DEFAULT_ENERGY, mode: "eat", since: SINCE });
    expect(plan.eat).toBeNull();
    expect(plan.need).toBe("7 fully logged days in the two weeks before Monday (0 so far)");
  });
  it("a week with too little logged holds the goal where it was", () => {
    const g = eatGoal(eats((d) => (d >= "2026-09-21" && d < "2026-10-05" ? null : 2400), 0), SINCE, END)!;
    // nothing logged 21 Sep–4 Oct: the week of 5 Oct has nothing in its two weeks before
    expect(g.weeks.map((w) => w.move)).toEqual(["start", "down", "down", "down", "no-data", "down"]);
    expect(g.weeks[4].kcal).toBe(g.weeks[3].kcal);
  });
});
