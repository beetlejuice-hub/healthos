import { describe, expect, it } from "vitest";
import { caffeineAt, caffeineCurve, latestDoseFor } from "./caffeine";

const at = (h: number, m = 0) => new Date(2026, 8, 29, h, m).getTime();
const day = [{ at: at(8, 10), mg: 95 }, { at: at(13), mg: 95 }];

describe("caffeineAt — halves every 5 hours", () => {
  it("is the whole dose at the moment you drink it, half after one half-life", () => {
    expect(caffeineAt([{ at: at(8), mg: 100 }], at(8))).toBe(100);
    expect(caffeineAt([{ at: at(8), mg: 100 }], at(13))).toBeCloseTo(50, 6);
  });

  it("ignores doses that haven't happened yet", () => {
    expect(caffeineAt(day, at(7))).toBe(0);
    expect(caffeineAt(day, at(12))).toBeCloseTo(95 * 0.5 ** (230 / 300), 6);
  });

  it("matches the prototype: 119 mg at 14:20, 36 mg at 23:00", () => {
    expect(Math.round(caffeineAt(day, at(14, 20)))).toBe(119);
    expect(Math.round(caffeineAt(day, at(23)))).toBe(36);
  });

  it("ends: under 10 mg counts as none, so a day-old coffee is 0, not 'a trace'", () => {
    const one = [{ at: at(8), mg: 95 }];
    expect(caffeineAt(one, at(8) + 24 * 3600e3)).toBe(0); // 95 × 0.5^(24/5) ≈ 3.4 mg
    expect(caffeineAt(one, at(8) + 15 * 3600e3)).toBeGreaterThan(10); // ≈ 11.9 mg, still counts
    expect(caffeineAt([{ at: at(8), mg: 3 }], at(8))).toBe(0); // a decaf is no caffeine
  });

  it("respects a personal half-life", () => {
    expect(caffeineAt([{ at: at(8), mg: 100 }], at(12), 240)).toBeCloseTo(50, 6);
  });

  it("draws a curve at the requested step", () => {
    const c = caffeineCurve(day, at(8), at(9), 15);
    expect(c).toHaveLength(5);
    expect(c[0][1]).toBe(0);
    expect(c[1][1]).toBeGreaterThan(90);
  });
});

describe("latestDoseFor — the coffee cut-off", () => {
  it("returns null when bedtime is already over the target", () => {
    expect(latestDoseFor(day, at(23), 95, 30)).toBeNull();
  });

  it("solves for the time a dose decays to the room left", () => {
    // Empty body, target 50 mg by 23:00, one 100 mg coffee: it must halve once → 18:00.
    expect(latestDoseFor([], at(23), 100, 50)).toBe(at(18));
  });

  it("allows any time when the dose alone fits under the target", () => {
    expect(latestDoseFor([], at(23), 40, 50)).toBe(at(23));
  });

  it("agrees with caffeineAt at the returned time", () => {
    const t = latestDoseFor(day, at(23), 95, 60)!;
    expect(caffeineAt([...day, { at: t, mg: 95 }], at(23))).toBeCloseTo(60, 6);
  });
});
