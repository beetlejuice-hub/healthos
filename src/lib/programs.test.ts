import { describe, expect, it } from "vitest";
import { PROGRAMS, asSplit } from "./programs";
import { MUSCLES, isBest, restLeft, sessionSummary } from "./training";

describe("premade workouts", () => {
  it("only use exercises the app knows (history, suggestions and the muscle map understand them)", () => {
    const unknown = PROGRAMS.flatMap((p) => p.days.flatMap((d) => d.exercises.map((e) => e.name))).filter((n) => !MUSCLES[n]);
    expect(unknown).toEqual([]);
  });
  it("day names are unique within a program, and a split is a copy (editing it can't change the library)", () => {
    for (const p of PROGRAMS) expect(new Set(p.days.map((d) => d.name)).size).toBe(p.days.length);
    const s = asSplit(PROGRAMS[0]);
    s[0].exercises[0].sets = 99;
    expect(PROGRAMS[0].days[0].exercises[0].sets).not.toBe(99);
  });
});

describe("during and after a session", () => {
  const S = (at: number, exercise: string, kg: number, reps: number, workoutId = "w2") => ({ at, workoutId, exercise, kg, reps });
  const old = [S(1, "Bench press", 60, 8, "w1"), S(2, "Bench press", 62.5, 6, "w1")];

  it("rest left is from a saved end time, so it keeps counting while the app is closed", () => {
    expect(restLeft(10_000 + 90_000, 10_000)).toBe(90);
    expect(restLeft(10_000 + 90_000, 10_000 + 60 * 60_000)).toBe(0); // came back an hour later
    expect(restLeft(null, 5)).toBe(0);
  });

  it("a new best beats every earlier set's estimated 1RM; first time and ties aren't bests", () => {
    expect(isBest(old, S(10, "Bench press", 65, 6))).toBe(true); // 78 > 76
    expect(isBest(old, S(10, "Bench press", 60, 8))).toBe(false); // equal to the best
    expect(isBest(old, S(10, "Squat", 100, 5))).toBe(false); // first time
    expect(isBest(old, S(10, "Bench press", 40, 20))).toBe(false); // 20 reps: estimate too poor to call
  });

  it("summary: minutes, sets, volume vs the last same day, and the bests", () => {
    const sets = [...old, S(100, "Bench press", 65, 6), S(200, "Bench press", 65, 5)];
    const ws = [{ id: "w1", template: "Upper A", startedAt: 0, endedAt: 50 }, { id: "w2", template: "Upper A", startedAt: 60_000, endedAt: null }];
    const s = sessionSummary(ws[1], sets, ws, 60_000 + 47 * 60_000);
    expect(s).toMatchObject({ minutes: 47, sets: 2, volume: 715 });
    expect(s.vsLast).toBeCloseTo(715 / (480 + 375), 5);
    expect(s.bests).toEqual([{ exercise: "Bench press", kg: 65, reps: 6, e1rm: 78 }]);
  });
});
