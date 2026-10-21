import { describe, expect, it } from "vitest";
import { levelWords, vo2Trend, type Vo2Day } from "./vo2";
import { addDays } from "./time";

// PLAN 52 — owner, 21 Oct: "do 1" (VO2 max as a trend on the Heart page) — a slow number, judged week against week.
const TODAY = "2026-10-21";
function rng(seed: number) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}
/** 90 days up to TODAY: `at(k)` the true value k days back, plus Fitbit's ±0.3 wobble. */
function days(seed: number, at: (k: number) => number, more: Partial<Vo2Day> = {}): Record<string, Vo2Day> {
  const g = rng(seed), out: Record<string, Vo2Day> = {};
  for (let k = 89; k >= 0; k--) out[addDays(TODAY, -k)] = { v: at(k) + 0.3 * g(), level: "GOOD", ...more };
  return out;
}

describe("VO2 max trend", () => {
  it("finds a planted rise: 42 → 46 over the 90 days (+1.3 in 4 weeks, +2.5 in 8)", () => {
    const t = vo2Trend(days(1, (k) => 46 - (4 * k) / 89), TODAY)!;
    const [w4, w8] = t.changes;
    expect(w8.weeks).toBe(8);
    expect(w8.delta).toBeCloseTo((4 * 56) / 89, 0);
    expect(w8.word).toBe("up");
    expect(w4.word).toBe("up");
    expect(t.line).toMatch(/^VO2 max this week 4[56]\.\d — good for your age \(Fitbit's level\)\. \+[23]\.\d over 8 weeks, rising\.$/);
    // a rise too small to call: 3 over the 90 days is under 1 in 4 weeks
    expect(vo2Trend(days(1, (k) => 45 - (3 * k) / 89), TODAY)!.changes[0].word).toBe("steady");
  });

  it("the same days without the plant read steady — and across 200 flat runs it never calls a direction", () => {
    expect(vo2Trend(days(1, () => 44), TODAY)!.line).toMatch(/Steady over 8 weeks \([+−]0\.\d\)\./);
    let called = 0;
    for (let seed = 1; seed <= 200; seed++) if (vo2Trend(days(seed, () => 44), TODAY)!.changes.some((c) => c.word !== "steady")) called++;
    expect(called).toBe(0);
  });

  it("a fall is a fall", () => {
    const t = vo2Trend(days(3, (k) => (k < 30 ? 41.5 : 44)), TODAY)!;
    expect(t.changes.map((c) => c.word)).toEqual(["down", "down"]);
    expect(t.line).toMatch(/−2\.\d over 8 weeks, falling/);
  });

  it("losing weight raises it by itself: the same oxygen a minute at 85 → 81 kg reads +1.3 in 8 weeks, and the split says it's all the kilos", () => {
    // 3.5 L/min all along; weight falls 85 → 81 kg over the 90 days, logged every other day
    const kgAt = (k: number) => 81 + (4 * k) / 89, kg: Record<string, number> = {};
    for (let k = 89; k >= 0; k -= 2) kg[addDays(TODAY, -k)] = +kgAt(k).toFixed(1);
    const t = vo2Trend(days(4, (k) => 3500 / kgAt(k)), TODAY, kg)!;
    const w8 = t.changes[1];
    expect(w8.word).toBe("up");
    expect(w8.delta).toBeGreaterThan(1);
    expect(Math.abs(w8.sameKg!)).toBeLessThan(0.6);
    expect(w8.kgLost).toBeCloseTo(2.5, 0);
    expect(t.line).toMatch(/rising — at the same weight [+−]0\.\d; the rest goes with the 2\.\d kg lost \(it's per kg\)\./);
  });

  it("…and real fitness while losing weight: the same-weight part keeps the fitness", () => {
    const kgAt = (k: number) => 81 + (4 * k) / 89, kg: Record<string, number> = {};
    for (let k = 89; k >= 0; k -= 2) kg[addDays(TODAY, -k)] = +kgAt(k).toFixed(1);
    // the oxygen a minute rises 3.3 → 3.6 L/min as well
    const t = vo2Trend(days(5, (k) => (3600 - (300 * k) / 89) / kgAt(k)), TODAY, kg)!;
    expect(t.changes[1].sameKg!).toBeGreaterThan(1.2);
  });

  it("no weights, or under half a kilo moved: no split", () => {
    expect(vo2Trend(days(6, () => 44), TODAY)!.changes[1].sameKg).toBeNull();
    const kg = { [addDays(TODAY, -60)]: 80, [addDays(TODAY, -2)]: 79.8 };
    expect(vo2Trend(days(6, () => 44), TODAY, kg)!.changes[1].sameKg).toBeNull();
  });

  it("too little: under 3 values this week → nothing; no week 8 weeks back → only what there is", () => {
    const d = days(7, () => 44);
    const short = Object.fromEntries(Object.entries(d).filter(([k]) => k >= addDays(TODAY, -35)));
    const t = vo2Trend(short, TODAY)!;
    expect(t.changes.map((c) => c.weeks)).toEqual([4]);
    expect(t.line).toMatch(/Steady over 4 weeks/);
    expect(vo2Trend(Object.fromEntries(Object.entries(d).filter(([k]) => k >= addDays(TODAY, -1))), TODAY)).toBeNull();
    expect(vo2Trend(undefined, TODAY)).toBeNull();
    const fresh = Object.fromEntries(Object.entries(d).filter(([k]) => k >= addDays(TODAY, -10)));
    expect(vo2Trend(fresh, TODAY)!.line).toMatch(/Not enough weeks yet/);
  });

  it("an estimate says so; levels read as words", () => {
    expect(vo2Trend(days(8, () => 44, { est: true }), TODAY)!.line).toMatch(/Google marks the latest as an estimate\.$/);
    expect(levelWords("VERY_GOOD")).toBe("very good");
    expect(levelWords("CARDIO_FITNESS_LEVEL_UNSPECIFIED")).toBeNull();
    expect(vo2Trend(days(8, () => 44, { level: undefined }), TODAY)!.line).toMatch(/^VO2 max this week 4\d\.\d\. /);
  });
});
