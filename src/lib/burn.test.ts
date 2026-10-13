import { describe, expect, it } from "vitest";
import { balance } from "./burn";

describe("eaten against burned (PLAN 83)", () => {
  it("says how far apart, and calls 100 kcal either way about even", () => {
    expect(balance(1520, 1840)).toEqual({ diff: -320, words: "320 less than burned" });
    expect(balance(2900, 2450)).toEqual({ diff: 450, words: "450 more than burned" });
    expect(balance(2400, 2460).words).toBe("about even");
    expect(balance(3100, 1000).words).toBe("2,100 more than burned");
  });
});
