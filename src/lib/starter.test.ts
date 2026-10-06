import { describe, expect, it } from "vitest";
import { getState, upgradeStarter } from "./store";

// The pre-6 Oct starter split, as stored by accounts that never changed it.
const STARTER = [
  { id: "upper-a", name: "Upper A", exercises: [{ name: "Bench press", sets: 3, reps: 6, restSec: 150 }, { name: "Barbell row", sets: 3, reps: 8, restSec: 120 }, { name: "Overhead press", sets: 3, reps: 6, restSec: 150 }, { name: "Lat pulldown", sets: 3, reps: 10, restSec: 90 }] },
  { id: "lower-a", name: "Lower A", exercises: [{ name: "Squat", sets: 3, reps: 5, restSec: 180 }, { name: "Romanian deadlift", sets: 3, reps: 8, restSec: 150 }, { name: "Leg press", sets: 3, reps: 10, restSec: 120 }, { name: "Calf raise", sets: 3, reps: 12, restSec: 60 }] },
  { id: "upper-b", name: "Upper B", exercises: [{ name: "Overhead press", sets: 3, reps: 6, restSec: 150 }, { name: "Pull-ups", sets: 3, reps: 8, restSec: 120 }, { name: "Incline DB press", sets: 3, reps: 10, restSec: 120 }, { name: "Bicep curl", sets: 3, reps: 12, restSec: 60 }] },
  { id: "lower-b", name: "Lower B", exercises: [{ name: "Deadlift", sets: 3, reps: 5, restSec: 180 }, { name: "Front squat", sets: 3, reps: 6, restSec: 150 }, { name: "Leg curl", sets: 3, reps: 12, restSec: 90 }] },
];
const PLAN = ["Push + Quads", "Pull + Hamstrings", "Mixed"];

describe("the starter split becomes the owner's plan (6 Oct)", () => {
  it("an untouched starter split is replaced, with the cardio after each day", () => {
    const t = upgradeStarter(STARTER);
    expect(t.map((d) => d.name)).toEqual(PLAN);
    expect(t[0].cardio).toBe("20 min stairmaster");
  });
  it("a split someone changed — one rep, one day renamed, a day removed — is theirs and stays", () => {
    const reps = structuredClone(STARTER); reps[1].exercises[0].reps = 6;
    const renamed = structuredClone(STARTER); renamed[0].name = "Upper 1";
    for (const t of [reps, renamed, STARTER.slice(0, 3), []]) expect(upgradeStarter(t)).toBe(t);
  });
  it("the plan itself stays as it is, and a new account starts on it", () => {
    const t = upgradeStarter(STARTER);
    expect(upgradeStarter(t)).toBe(t);
    expect(getState().templates.map((d) => d.name)).toEqual(PLAN);
  });
});
