import { describe, expect, it } from "vitest";
import { baseline, proteinPerKg, strengthTrends } from "./more";
import { feelWorld } from "../bench";
import type { Entry } from "../types";
import { DAY } from "../time";

const NOW = new Date(2026, 8, 30, 12).getTime();
const sessions = (kgs: number[], everyDays = 4): Entry[] => kgs.flatMap((kg, i) => {
  const at = NOW - (kgs.length - i) * everyDays * DAY;
  return [{ id: `s${i}a`, kind: "set", at, workoutId: `w${i}`, exercise: "Bench press", kg, reps: 5 }, { id: `s${i}b`, kind: "set", at: at + 60_000, workoutId: `w${i}`, exercise: "Bench press", kg: kg - 5, reps: 8 }];
});

describe("strength trend", () => {
  it("says a lift is rising, per month, from the best set of each session", () => {
    const [f] = strengthTrends(sessions([80, 80, 82.5, 82.5, 85, 85, 87.5, 87.5]), NOW);
    expect(f.title).toMatch(/^Bench press: est\. 1-rep max up \d+\.\d kg a month$/);
    expect(Number(f.value)).toBeGreaterThan(5);
  });
  it("says stalled only when the whole range is flat", () => {
    const [f] = strengthTrends(sessions([80, 80, 80, 80, 80, 80, 80]), NOW);
    expect(f.title).toBe("Bench press has stalled");
    expect(strengthTrends(sessions([80, 85, 78, 86]), NOW)).toEqual([]); // noisy, 4 sessions: says nothing
  });
});

describe("protein per kg", () => {
  it("compares with the 1.6 g/kg plateau", () => {
    const facts = feelWorld({ seed: 1, days: 28 }); // ~130 g/day
    const f = proteinPerKg(facts, 90)!;
    expect(f.title).toMatch(/^You average 1\.[3-5] g of protein per kg$/);
    expect(f.detail).toMatch(/about 144 g a day for you/);
    expect(proteinPerKg(facts, 70)!.detail).toMatch(/At or above ~1\.6 g\/kg/);
  });
});

describe("baseline", () => {
  it("gives your usual and how weekends differ", () => {
    const f = baseline(feelWorld({ seed: 2, days: 28, weekendMood: 1.5 }))!;
    expect(f.title).toMatch(/^Your usual: energy \d\.\d, mood \d\.\d, focus \d\.\d, stress \d\.\d$/);
    expect(f.detail).toMatch(/Weekends differ: .*mood \+/);
  });
  it("needs a week of ratings", () => {
    expect(baseline(feelWorld({ seed: 2, days: 28, rateRate: 0.1 }))).toBeNull();
  });
});
