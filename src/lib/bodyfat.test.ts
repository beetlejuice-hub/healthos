import { describe, expect, it } from "vitest";
import { bodyFat, parseFat } from "./bodyfat";
import type { Entry } from "./types";
import { DAY } from "./time";
import { rng } from "./bench";

const NOW = new Date(2026, 9, 2, 9).getTime();
const w = (daysAgo: number, kg: number, fatPct?: number): Entry => ({ id: `w${daysAgo}`, kind: "weight", at: NOW - daysAgo * DAY, kg, fatPct });

describe("body fat, as 2-week averages", () => {
  it("needs 3 readings in the last 2 weeks; weigh-ins without it don't count", () => {
    expect(bodyFat([w(1, 72, 20), w(2, 72, 21), w(3, 72)], NOW)).toMatchObject({ now: null, have: 2 });
    const s = bodyFat([w(1, 72, 20), w(2, 72, 21), w(3, 72, 22)], NOW);
    expect(s.now).toMatchObject({ pct: 21, n: 3 });
    expect(s.now!.fatKg).toBeCloseTo(72 * 0.21, 6);
    expect(s.now!.leanKg).toBeCloseTo(72 * 0.79, 6);
  });

  it("a wet-feet one-off (5+ points off) is left out", () => {
    const s = bodyFat([w(1, 72, 20), w(2, 72, 20.5), w(3, 72, 30), w(4, 72, 19.5)], NOW);
    expect(s.now).toMatchObject({ pct: 20, n: 3 });
  });

  it("a real change between fortnights is clear, and split into fat and lean kg", () => {
    const es = [...[1, 3, 5, 7, 9, 11].map((d) => w(d, 71, 19 + (d % 2) * 0.2)), ...[15, 17, 19, 21, 23, 25].map((d) => w(d, 72.5, 21 + (d % 2) * 0.2))];
    const c = bodyFat(es, NOW).change!;
    expect(c.pts).toBeCloseTo(-2, 1);
    expect(c.clear).toBe(true);
    expect(c.fatKg).toBeCloseTo(71 * 0.192 - 72.5 * 0.212, 1); // ≈ −1.7 kg fat
    expect(c.leanKg).toBeCloseTo(71 * 0.808 - 72.5 * 0.788, 1); // ≈ +0.2 kg lean
  });

  it("the scale's day-to-day swing alone is not called a change (twin of the above)", () => {
    const { g } = rng(7);
    let clear = 0;
    for (let k = 0; k < 40; k++) {
      const es = Array.from({ length: 28 }, (_, d) => w(d + 1, 72 + g() * 0.4, 20 + g() * 1.5));
      if (bodyFat(es, NOW).change?.clear) clear++;
    }
    expect(clear).toBeLessThanOrEqual(4); // a 95% range: ~5% of fortnights by chance
  });

  it("the box is optional and forgiving: '20,1' and '20.1%' read, junk doesn't", () => {
    expect(parseFat("20,1")).toBe(20.1);
    expect(parseFat("20.1%")).toBe(20.1);
    expect(parseFat("")).toBeNull();
    expect(parseFat("201")).toBeNull();
    expect(parseFat("abc")).toBeNull();
  });
});
