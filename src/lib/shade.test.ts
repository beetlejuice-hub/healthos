import { describe, expect, it } from "vitest";
import { shade, shadeAttrs } from "./shade";

describe("a value's shade against your usual (PLAN 105, the owner's pick: B · Heat)", () => {
  it("inside the band: no shade, whichever way is better", () => {
    expect([shade(6.0, 5.5, 6.5, "up"), shade(5.5, 5.5, 6.5, "down"), shade(6.5, 5.5, 6.5, null)].map((s) => s.lvl)).toEqual([0, 0, 0]);
  });
  it("steps by how far beyond, in band widths: ≤ ½ slight, ≤ 1½ clear, past that far off", () => {
    // band 5.5–6.5 (width 1): mood 6.9 is 0.4 over → 1; 7.4 → 2; 8.5 → 3
    expect([shade(6.9, 5.5, 6.5, "up").lvl, shade(7.4, 5.5, 6.5, "up").lvl, shade(8.5, 5.5, 6.5, "up").lvl]).toEqual([1, 2, 3]);
    expect([shade(5.0, 5.5, 6.5, "up").lvl, shade(4.4, 5.5, 6.5, "up").lvl, shade(3.0, 5.5, 6.5, "up").lvl]).toEqual([1, 2, 3]);
  });
  it("green when that way is better for you, red when worse, grey when neither", () => {
    expect([shade(7.4, 5.5, 6.5, "up").tone, shade(4.4, 5.5, 6.5, "up").tone]).toEqual(["better", "worse"]);
    expect([shade(7.4, 5.5, 6.5, "down").tone, shade(4.4, 5.5, 6.5, "down").tone]).toEqual(["worse", "better"]); // stress: lower is better
    expect(shade(3200, 2200, 2700, null).tone).toBe("neutral"); // calories: depends on your goal
  });
  it("a band of one value isn't a hair-trigger: its width is at least a tenth of its middle (or what you give)", () => {
    // stress always 4.0: the floor is 0.4, so 4.3 is ¾ of a width over — clear, not "far off"; on a 1–10 scale the
    // pages give a floor of 1 point, and then it's slight
    expect(shade(4.3, 4, 4, "down")).toEqual({ lvl: 2, tone: "worse" });
    expect(shade(4.3, 4, 4, "down", 1).lvl).toBe(1);
    expect(shade(5.6, 4, 4, "down", 1).lvl).toBe(3);
  });
  it("nothing to shade without a value or a band; the attributes only when there's a shade", () => {
    expect([shade(null, 1, 2, "up").lvl, shade(Number.NaN, 1, 2, "up").lvl, shade(3, Number.NaN, 2, "up").lvl]).toEqual([0, 0, 0]);
    expect(shadeAttrs(shade(8.5, 5.5, 6.5, "up"))).toEqual({ "data-tone": "better", "data-lvl": 3 });
    expect(shadeAttrs(shade(6, 5.5, 6.5, "up"))).toEqual({});
  });
});
