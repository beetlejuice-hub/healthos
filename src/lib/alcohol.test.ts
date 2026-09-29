import { describe, expect, it } from "vitest";
import { alcoholAt, alcoholCurve, alcoholGrams } from "./alcohol";

const at = (h: number, m = 0) => new Date(2026, 8, 26, h, m).getTime();

describe("alcoholGrams", () => {
  it("converts volume and ABV to grams of ethanol", () => {
    expect(alcoholGrams(500, 5)).toBeCloseTo(19.725, 3);
    expect(alcoholGrams(150, 12)).toBeCloseTo(14.2, 1);
  });
});

describe("alcohol in body — constant-rate clearance", () => {
  const opts = { bodyKg: 80, gPerKgPerHour: 0.1 }; // clears 8 g/h

  it("is zero with nothing drunk", () => {
    expect(alcoholAt([], at(22))).toBe(0);
  });

  it("peaks after absorption, then falls at a constant rate", () => {
    const pts = alcoholCurve([{ at: at(20), g: 20 }], at(20), at(24), opts);
    const v = (h: number, m = 0) => pts.find(([t]) => t === at(h, m))![1];
    // After 30 min: 20 g absorbed, minus ~4 g cleared.
    expect(v(20, 30)).toBeGreaterThan(15);
    expect(v(20, 30)).toBeLessThan(17);
    // Linear fall: an hour later ~8 g less.
    expect(v(20, 30) - v(21, 30)).toBeCloseTo(8, 0);
    // Gone by ~22:30.
    expect(v(23)).toBe(0);
  });

  it("stacks drinks: one clears by 22:30, two are still there", () => {
    const one = alcoholAt([{ at: at(20), g: 14 }], at(22, 30), opts);
    const two = alcoholAt([{ at: at(20), g: 14 }, { at: at(20, 30), g: 14 }], at(22, 30), opts);
    expect(one).toBe(0);
    expect(two).toBeGreaterThan(5);
  });

  it("reads the level at bedtime from drinks earlier in the evening", () => {
    const g = alcoholAt([{ at: at(21), g: 28 }], at(23), opts);
    expect(g).toBeGreaterThan(10);
    expect(g).toBeLessThan(16);
  });
});
