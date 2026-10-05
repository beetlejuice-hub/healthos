import { describe, expect, it } from "vitest";
import { dayRanges, feelRuns, feelText, latestCheck, nearestCheck, type Check } from "./feelgraph";

const T = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).getTime();
const checks: Check[] = [
  { at: T(30, 10), mood: 6, energy: 7 }, { at: T(30, 13), mood: 5 }, { at: T(30, 21), mood: 7, note: "good evening" },
  { at: T(1 + 30, 9), mood: 4 }, // next morning (1 Oct)
];

describe("feelings on the graph: only what you rated", () => {
  it("joins check-ins within 4 h; never across the night or a long gap", () => {
    expect(feelRuns(checks, "mood").map((r) => r.map((p) => p[1]))).toEqual([[6, 5], [7], [4]]);
    expect(feelRuns(checks, "energy")).toEqual([[[T(30, 10), 7]]]);
  });
  it("a day's range runs from its first to last check-in", () => {
    expect(dayRanges(checks, "mood")[0]).toEqual({ day: "2026-09-30", lo: 5, hi: 7, from: T(30, 10), to: T(30, 21) });
    expect(dayRanges(checks, "mood")).toHaveLength(2);
  });
  it("finds the check-in under the finger, and what was rated last", () => {
    expect(nearestCheck(checks, T(30, 20, 50), 20 * 60_000)?.note).toBe("good evening");
    expect(nearestCheck(checks, T(30, 17), 20 * 60_000)).toBeNull();
    expect(latestCheck(checks, T(30, 14))?.mood).toBe(5);
    expect(latestCheck(checks, T(30, 18))).toBeNull(); // 5 h after: too old to be "now"
    expect(feelText(checks[0])).toBe("energy 7 · mood 6");
  });
});

import { dailyFeel } from "./feelgraph";
describe("dailyFeel", () => {
  it("gives each day its average at noon, with the day's lowest and highest", () => {
    const at = (d: number, h: number) => new Date(2026, 9, d, h).getTime();
    const out = dailyFeel([{ at: at(1, 9), mood: 4 }, { at: at(1, 15), mood: 8 }, { at: at(1, 20), energy: 3 }, { at: at(2, 10), mood: 6 }], "mood");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ day: "2026-10-01", mean: 6, lo: 4, hi: 8, n: 2, at: at(1, 12) });
    expect(out[1]).toMatchObject({ mean: 6, n: 1 });
  });
});

import { lifeBars, ribbonRuns, ribbonWidth, stressMix } from "./feelgraph";
describe("How you felt lane", () => {
  const at = (d: number, h: number) => new Date(2026, 9, d, h).getTime();
  const cs = [{ at: at(1, 9), mood: 4, energy: 2, stress: 8 }, { at: at(1, 15), mood: 6, energy: 8, note: "deadline" }, { at: at(1, 23, ), energy: 5 }, { at: at(2, 0), mood: 9 }, { at: at(2, 10), mood: 7, stress: 3 }];
  it("ribbon: one run per day, so it never crosses a night", () => {
    const runs = ribbonRuns(cs);
    expect(runs.map((r) => r.length)).toEqual([2, 2]);
    expect(runs[1][0].mood).toBe(9); // 00:00 starts the new day
  });
  it("ribbon: thicker with energy, warmer with stress", () => {
    expect(ribbonWidth(2)).toBeLessThan(ribbonWidth(9));
    expect(ribbonWidth(undefined)).toBe(ribbonWidth(5));
    expect(stressMix(2)).toBe(0); expect(stressMix(9)).toBe(1); expect(stressMix(undefined)).toBeNull();
  });
  it("life chart: each day against the average of every mood given", () => {
    const { base, days } = lifeBars(cs);
    expect(base).toBeCloseTo(6.5, 6); // (4 + 6 + 9 + 7) / 4
    expect(days.map((d) => d.day)).toEqual(["2026-10-01", "2026-10-02"]);
    expect(days[0]).toMatchObject({ mood: 5, energy: 5, stress: 8, note: true });
    expect(days[0].dev).toBeCloseTo(-1.5, 6); expect(days[1].dev).toBeCloseTo(1.5, 6);
    expect(lifeBars([{ at: at(1, 9), energy: 3 }])).toEqual({ base: null, days: [] });
  });
});
