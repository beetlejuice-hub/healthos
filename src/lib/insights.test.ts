import { describe, expect, it } from "vitest";
import { adherence, dailyFacts, lanes, pairs, suppEffects } from "./insights";
import { makeSample } from "./sample";
import { DEFAULT_SETTINGS } from "./store";
import type { Entry, Supplement } from "./types";
import { addDays, localDay } from "./time";

const NOW = new Date(2026, 8, 29, 14, 20).getTime();
const today = localDay(NOW);
const stack: Supplement[] = [
  { id: "creatine", name: "Creatine", dose: "5 g", at: 495, active: true },
  { id: "mag", name: "Magnesium", dose: "400 mg", at: 1350, active: true },
];
const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).getTime();

describe("dailyFacts", () => {
  const entries: Entry[] = [
    { id: "1", kind: "drink", at: at(27, 8), name: "Coffee", ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 },
    { id: "2", kind: "drink", at: at(27, 16), name: "Coffee", ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 },
    { id: "3", kind: "drink", at: at(27, 21), name: "Beer", ml: 500, caffeineMg: 0, alcoholG: 19.7, kcal: 215 },
    { id: "4", kind: "food", at: at(27, 13), name: "Lunch", grams: 400, macros: { kcal: 800, p: 60, c: 80, f: 20 } },
    { id: "5", kind: "feel", at: at(28, 12), energy: 5, mood: 6 },
  ];
  const facts = dailyFacts(entries, [], DEFAULT_SETTINGS, "2026-09-27", "2026-09-28");

  it("adds up the day and reads what's left at bedtime", () => {
    const d = facts[0];
    expect(d.caffeineMg).toBe(190);
    expect(d.lastCaffeineMin).toBe(16 * 60);
    expect(d.caffeineAtBed).toBeCloseTo(95 * 0.5 ** (15 / 5) + 95 * 0.5 ** (7 / 5), 6);
    // 19.7 g at 21:00, cleared at ~7.8 g/h after absorbing → ~3.5 g left at 23:00.
    expect(d.alcoholAtBed).toBeGreaterThan(2.5);
    expect(d.alcoholAtBed).toBeLessThan(4.5);
    expect(d.kcal).toBe(800);
  });

  it("leaves calories null on a day with no food logged", () => {
    expect(facts[1].kcal).toBeNull();
    expect(facts[1].energy).toBe(5);
  });
});

describe("on sample data", () => {
  const { entries, workouts } = makeSample(NOW, 60);
  const facts = dailyFacts(entries, workouts, DEFAULT_SETTINGS, addDays(today, -60), addDays(today, -1));

  it("builds every lane", () => {
    const l = lanes(entries, workouts, stack, DEFAULT_SETTINGS, NOW);
    expect(l.caffeine.length).toBeGreaterThan(8000);
    expect(Math.max(...l.caffeine.map((p) => p[1]))).toBeGreaterThan(90);
    expect(l.alcohol.some((p) => p[1] > 10)).toBe(true);
    expect(l.workouts.length).toBeGreaterThan(20);
    expect(l.workouts.every((w) => w.end > w.start)).toBe(true);
  });

  it("finds the link the sample was built with: late caffeine → lower next-day energy", () => {
    const p = pairs(facts).find((x) => x.id === "caf-energy")!;
    expect(p.r).not.toBeNull();
    expect(p.r!.value).toBeLessThan(0);
  });

  it("reports how much more data a pair needs instead of a number on too little", () => {
    const few = pairs(facts.slice(-5));
    expect(few.every((p) => p.r === null && p.need > 0)).toBe(true);
  });

  it("counts adherence per active supplement", () => {
    const days = Array.from({ length: 30 }, (_, i) => addDays(today, -30 + i));
    const a = adherence(entries, stack, days);
    expect(a.find((x) => x.suppId === "creatine")!.taken).toBeGreaterThan(22);
    expect(a.find((x) => x.suppId === "mag")!.usualMin).toBeGreaterThan(22 * 60);
  });

  it("only compares on vs off once both sides have enough days", () => {
    const e = suppEffects(facts, stack);
    expect(e.every((x) => (x.need > 0) === (x.diff === null))).toBe(true);
  });
});
