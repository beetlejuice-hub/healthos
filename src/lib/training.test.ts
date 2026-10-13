import { describe, expect, it } from "vitest";
import { dayStats, exerciseHistory, mainMuscle, nextTemplate, sameMuscle, sessionPlan, templateProblems, tidyWorkouts, e1rm, e1rmHistory, setsPerMuscle, suggestNext, volume, isDumbbell, warmsUp, warmKg, working, isBest } from "./training";

describe("e1rm — Epley", () => {
  it("estimates a one-rep max", () => {
    expect(e1rm(80, 6)).toBeCloseTo(96, 9);
    expect(e1rm(100, 1)).toBe(100);
  });

  it("keeps the best set per workout and ignores sets over 12 reps", () => {
    const h = e1rmHistory([
      { at: 1, workoutId: "a", exercise: "Bench press", kg: 80, reps: 6 },
      { at: 2, workoutId: "a", exercise: "Bench press", kg: 80, reps: 5 },
      { at: 3, workoutId: "a", exercise: "Bench press", kg: 40, reps: 20 },
      { at: 10, workoutId: "b", exercise: "Bench press", kg: 82.5, reps: 6 },
      { at: 11, workoutId: "b", exercise: "Squat", kg: 120, reps: 5 },
    ], "Bench press");
    expect(h.map((x) => x.workoutId)).toEqual(["a", "b"]);
    expect(h[0].e1rm).toBeCloseTo(96, 9);
  });
});

describe("suggestNext — double progression", () => {
  it("adds weight when every set hit the target", () => {
    expect(suggestNext([{ kg: 80, reps: 6 }, { kg: 80, reps: 6 }, { kg: 80, reps: 7 }], 6)).toMatchObject({ kg: 82.5, reps: 6 });
  });

  it("repeats the weight when a set fell short, and says why", () => {
    const s = suggestNext([{ kg: 80, reps: 6 }, { kg: 80, reps: 6 }, { kg: 80, reps: 5 }], 6)!;
    expect(s.kg).toBe(80);
    expect(s.reason).toContain("6/6/5");
  });

  it("judges only the top-weight sets (warm-ups don't count)", () => {
    expect(suggestNext([{ kg: 40, reps: 3 }, { kg: 80, reps: 6 }, { kg: 80, reps: 6 }], 6)!.kg).toBe(82.5);
  });

  it("has nothing to say without a last session", () => {
    expect(suggestNext([], 6)).toBeNull();
  });
});

describe("setsPerMuscle and volume", () => {
  it("counts primary muscles as 1 and secondary as 0.5", () => {
    const m = setsPerMuscle([{ exercise: "Bench press" }, { exercise: "Bench press" }, { exercise: "Barbell row" }]);
    expect(m.Chest).toBe(2);
    expect(m.Triceps).toBe(1);
    expect(m.Biceps).toBe(0.5);
  });

  it("counts an exercise it doesn't know under its own name", () => {
    expect(setsPerMuscle([{ exercise: "Sled push" }])["Sled push"]).toBe(1);
  });

  it("sums kg × reps", () => {
    expect(volume([{ kg: 80, reps: 6 }, { kg: 70, reps: 8 }])).toBe(1040);
  });
});

describe("workouts that end themselves", () => {
  const T = 1_800_000_000_000, M = 60_000;
  const w = (id: string, start: number, endedAt: number | null = null) => ({ id, startedAt: start, endedAt });
  it("ends an hour after the last set, dated to the last set + 2 min", () => {
    const sets = [{ workoutId: "a", at: T + 10 * M }, { workoutId: "a", at: T + 55 * M }];
    expect(tidyWorkouts([w("a", T)], sets, T + 110 * M)).toEqual({ end: [], drop: [] });
    expect(tidyWorkouts([w("a", T)], sets, T + 116 * M)).toEqual({ end: [{ id: "a", at: T + 57 * M }], drop: [] });
  });
  it("drops a workout that never got a set", () => {
    expect(tidyWorkouts([w("a", T)], [], T + 20 * M).drop).toEqual([]);
    expect(tidyWorkouts([w("a", T)], [], T + 31 * M).drop).toEqual(["a"]);
  });
  it("starting a new one closes the old one the same way", () => {
    const r = tidyWorkouts([w("a", T), w("b", T + 5 * M)], [{ workoutId: "a", at: T + 3 * M }], T + 6 * M);
    expect(r).toEqual({ end: [{ id: "a", at: T + 5 * M }], drop: [] });
    expect(tidyWorkouts([w("a", T)], [], T + M, true).drop).toEqual(["a"]);
  });
  it("leaves finished workouts alone", () => {
    expect(tidyWorkouts([w("a", T, T + 60 * M)], [], T + 500 * M)).toEqual({ end: [], drop: [] });
  });
});

