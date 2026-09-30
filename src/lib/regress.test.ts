import { describe, expect, it } from "vitest";
import { bh, ols, pTwoSided, tCrit } from "./regress";

describe("t distribution", () => {
  it("matches tables", () => {
    expect(pTwoSided(2.228, 10)).toBeCloseTo(0.05, 3); // t(10) 97.5%
    expect(pTwoSided(1.96, 1e6)).toBeCloseTo(0.05, 3);
    expect(pTwoSided(0, 5)).toBeCloseTo(1, 6);
    expect(tCrit(20)).toBeCloseTo(2.086, 3);
  });
});

describe("ols", () => {
  it("recovers an exact line", () => {
    const X = [0, 1, 2, 3, 4, 5].map((x) => [1, x]), y = [0, 1, 2, 3, 4, 5].map((x) => 3 + 2 * x);
    const f = ols(X, y)!;
    expect(f.coef[0]).toBeCloseTo(3, 9); expect(f.coef[1]).toBeCloseTo(2, 9);
  });
  it("gives textbook SEs (simple regression)", () => {
    const xs = [1, 2, 3, 4, 5], ys = [2, 4, 5, 4, 5];
    const f = ols(xs.map((x) => [1, x]), ys)!;
    expect(f.coef[1]).toBeCloseTo(0.6, 9);
    expect(f.se[1]).toBeCloseTo(0.2828, 3); // sqrt((2.4/3)/10)
    expect(f.p[1]).toBeCloseTo(0.124, 2); // t = 2.12, df 3
  });
  it("refuses degenerate designs", () => {
    expect(ols([[1, 1], [1, 1], [1, 1], [1, 1]], [1, 2, 3, 4])).toBeNull();
  });
});

describe("Benjamini–Hochberg", () => {
  it("passes the classic example", () => {
    expect(bh([0.01, 0.04, 0.03, 0.2], 0.1)).toEqual([true, true, true, false]);
    expect(bh([0.2, 0.5, 0.9])).toEqual([false, false, false]);
  });
});
