// PLAN 202 — owner, 10 Nov: "Workout should be finished automatically, app should detect when my heartrate started to
// come down … if its just for a couple minutes it should ask if its just a break or finished". Planted heart-rate traces:
// a lifting session (sets at 125–145, rests at 100–110) that ends — found within 2 minutes of the real end; cardio the
// same. Controls: the rests between sets, and a long 4-minute rest dipping under "working", are not an end; a band that
// stopped sending isn't a heart that slowed; no working minute (band off) says so; stale data doesn't ask.
import { describe, expect, it } from "vitest";
import { rng } from "./bench";
import { AUTOFIN, workingHr, workoutEnding } from "./autofinish";
import type { HrMinute } from "./band";

const MIN = 60_000, T0 = Date.UTC(2026, 10, 10, 17, 0), REST = 55, MAX = 190;
/** A minute-by-minute trace: [minute from T0, bpm] pairs, with ±3 bpm noise. */
function trace(bpm: (m: number) => number | null, minutes: number, seed = 1): HrMinute[] {
  const { g } = rng(seed), out: HrMinute[] = [];
  for (let m = 0; m < minutes; m++) { const b = bpm(m); if (b != null) { const v = Math.round(b + 3 * g()); out.push([T0 + m * MIN, v, v - 3, v + 3]); } }
  return out;
}
/** Lifting until `end`: a minute's set at 125–145, then 2 minutes' rest at 100–110; after the end, down to 75 within 4 minutes. */
const lifting = (end: number) => (m: number) => (m < end ? (m % 3 === 0 ? 135 : 105) : Math.max(72, 100 - (m - end) * 7));
const at = (min: number) => T0 + min * MIN;
const o = (now: number, x: Partial<Parameters<typeof workoutEnding>[1]> = {}) => ({ startedAt: T0, now, rest: REST, max: MAX, ...x });

describe("a workout that finishes itself", () => {
  it("working: the resting rate plus 30 % of the way to max (55, 190 → 96)", () => {
    expect(workingHr(REST, MAX)).toBe(96);
  });
  it("planted: lifting that ends at 62 min is found done within 2 minutes of it, across 20 sessions", () => {
    let hits = 0;
    for (let s = 1; s <= 20; s++) {
      const e = workoutEnding(trace(lifting(62), 62 + 20, s), o(at(82)));
      if (e.kind === "done" && Math.abs((e.at - at(62)) / MIN) <= 2) hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(19);
  });
  it("planted: 40 minutes of cardio at 150, then down — done at its end", () => {
    const e = workoutEnding(trace((m) => (m < 40 ? 150 : 80), 60), o(at(60)));
    expect(e.kind).toBe("done");
    if (e.kind === "done") expect(Math.abs((e.at - at(40)) / MIN)).toBeLessThanOrEqual(2);
  });
  it("control: mid-session, the rests between sets aren't an end", () => {
    for (let s = 1; s <= 20; s++) expect(workoutEnding(trace(lifting(90), 45, s), o(at(45))).kind).toBe("working");
  });
  it("control: a long 4-minute rest dipping to 90 is not even a pause", () => {
    const bpm = (m: number) => (m < 30 ? (m % 3 === 0 ? 135 : 105) : m < 34 ? 90 : 135);
    expect(workoutEnding(trace(bpm, 34, 3), o(at(34))).kind).toBe("working");
  });
  it("a few minutes down, the data live: ask — break or done?; not while the rest timer runs; not again once it's a break", () => {
    const hr = trace(lifting(30), 37, 5), e = workoutEnding(hr, o(at(37)));
    expect(e.kind).toBe("pause");
    expect(workoutEnding(hr, o(at(37), { resting: true })).kind).toBe("working");
    const since = e.kind === "pause" ? e.since : 0;
    expect(workoutEnding(hr, o(at(37), { breakAt: since })).kind).toBe("working");
    // after the break, a new set, then down again: asks again
    const back = trace((m) => (m < 30 ? lifting(30)(m) : m < 40 ? 80 : m < 46 ? (m % 3 === 0 ? 135 : 105) : 78), 53, 5);
    expect(workoutEnding(back, o(at(53), { breakAt: since })).kind).toBe("pause");
  });
  it("said it's a break: done waits 30 minutes, not 15", () => {
    const hr = trace(lifting(30), 30 + 20, 6), since = at(31);
    expect(workoutEnding(hr, o(at(50), { breakAt: since })).kind).toBe("working");
    expect(workoutEnding(trace(lifting(30), 30 + 32, 6), o(at(62), { breakAt: since })).kind).toBe("done");
  });
  it("control: stale data (the newest reading 30 minutes old) doesn't ask", () => {
    expect(workoutEnding(trace(lifting(30), 37, 7), o(at(67))).kind).toBe("working");
  });
  it("control: the band stopped sending after the last set — a gap, not an end", () => {
    const hr = trace((m) => (m < 30 ? lifting(30)(m) : m < 50 ? null : 70), 60, 8);
    expect(workoutEnding(hr, o(at(60)))).toEqual({ kind: "unknown", why: "gap" });
  });
  it("control: no working minute (the band in a drawer, a resting 65) — unknown, nothing ended", () => {
    expect(workoutEnding(trace(() => 65, 40, 9), o(at(40)))).toEqual({ kind: "unknown", why: "no-working" });
    expect(workoutEnding([], o(at(40)))).toEqual({ kind: "unknown", why: "no-data" });
  });
  it("a band that sends every 5 minutes: its gaps aren't missing data — the end is still found", () => {
    const sparse = trace(lifting(40), 70, 11).filter((m) => ((m[0] - T0) / MIN) % 5 === 0);
    expect(workoutEnding(sparse, o(at(70))).kind).toBe("unknown"); // as if every minute were due
    expect(workoutEnding(sparse, o(at(70), { gapSec: 300 })).kind).toBe("done");
  });
  it("thresholds as set", () => {
    expect([AUTOFIN.pauseMin, AUTOFIN.doneMin]).toEqual([5, 15]);
  });
});