describe("your own split", () => {
  const T = [{ name: "Push", exercises: [] }, { name: "Pull", exercises: [] }, { name: "Legs", exercises: [] }];
  const w = (template: string, startedAt: number, endedAt: number | null = startedAt + 1) => ({ template, startedAt, endedAt });
  it("the next day follows the last one you finished, wrapping round", () => {
    expect(nextTemplate(T, [])?.name).toBe("Push");
    expect(nextTemplate(T, [w("Push", 1), w("Pull", 2)])?.name).toBe("Legs");
    expect(nextTemplate(T, [w("Pull", 1), w("Legs", 2)])?.name).toBe("Push");
    expect(nextTemplate(T, [w("Legs", 1), w("Quick workout", 2)])?.name).toBe("Push"); // a quick one doesn't break the rotation
    expect(nextTemplate(T, [w("Push", 1), w("Pull", 2, null)])?.name).toBe("Pull"); // unfinished doesn't count
  });
  it("checks a day before saving", () => {
    const ex = { name: "Squat", sets: 3, reps: 5, restSec: 180 };
    expect(templateProblems({ name: "Legs", exercises: [ex] }, [])).toEqual([]);
    expect(templateProblems({ name: " ", exercises: [] }, [])).toEqual(["Give the day a name.", "Add at least one exercise."]);
    expect(templateProblems({ name: "push", exercises: [ex] }, [{ name: "Push" }])).toEqual(["There's already a day called push."]);
    expect(templateProblems({ name: "X", exercises: [{ ...ex, sets: 0, reps: 99 }] }, [])).toEqual(["Squat: sets must be 1–10.", "Squat: reps must be 1–50."]);
  });
  it("a session uses its own copy of the plan", () => {
    const tpl = [{ name: "Push", exercises: [{ name: "Bench press", sets: 3, reps: 6, restSec: 150 }] }];
    expect(sessionPlan({ template: "Push" }, tpl)).toEqual(tpl[0].exercises);
    expect(sessionPlan({ template: "Push", plan: [] }, tpl)).toEqual([]);
  });
  it("exercise history: newest first, best estimated 1RM per session", () => {
    const s = (w: string, at: number, kg: number, reps: number) => ({ at, workoutId: w, exercise: "Squat", kg, reps });
    const h = exerciseHistory([s("a", 1, 100, 5), s("a", 2, 90, 8), s("b", 10, 105, 5), { ...s("b", 11, 50, 10), exercise: "Row" }], "Squat");
    expect(h.map((x) => x.workoutId)).toEqual(["b", "a"]);
    expect(h[1].sets).toEqual([{ kg: 100, reps: 5 }, { kg: 90, reps: 8 }]);
    expect(h[0].best).toBeCloseTo(122.5, 5);
  });
});

describe("same muscle, different exercise", () => {
  it("names the main muscle, the first on a tie", () => {
    expect(mainMuscle("Romanian deadlift")).toBe("Hamstrings");
    expect(mainMuscle("Dips")).toBe("Chest");
    expect(mainMuscle("Made-up lift")).toBeNull();
  });
  it("offers other exercises for that muscle, compounds first, not what's already planned today", () => {
    expect(sameMuscle("Squat")).toEqual(["Front squat", "Leg press", "Hack squat", "Bulgarian split squat", "Lunges", "Leg extension"]);
    expect(sameMuscle("Leg curl", ["Romanian deadlift"])).toEqual(["Seated leg curl"]);
    expect(sameMuscle("Pec deck", [], 3)).toEqual(["Bench press", "Incline DB press", "Dips"]);
    expect(sameMuscle("Squat")).not.toContain("Squat");
    expect(sameMuscle("Made-up lift")).toEqual([]);
  });
});

