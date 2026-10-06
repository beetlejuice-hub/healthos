import { describe, expect, it } from "vitest";
import { PROGRAMS, asSplit } from "./programs";
import { MUSCLES, MUSCLE_GROUPS, isBest, muscleWeek, restLeft, sessionSummary } from "./training";

describe("premade workouts", () => {
  it("only use exercises the app knows (history, suggestions and the muscle map understand them)", () => {
    const unknown = PROGRAMS.flatMap((p) => p.days.flatMap((d) => d.exercises.flatMap((e) => [e.name, ...(e.or ? [e.or] : [])]))).filter((n) => !MUSCLES[n]);
    expect(unknown).toEqual([]);
  });
  it("day names are unique within a program, and a split is a copy (editing it can't change the library)", () => {
    for (const p of PROGRAMS) expect(new Set(p.days.map((d) => d.name)).size).toBe(p.days.length);
    const s = asSplit(PROGRAMS[0]);
    s[0].exercises[0].sets = 99;
    expect(PROGRAMS[0].days[0].exercises[0].sets).not.toBe(99);
  });
  it("the owner's plan (6 Oct), as he wrote it: 3 lifting days, 3 sets each, cardio after, his rules", () => {
    const p = PROGRAMS.find((x) => x.id === "ppm")!;
    expect(p.days.map((d) => [d.name, d.exercises.map((e) => e.name), d.after])).toEqual([
      ["Push + Quads", ["Squat", "DB bench press", "DB shoulder press", "Leg extension", "Lateral raise", "Rope pushdown"], "20 min stairmaster"],
      ["Pull + Hamstrings", ["Romanian deadlift", "Lat pulldown", "Seated cable row", "Leg curl", "Face pull", "Incline DB curl"], "20 min incline walk"],
      ["Mixed", ["Incline DB press", "Chest-supported row", "Bulgarian split squat", "Pec deck", "Lateral raise", "Hammer curl", "Overhead tricep extension"], "20 min stairmaster"],
    ]);
    expect(p.days.every((d) => d.exercises.every((e) => e.sets === 3))).toBe(true);
    expect(p.days[0].exercises[0].or).toBe("Hack squat");
    expect(p.other!.map((o) => o.name)).toEqual(["Cardio", "Rest days"]);
    expect(p.rules!.join(" ")).toMatch(/1–2 reps short of failure.*add weight.*6–8 weeks.*under 0\.3 kg a week → 150 kcal less.*0\.7 kg a week, or lifts dropping → 150 kcal more/);
  });
  it("as your split it's plain, editable days: no swap or cardio notes carried into what's saved", () => {
    const s = asSplit(PROGRAMS.find((x) => x.id === "ppm")!);
    expect(s.map((d) => Object.keys(d).sort())).toEqual(Array(3).fill(["exercises", "id", "name"]));
    expect(s.flatMap((d) => d.exercises.map((e) => Object.keys(e).sort().join()))).toEqual(Array(19).fill("name,reps,restSec,sets"));
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

describe("the muscle map", () => {
  const D = 86_400_000, now = 100 * D;
  it("counts hard sets per muscle in the last 7 days, secondary muscles at half", () => {
    const sets = [...Array(4)].map((_, i) => ({ at: now - D + i, exercise: "Bench press" })).concat([{ at: now - 8 * D, exercise: "Squat" }]);
    const w = muscleWeek(sets, now);
    expect(w).toMatchObject({ Chest: 4, Triceps: 2, Shoulders: 2, Quads: 0 });
  });
  it("4 weeks is a weekly average", () => {
    const sets = [...Array(8)].map((_, i) => ({ at: now - i * 3 * D - 1, exercise: "Squat" }));
    expect(muscleWeek(sets, now, 4).Quads).toBe(2);
  });
  it("every muscle any known exercise trains is on the map", () => {
    const named = new Set(Object.values(MUSCLES).flatMap((m) => Object.keys(m)));
    expect([...named].filter((m) => !(MUSCLE_GROUPS as readonly string[]).includes(m))).toEqual([]);
  });
});
