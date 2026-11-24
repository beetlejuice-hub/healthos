// PLAN 226 — a workout's heart rate, to draw. Known answers: a 30-minute run at 150 (max 190: Z3, 79 %) with a 5-minute
// push at 175 (Z5, 92 %): the runs go Z1/below → Z3 → Z5 → Z3 → down, with no gap in the line; the average and peak are
// the session's own; the recovery is the drop in the 2 minutes after the effort.
import { describe, expect, it } from "vitest";
import { hrTrace, zoneOfHr } from "./workouthr";
import type { HrMinute } from "./band";

const MIN = 60_000, T0 = Date.UTC(2026, 10, 24, 17);
const run = (): HrMinute[] => Array.from({ length: 50 }, (_, i) => {
  const m = i - 5, t = T0 + m * MIN;
  const v = m < 0 ? 80 : m < 20 ? 150 : m < 25 ? 175 : m < 30 ? 150 : Math.max(90, 150 - (m - 29) * 15);
  return [t, v, v - 2, v + 2];
});

describe("a workout's heart rate", () => {
  it("zones by % of max; none without a max", () => {
    expect([zoneOfHr(90, 190), zoneOfHr(100, 190), zoneOfHr(150, 190), zoneOfHr(175, 190)]).toEqual([0, 1, 3, 5]);
    expect(zoneOfHr(175, null)).toBe(0);
  });
  it("the run in zones, joined; the session's average and peak; the drop after", () => {
    const t = hrTrace(run(), T0, T0 + 30 * MIN, 190)!;
    expect(t.runs.map((r) => r.z)).toEqual([0, 3, 5, 3, 2, 1, 0]);
    for (let i = 1; i < t.runs.length; i++) expect(t.runs[i].pts[0]).toBe(t.runs[i - 1].pts[t.runs[i - 1].pts.length - 1]);
    expect(t.avg).toBe(Math.round((25 * 150 + 5 * 175) / 30));
    expect(t.peak!.v).toBe(175);
    expect(t.n).toBe(30);
    expect(t.recovery!.drop).toBeGreaterThanOrEqual(25);
    expect(t.from).toBe(T0 - 5 * MIN); expect(t.to).toBe(T0 + 40 * MIN);
  });
  it("too few minutes from the band: nothing to draw", () => expect(hrTrace(run().slice(0, 2), T0, T0 + 30 * MIN, 190)).toBeNull());
});