describe("a split day at a glance", () => {
  it("counts exercises and sets, estimates the lifting time, reads the cardio minutes, lists main muscles once", () => {
    const d = { exercises: [{ name: "Squat", sets: 3, restSec: 150 }, { name: "DB bench press", sets: 3, restSec: 120 }, { name: "Leg extension", sets: 3, restSec: 60 }], cardio: "20 min stairmaster" };
    // 9 sets × 40 s + 3×150 + 3×120 + 3×60 s = 360 + 990 = 1350 s ≈ 22.5 min → 25
    expect(dayStats(d)).toEqual({ exercises: 3, sets: 9, liftMin: 25, cardioMin: 20, muscles: ["Quads", "Chest"] });
    expect(dayStats({ exercises: [] })).toMatchObject({ exercises: 0, sets: 0, liftMin: 5, cardioMin: null, muscles: [] });
    expect(dayStats({ exercises: [], cardio: "stairmaster, easy" }).cardioMin).toBeNull();
  });
});

describe("dumbbells (PLAN 76)", () => {
  it("logged per dumbbell; kg lifted counts both hands", () => {
    expect(["DB bench press", "Incline DB curl", "Dumbbell lateral raise"].every(isDumbbell)).toBe(true);
    expect(["Bench press", "Deadlift", "Lat pulldown"].some(isDumbbell)).toBe(false);
    expect(volume([{ exercise: "DB bench press", kg: 20, reps: 10 }, { exercise: "Bench press", kg: 60, reps: 5 }])).toBe(20 * 10 * 2 + 300);
    expect(volume([{ kg: 20, reps: 10 }])).toBe(200);
  });
});

describe("warm-ups (PLAN 80)", () => {
  const set = (workoutId: string, at: number, kg: number, reps: number, warmup = false) => ({ workoutId, at, exercise: "Bench press", kg, reps, ...(warmup ? { warmup } : {}) });
  it("shown but never counted: not in kg lifted, strength, bests, or sets per muscle", () => {
    const ss = [set("a", 1, 40, 10, true), set("a", 2, 80, 5), set("a", 3, 80, 5)];
    expect(volume(ss)).toBe(800);
    expect(working(ss)).toHaveLength(2);
    expect(e1rmHistory([set("a", 1, 100, 1, true), set("a", 2, 80, 5)], "Bench press")[0].kg).toBe(80); // a heavy single as a warm-up isn't a best
    expect(isBest([set("a", 1, 80, 5)], set("b", 9, 100, 3, true))).toBe(false);
    expect(setsPerMuscle([{ exercise: "Bench press", warmup: true }, { exercise: "Bench press" }]).Chest).toBe(1);
  });
  it("learned per exercise: on when at least half of the last 3 sessions had one; never done → off", () => {
    expect(warmsUp([], "Bench press", "now")).toBe(false);
    expect(warmsUp([set("a", 1, 40, 10, true), set("a", 2, 80, 5)], "Bench press", "now")).toBe(true);
    const three = [set("a", 1, 40, 10, true), set("a", 2, 80, 5), set("b", 10, 80, 5), set("c", 20, 80, 5)];
    expect(warmsUp(three, "Bench press", "now")).toBe(false); // 1 of the last 3: "sometimes just 3"
    expect(warmsUp([...three, set("d", 30, 40, 10, true)], "Bench press", "now")).toBe(false); // last 3: b, c, d — 1 of 3
    expect(warmsUp([...three, set("d", 30, 40, 10, true), set("e", 40, 40, 10, true)], "Bench press", "now")).toBe(true); // c, d, e — 2 of 3
    expect(warmsUp([set("now", 1, 40, 10, true)], "Bench press", "now")).toBe(false); // today's doesn't count
  });
  it("its weight: about half, rounded to the plates", () => {
    expect(warmKg(80, "Bench press")).toBe(40);
    expect(warmKg(62.5, "Bench press")).toBe(32.5);
    expect(warmKg(22, "Incline DB press")).toBe(11);
    expect(warmKg(2.5, "Bench press")).toBe(2.5);
  });
});
