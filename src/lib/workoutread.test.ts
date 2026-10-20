import { describe, expect, it } from "vitest";
import { workoutLines } from "./workoutread";
import type { LoggedSet } from "./training";

// PLAN 129 — owner, 20 Oct: "ai look at the workout at eod and make a summary, suggestions, compare how i am improving".
const at = (d: string, hm: string) => new Date(`2026-10-${d}T${hm}:00`).getTime();
const S = (wid: string, d: string, hm: string, exercise: string, kg: number, reps: number, warmup = false): LoggedSet => ({ at: at(d, hm), workoutId: wid, exercise, kg, reps, ...(warmup ? { warmup } : {}) });
const workouts = [
  { id: "a", template: "Push", startedAt: at("13", "18:00"), endedAt: at("13", "19:00") },
  { id: "b", template: "Pull", startedAt: at("15", "18:00"), endedAt: at("15", "19:00") },
  { id: "c", template: "Push", startedAt: at("20", "18:00"), endedAt: at("20", "19:05") },
];
const sets: LoggedSet[] = [
  S("a", "13", "18:05", "Bench press", 60, 8), S("a", "13", "18:10", "Bench press", 60, 8), S("a", "13", "18:30", "Overhead press", 40, 8),
  S("b", "15", "18:05", "Barbell row", 60, 10),
  S("c", "20", "18:02", "Bench press", 30, 10, true), // a warm-up: never counted
  S("c", "20", "18:05", "Bench press", 62.5, 8), S("c", "20", "18:10", "Bench press", 62.5, 7), S("c", "20", "18:30", "Overhead press", 40, 6),
  S("c", "20", "18:50", "Lateral raise", 10, 15),
];

describe("the day's workout, for the read-back", () => {
  const lines = workoutLines(workouts, sets, [at("20", "04:00"), at("21", "04:00")]);
  it("the session against the last of the same day: 3 working sets → 4, kg lifted, %", () => {
    // today 62.5·8 + 62.5·7 + 40·6 + 10·15 = 500 + 437.5 + 240 + 150 = 1,327.5; last Push 60·8·2 + 40·8 = 1,280 → +3.7 %
    expect(lines[0]).toBe("Push 18:00–19:05 (65 min): 4 working sets, 1,328 kg (last Push, Tue 13 Oct: 1,280 kg, +3.7 %)");
  });
  it("each lift: today's sets, best as a 1-rep max, against the last time — up, down, first time, new best", () => {
    // bench 62.5 × 8 → 62.5·(1 + 8/30) = 79.2; last 60 × 8 → 76 → +4.2 %, a new best
    expect(lines[1]).toBe("- Bench press: 62.5 × 8, 62.5 × 7 — best 62.5 × 8 ≈ 79 kg 1-rep max; last time Tue 13 Oct 60 × 8 ≈ 76 kg, +4.2 % — new best");
    // OHP 40 × 6 → 48; last 40 × 8 → 50.7 → −5.3 %
    expect(lines[2]).toBe("- Overhead press: 40 × 6 — best 40 × 6 ≈ 48 kg 1-rep max; last time Tue 13 Oct 40 × 8 ≈ 51 kg, −5.3 %");
    expect(lines[3]).toBe("- Lateral raise: 10 × 15 — best 10 × 15 ≈ 15 kg 1-rep max; first time");
  });
  it("a day without a workout: nothing (the read-back stays as it was)", () => {
    expect(workoutLines(workouts, sets, [at("18", "04:00"), at("19", "04:00")])).toEqual([]);
  });
  it("the first session of its kind says so; one set is one set", () => {
    expect(workoutLines(workouts, sets, [at("15", "04:00"), at("16", "04:00")])[0]).toBe("Pull 18:00–19:00 (60 min): 1 working set, 600 kg (your first Pull)");
  });
});
