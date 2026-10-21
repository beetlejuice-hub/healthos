import { describe, expect, it } from "vitest";
import { foodWeek, weekRead } from "./foodweek";
import { BASIC_FOODS } from "./foods-basic";
import type { Entry, EntryOf, Food } from "./types";

// PLAN 154 — owner, 20 Oct: "need a bit better look for macro breakdwon, food, and trackking food overall, looking back".
const B = (name: string) => BASIC_FOODS.find((f) => f.name === name)!;
const at = (d: string, hm: string) => new Date(`2026-10-${d}T${hm}:00`).getTime();
const eat = (id: string, f: Food, grams: number, d: string, hm: string): EntryOf<"food"> => ({ id, kind: "food", at: at(d, hm), foodId: f.id, name: f.name, grams,
  macros: { kcal: f.per100.kcal * grams / 100, p: f.per100.p * grams / 100, c: f.per100.c * grams / 100, f: f.per100.f * grams / 100 } });
const plain = (id: string, d: string, kcal: number, p: number): Entry => ({ id, kind: "food", at: at(d, "13:00"), name: "Home stew", grams: 400, macros: { kcal, p, c: 100, f: 40 } });
const chicken = B("Chicken breast, cooked"), apple = B("Apple"), pizza = B("Pizza margherita");
const kc = (f: Food, g: number) => f.per100.kcal * g / 100;
const BED = 23 * 60, TODAY = "2026-10-21", GOALS = { kcal: 2000, p: 150 };

const entries: Entry[] = [
  // 15th: chicken (scores 100) and an apple (56) at lunch — foodscore.test's known cases
  eat("c15", chicken, 150, "15", "13:00"), eat("a15", apple, 180, "15", "13:00"),
  // 16th: only a coffee — no food logged, so the day is unknown, not "0 kcal"
  { id: "k16", kind: "drink", at: at("16", "08:00"), name: "Latte", ml: 300, caffeineMg: 80, alcoholG: 0, kcal: 120 },
  // 17th: a pizza (43)
  eat("p17", pizza, 300, "17", "13:00"),
  // 18th: chicken, but most of the day's calories are a home stew with no score → the day has none
  eat("c18", chicken, 150, "18", "13:00"), plain("s18", "18", 600, 30),
  // 19th: at the calorie goal's side, protein 146 of 150 (a hit: within 5 %); 20th: over, and short on protein
  plain("x19", "19", 1900, 146), plain("x20", "20", 2400, 120),
  // today, so far — drawn, never averaged
  plain("x21", "21", 3000, 200),
];
const week = foodWeek(entries, [], BED, TODAY, TODAY);

describe("a week of food", () => {
  it("the 7 days ending on the day, oldest first; a day without food is unknown; today is so far", () => {
    expect(week.map((d) => d.day)).toEqual(["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21"]);
    expect(week.map((d) => d.logged)).toEqual([true, false, true, true, true, true, true]);
    expect(week.map((d) => d.partial)).toEqual([false, false, false, false, false, false, true]);
    expect(week[1].kcal).toBe(120); // the latte is still counted, as Today's card counts it
  });
  it("a day's score is its items weighed by calories, and none when too little of it is scored", () => {
    expect(week[0].score).toBe(Math.round((kc(chicken, 150) * 100 + kc(apple, 180) * 56) / (kc(chicken, 150) + kc(apple, 180))));
    expect(week[2].score).toBe(43);
    expect(kc(chicken, 150) / (kc(chicken, 150) + 600)).toBeLessThan(0.7);
    expect(week[3].score).toBeNull();
  });
  it("the line: finished logged days only — averages, at or under the calorie goal, protein at goal", () => {
    const r = weekRead(week, GOALS), days = [week[0], week[2], week[3], week[4], week[5]];
    expect(r.n).toBe(5);
    expect(r.kcal).toBeCloseTo(days.reduce((a, d) => a + d.kcal, 0) / 5, 6);
    expect(r.underKcal).toBe(4); // all but the 20th's 2,400
    expect(r.hitP).toBe(1); // the 19th's 146 of 150; the 20th's 120 isn't
    expect(r.score).toBe(Math.round((week[0].score! + 43) / 2)); // the 18th has no score, the 19th–20th aren't scored foods
  });
  it("nothing logged: an empty line, not zeros", () => {
    const r = weekRead(foodWeek([], [], BED, TODAY, TODAY), GOALS);
    expect([r.n, r.kcal, r.p, r.score]).toEqual([0, null, null, null]);
  });
});
