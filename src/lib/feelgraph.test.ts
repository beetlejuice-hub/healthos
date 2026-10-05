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
