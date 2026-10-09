import { describe, expect, it } from "vitest";
import type { HrMinute, StepBucket } from "./band";
import { stepsByDay, stepsIn, usualSteps, walked } from "./steps";
import { atMinute, MIN } from "./time";

const D = "2026-10-06";
const at = (day: string, h: number) => atMinute(day, Math.round(h * 60));
/** Heart rate every minute from `fromH` to `toH` that day: the band was on. */
const worn = (day: string, fromH: number, toH: number): HrMinute[] => { const out: HrMinute[] = []; for (let t = at(day, fromH); t < at(day, toH); t += MIN) out.push([t, 70, 68, 72]); return out; };

describe("steps (PLAN 66)", () => {
  it("steps in a span: whole windows inside, a cut window by its share", () => {
    const s: StepBucket[] = [[at(D, 10), 5, 100], [at(D, 10) + 5 * MIN, 5, 200], [at(D, 11), 60, 600]];
    expect(stepsIn(s, at(D, 10), at(D, 10) + 10 * MIN)).toBe(300);
    expect(stepsIn(s, at(D, 10) + 2 * MIN, at(D, 10) + 5 * MIN)).toBe(60);
    expect(stepsIn(s, at(D, 11.5), at(D, 12.5))).toBe(300); // half the hour window
    expect(stepsIn(s, at(D, 13), at(D, 14))).toBe(0);
  });

  it("walking: 400+ steps at 15+ a minute over the stretch — a slow hour of pottering isn't", () => {
    const walk: StepBucket[] = [0, 1, 2, 3].map((i) => [at(D, 15) + i * 5 * MIN, 5, 450]); // 20 min at 90 a minute
    expect(walked(walk, at(D, 15), at(D, 15.5))).toBe(1800);
    expect(walked([[at(D, 15), 5, 390]], at(D, 15), at(D, 15.5))).toBeNull(); // under 400
    expect(walked([[at(D, 15), 5, 460]], at(D, 15), at(D, 15.5))).toBe(460); // 5 brisk minutes in a 30-minute stretch
    const potter: StepBucket[] = Array.from({ length: 12 }, (_, i) => [at(D, 15) + i * 5 * MIN, 5, 50]);
    expect(walked(potter, at(D, 15), at(D, 16))).toBeNull(); // 600 steps, 10 a minute
  });

  it("a day's total only when the band was on most of the day — a day it was off has no total, not 0", () => {
    const s: StepBucket[] = [[at("2026-10-05", 9), 5, 500], [at("2026-10-05", 18), 5, 700], [at(D, 9), 5, 300], [at("2026-10-07", 9), 5, 900]];
    const hr = [...worn("2026-10-05", 7, 22), ...worn(D, 8, 10), ...worn("2026-10-07", 7, 22)];
    const m = stepsByDay(s, hr, "2026-10-07");
    expect([...m]).toEqual([["2026-10-05", 1200]]); // the 6th: band on 2 h of 13; the 7th: today, not finished
    expect(stepsByDay(s, [...hr, ...worn(D, 10, 21)], "2026-10-08").get(D)).toBe(300);
  });

  it("worn but no steps sent that day: no total either (the pull may have failed)", () => {
    expect(stepsByDay([], worn(D, 7, 22), "2026-10-08").size).toBe(0);
  });

  it("usual: the middle of the days given that have a total; under 8 days, none", () => {
    const m = new Map(Array.from({ length: 9 }, (_, i) => [`2026-09-${String(10 + i).padStart(2, "0")}`, (i + 1) * 1000] as [string, number]));
    expect(usualSteps(m, [...m.keys(), "2026-09-30"])).toBe(5000);
    expect(usualSteps(m, [...m.keys()].slice(0, 8))).toBe(4500);
    expect(usualSteps(m, [...m.keys()].slice(0, 7))).toBeNull();
  });
});
