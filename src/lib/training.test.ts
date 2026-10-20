import { describe, expect, it } from "vitest";
import { dayStats, kgStep, stepKg, exerciseHistory, mainMuscle, nextTemplate, sameMuscle, sessionPlan, templateProblems, tidyWorkouts, e1rm, e1rmHistory, setsPerMuscle, suggestNext, volume, isDumbbell, warmsUp, warmKg, working, isBest, MUSCLES } from "./training";

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
    expect(sameMuscle("Leg curl", ["Romanian deadlift"])).toEqual(["Seated leg curl", "Lying leg curl", "Nordic curl", "Good morning", "Stiff-leg deadlift", "Single-leg RDL"]);
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
  it("on by default for every exercise, history or not (owner, 20 Oct: \"By default the warmup set should be first..\")", () => {
    expect(warmsUp([], "Bench press", "now")).toBe(true);
    expect(warmsUp([set("b", 10, 80, 5), set("c", 20, 80, 5), set("d", 30, 80, 5)], "Bench press", "now")).toBe(true);
  });
  it("its weight: about half, rounded to the plates", () => {
    expect(warmKg(80, "Bench press")).toBe(40);
    expect(warmKg(62.5, "Bench press")).toBe(32.5);
    expect(warmKg(22, "Incline DB press")).toBe(12); // on the 2 kg dumbbell grid (11 isn't a dumbbell)
    expect(warmKg(2.5, "Bench press")).toBe(2.5);
  });
});

describe("the figure's muscles (PLAN 94, phase 2)", () => {
  it("which delts, which part of the back, abs or obliques", async () => {
    const { fineOf } = await import("./training");
    expect(fineOf("Lateral raise")).toEqual({ "Side delts": 1 });
    expect(fineOf("Face pull")).toEqual({ "Rear delts": 1, "Upper back": 0.5 });
    expect(fineOf("Overhead press")).toEqual({ "Front delts": 1, "Side delts": 0.5, Triceps: 0.5 });
    expect(fineOf("Bench press")).toEqual({ Chest: 1, Triceps: 0.5, "Front delts": 0.5 });
    expect(fineOf("Lat pulldown")).toEqual({ Lats: 1, Biceps: 0.5 });
    expect(fineOf("Barbell row")).toEqual({ "Upper back": 1, Lats: 0.5, Biceps: 0.5 });
    expect(fineOf("Deadlift")).toEqual({ Glutes: 1, Hamstrings: 0.5, "Lower back": 0.5 });
    expect(fineOf("Russian twist")).toEqual({ Obliques: 1 });
    expect(fineOf("Plank")).toEqual({ Abs: 1 });
    expect(fineOf("My own lift")).toEqual({});
  });
  it("every library exercise lands on the figure, and every figure muscle has an exercise", async () => {
    const { fineOf, FINE } = await import("./training");
    const hit = new Set<string>();
    for (const n of Object.keys(MUSCLES)) { const f = fineOf(n); expect(Object.keys(f).length).toBeGreaterThan(0); for (const m of Object.keys(f)) { expect(FINE).toContain(m); hit.add(m); } }
    expect([...hit].sort()).toEqual([...FINE].sort());
  });
  it("a week: side delts counted apart from the front — 9 sets of OHP + 3 of lateral raises", async () => {
    const { fineWeek } = await import("./training");
    const now = Date.UTC(2026, 9, 14, 18), sets = [...Array(9)].map((_, i) => ({ at: now - (i + 1) * 3600_000, exercise: "Overhead press" })).concat([...Array(3)].map((_, i) => ({ at: now - (i + 1) * 60_000, exercise: "Lateral raise" })));
    const w = fineWeek(sets, now);
    expect([w["Front delts"], w["Side delts"], w["Rear delts"], w.Triceps]).toEqual([9, 7.5, 0, 4.5]);
  });
});

describe("weight steps (owner, 20 Oct: \"its always like 36.5 instead of 36\")", () => {
  it("the step from the weights you use: 2 for 32/34/36 dumbbells, 2.5 for plates, nothing logged by kind", () => {
    expect(kgStep("Incline DB press", [32, 34, 36])).toBe(2);
    expect(kgStep("Bench press", [60, 62.5, 65])).toBe(2.5);
    expect(kgStep("Lateral raise", [], true)).toBe(2);
    expect(kgStep("Bench press", [])).toBe(2.5);
    expect(kgStep("Cable curl", [20, 22.5, 23.75])).toBe(1.25);
  });
  it("+ and − land on the grid: 36 → 38, an off-grid 36.5 → 38 up and 36 down; never below 0", () => {
    expect([stepKg(36, 2, 1), stepKg(36.5, 2, 1), stepKg(36.5, 2, -1), stepKg(36, 2, -1), stepKg(1, 2, -1)]).toEqual([38, 38, 36, 34, 0]);
    expect([stepKg(60, 2.5, 1), stepKg(61, 2.5, 1), stepKg(61, 2.5, -1)]).toEqual([62.5, 62.5, 60]);
  });
  it("the next weight suggested is the next on the grid — 34 → 36 on 2 kg dumbbells, not 36.5", () => {
    expect(suggestNext([{ kg: 34, reps: 10 }, { kg: 34, reps: 10 }], 10, 2)!.kg).toBe(36);
    expect(suggestNext([{ kg: 35, reps: 10 }, { kg: 35, reps: 10 }], 10, 2)!.kg).toBe(36); // an off-grid last weight snaps
    expect(suggestNext([{ kg: 80, reps: 6 }, { kg: 80, reps: 6 }], 6)!.kg).toBe(82.5);
  });
});
