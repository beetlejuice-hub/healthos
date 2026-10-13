import { describe, expect, it } from "vitest";
import { BED_EDGES, bandLabels, bestBand, SLEEP_EDGES, windowLabel } from "./sleepneed";
import { rng } from "./bench";

/** 60 days, hours asleep spread 5.5–9 h. Planted (`peak`): the next day's energy +1.2 after 7–7½ h, −0.8 after under 6 h. */
function world(seed: number, peak: boolean, days = 60): [number, number][] {
  const { r, g } = rng(seed);
  return Array.from({ length: days }, () => { const h = 5.5 + r() * 3.5; return [h, 6 + g() * 0.7 + (peak && h >= 7 && h < 7.5 ? 1.2 : 0) - (peak && h < 6 ? 0.8 : 0)] as [number, number]; });
}

describe("sleep need and best bedtime (PLAN 88 phase 4)", () => {
  it("labels read like a person would say them", () => {
    expect(bandLabels(SLEEP_EDGES, "hours")).toEqual(["under 6 h", "6–6½ h", "6½–7 h", "7–7½ h", "7½–8 h", "8 h+"]);
    expect(bandLabels(BED_EDGES, "clock")).toEqual(["before 23:00", "23:00–23:30", "23:30–00:00", "00:00–00:30", "after 00:30"]);
    expect([windowLabel(7, 8, "hours"), windowLabel(8, Infinity, "hours"), windowLabel(-Infinity, 6, "hours")]).toEqual(["7–8 h", "8 h+", "under 6 h"]);
    expect([windowLabel(-Infinity, 24, "clock"), windowLabel(23, 23.5, "clock"), windowLabel(24.5, Infinity, "clock")]).toEqual(["before 00:00", "23:00–23:30", "after 00:30"]);
  });
  it("finds the planted best band (7–7½ h), about the planted size", () => {
    const b = bestBand(world(3, true), SLEEP_EDGES, "hours");
    expect(b.best?.label).toBe("7–7½ h");
    expect(["clear", "likely"]).toContain(b.sure);
    expect(b.diff!).toBeGreaterThan(0.8); expect(b.diff!).toBeLessThan(1.8);
    expect(b.bands.reduce((s, x) => s + x.vals.length, 0)).toBe(60);
  });
  it("nothing planted: picking the best of six bands doesn't come up clear by chance (20 worlds)", () => {
    let clear = 0, likely = 0;
    for (let s = 600; s < 620; s++) { const b = bestBand(world(s, false), SLEEP_EDGES, "hours", 1, { seed: s }); clear += +(b.sure === "clear"); likely += +(b.sure === "likely"); }
    expect(clear).toBe(0); expect(likely).toBeLessThanOrEqual(2);
  }, 30_000);
  it("bedtime against deep sleep: a planted −15 min after midnight (a step) → 'before 00:00', clear, in 4 worlds of 4", () => {
    for (const seed of [8, 9, 10, 11]) {
      const { r, g } = rng(seed);
      const pts = Array.from({ length: 50 }, () => { const bed = 22.5 + r() * 2.5; return [bed, 75 + g() * 6 - (bed >= 24 ? 15 : 0)] as [number, number]; });
      const b = bestBand(pts, BED_EDGES, "clock");
      expect(b.best!.label).toBe("before 00:00"); expect(b.sure).toBe("clear"); expect(b.diff!).toBeGreaterThan(11);
    }
  });
  it("less-is-better (stress): the band with the lowest stress is the best one", () => {
    const { r, g } = rng(4);
    const pts = Array.from({ length: 60 }, () => { const h = 5.5 + r() * 3.5; return [h, 5 + g() * 0.6 - (h >= 7.5 && h < 8 ? 1.5 : 0)] as [number, number]; });
    const b = bestBand(pts, SLEEP_EDGES, "hours", -1);
    expect(b.best?.label).toBe("7½–8 h"); expect(b.diff!).toBeLessThan(0);
  });
  it("under 14 days, or no band with 4 days and 4 others: says too few", () => {
    expect(bestBand(world(3, true, 10), SLEEP_EDGES, "hours").sure).toBe("too few");
    expect(bestBand(Array.from({ length: 20 }, (_, k) => [7.2, k % 10] as [number, number]), SLEEP_EDGES, "hours").sure).toBe("too few");
  });
});
