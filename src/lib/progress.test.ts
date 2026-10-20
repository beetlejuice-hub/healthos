import { describe, expect, it } from "vitest";
import { adaptNext, parseReps, plateau, repsLabel, repsOf, smartNext } from "./progress";

// Owner, 20 Oct: "Can we make it so workouts are smart, rep and kg tracking is smart … Make it smart"
const ss = (kg: number, ...reps: number[]) => reps.map((r) => ({ kg, reps: r }));

describe("what to lift today", () => {
  it("as before: every set hit the target → one step up; short → repeat", () => {
    expect(smartNext([ss(60, 8, 8, 8)], 8, 2.5)).toMatchObject({ kg: 62.5, reps: 8 });
    expect(smartNext([ss(60, 8, 7, 6)], 8, 2.5)).toMatchObject({ kg: 60 });
  });
  it("reps to spare (every set 3+ over) → two steps up, and says why", () => {
    const s = smartNext([ss(40, 12, 11, 11)], 8, 2);
    expect(s).toMatchObject({ kg: 44, reps: 8 });
    expect(s!.reason).toBe("reps to spare last time (12/11/11 against 8), so +4 kg");
    expect(smartNext([ss(40, 12, 10, 11)], 8, 2)!.kg).toBe(42); // one set only 2 over: one step
  });
  it("stuck: the same weight short two sessions running, reps not climbing → about 10 % down on the grid", () => {
    const s = smartNext([ss(80, 7, 6, 5), ss(80, 7, 6, 6)], 8, 2.5);
    expect(s).toMatchObject({ kg: 70 }); // 72 → 70 on the 2.5 grid
    expect(s!.reason).toMatch(/^80 kg fell short two sessions running \(7\/6\/6, then 7\/6\/5\), so 70 kg/);
  });
  it("short twice but reps climbing: keep going at that weight", () => {
    expect(smartNext([ss(80, 8, 7, 7), ss(80, 7, 6, 6)], 8, 2.5)).toMatchObject({ kg: 80 });
  });
  it("short twice at different weights isn't stuck", () => {
    expect(smartNext([ss(82.5, 7, 6, 6), ss(80, 8, 8, 8)], 8, 2.5)).toMatchObject({ kg: 82.5 });
  });
  it("no history: nothing to suggest", () => { expect(smartNext([], 8, 2.5)).toBeNull(); });
});

describe("the next set, inside today's session", () => {
  it("3+ over the target → one step up; 3+ under → one step down; near it → as it is", () => {
    expect(adaptNext(ss(40, 12), 8, 2)).toEqual({ kg: 42, reason: "12 reps at 40 kg — that was light, so a step up" });
    expect(adaptNext(ss(60, 5), 8, 2.5)).toEqual({ kg: 57.5, reason: "5 of 8 reps at 60 kg — a step down to keep the reps" });
    expect(adaptNext(ss(60, 10), 8, 2.5)).toBeNull();
    expect(adaptNext(ss(60, 6), 8, 2.5)).toBeNull();
    expect(adaptNext([], 8, 2.5)).toBeNull();
  });
});

describe("a plateau", () => {
  it("the last 3 sessions all short of the best before them → a note; one beat it → none", () => {
    expect(plateau([ss(60, 7), ss(60, 7), ss(60, 6), ss(60, 8)])).toMatch(/^3 sessions without beating your best \(≈ 76 kg 1-rep max\)/);
    expect(plateau([ss(62.5, 8), ss(60, 7), ss(60, 6), ss(60, 8)])).toBeNull();
    expect(plateau([ss(60, 7), ss(60, 7), ss(60, 8)])).toBeNull(); // too few to say
  });
});

// PLAN 144 (owner: "do these" — rep ranges per exercise)
describe("a rep range (8–12)", () => {
  const r = { lo: 8, hi: 12 };
  it("reps climb at the same weight: aim one more than the weakest set, up to the top", () => {
    expect(smartNext([ss(40, 10, 9, 9)], r, 2)).toEqual({ kg: 40, reps: 10, reason: "10/9/9 last time, inside 8–12: same 40 kg, aim for 10 a set" });
    expect(smartNext([ss(40, 12, 12, 11)], r, 2)).toMatchObject({ kg: 40, reps: 12 });
  });
  it("every set at the top → a step up and back to the bottom", () => {
    expect(smartNext([ss(40, 12, 12, 12)], r, 2)).toEqual({ kg: 42, reps: 8, reason: "every set reached 12, the top of 8–12 (12/12/12), so +2 kg and back to 8" });
  });
  it("far past the top (15+) → two steps", () => {
    expect(smartNext([ss(40, 15, 15, 16)], r, 2)).toMatchObject({ kg: 44, reps: 8 });
  });
  it("under the bottom two sessions running, reps not climbing → about 10 % back", () => {
    expect(smartNext([ss(50, 7, 6, 6), ss(50, 7, 7, 6)], r, 2)).toMatchObject({ kg: 44, reps: 8 });
  });
  it("inside a session: 3+ over the top or under the bottom moves the next set", () => {
    expect(adaptNext(ss(40, 15), r, 2)?.kg).toBe(42);
    expect(adaptNext(ss(40, 11), r, 2)).toBeNull();
    expect(adaptNext(ss(40, 5), r, 2)).toEqual({ kg: 38, reason: "5 of 8–12 reps at 40 kg — a step down to keep the reps" });
  });
  it("one number behaves as before", () => {
    expect(smartNext([ss(60, 8, 8, 8)], 8, 2.5)).toEqual(smartNext([ss(60, 8, 8, 8)], { lo: 8, hi: 8 }, 2.5));
  });
  it("typed in the editor: 8-12, 8–12, 8 to 12, 10; nonsense waits", () => {
    expect(["8-12", "8–12", "8 to 12", " 8 - 12 ", "10", "12-8", "8-"].map(parseReps)).toEqual([
      { reps: 8, repsMax: 12 }, { reps: 8, repsMax: 12 }, { reps: 8, repsMax: 12 }, { reps: 8, repsMax: 12 }, { reps: 10 }, { reps: 12 }, { reps: 8 }]);
    expect(["", "x", "8-12-15"].map(parseReps)).toEqual([null, null, null]);
    expect([repsLabel({ reps: 8, repsMax: 12 }), repsLabel({ reps: 10 }), repsLabel({ reps: 10, repsMax: 10 })]).toEqual(["8–12", "10", "10"]);
    expect(repsOf({ reps: 8, repsMax: 12 })).toEqual({ lo: 8, hi: 12 });
  });
});
