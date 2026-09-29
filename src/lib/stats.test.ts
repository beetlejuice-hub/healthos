import { describe, expect, it } from "vitest";
import { correlation, difference, mean, median, pearson, perGroupFor, sd, slope, strength } from "./stats";

describe("basics", () => {
  it("mean, sd, median, slope", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(slope([0, 1, 2, 3], [1, 3, 5, 7])).toBe(2);
  });

  it("is NaN on too little data rather than a made-up number", () => {
    expect(mean([])).toBeNaN();
    expect(sd([5])).toBeNaN();
    expect(pearson([1, 2], [1, 2])).toBeNaN();
  });
});

describe("correlation with a 95% range", () => {
  it("finds a perfect line", () => {
    expect(pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBeCloseTo(1, 9);
  });

  it("calls a strong link on enough data clear", () => {
    const xs = Array.from({ length: 60 }, (_, i) => i);
    const ys = xs.map((x) => -0.5 * x + ((x * 7919) % 13) - 6);
    const r = correlation(xs, ys)!;
    expect(r.value).toBeLessThan(-0.8);
    expect(r.clear).toBe(true);
    expect(strength(r)).toBe("strong");
  });

  it("calls a weak link on little data unclear — the range crosses zero", () => {
    const r = correlation([1, 2, 3, 4, 5, 6], [3, 1, 4, 1, 5, 9])!;
    expect(r.lo).toBeLessThan(0);
    expect(r.hi).toBeGreaterThan(0);
    expect(strength(r)).toBe("no clear link");
  });

  it("refuses under 5 pairs", () => {
    expect(correlation([1, 2, 3, 4], [1, 2, 3, 4])).toBeNull();
  });
});

describe("difference of means", () => {
  it("is clear when the groups don't overlap", () => {
    const d = difference([90, 92, 95, 91, 93], [70, 72, 69, 71, 73])!;
    expect(d.value).toBeCloseTo(21.2, 9);
    expect(d.clear).toBe(true);
  });

  it("is unclear when the groups overlap heavily", () => {
    expect(difference([80, 95, 70, 88], [85, 72, 90, 78])!.clear).toBe(false);
  });

  it("sizes an experiment: 10-min effect, 12-min spread → ~23 nights each", () => {
    expect(perGroupFor(10, 12)).toBe(23);
  });
});
