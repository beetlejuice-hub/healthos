import { describe, expect, it } from "vitest";
import { readyLine, shortName, targetsFor, weekStrip } from "./workouthome";
import type { Template, Workout } from "./types";
import type { LoggedSet } from "./training";

// The Workout home renovated (owner, 13 Nov: "A A A … start building them").
const at = (d: string, hm: string) => new Date(`2026-11-${d}T${hm}:00`).getTime();
const NOW = at("13", "18:00"); // a Friday
const lift = (id: string, t: string, s: number): Workout => ({ id, template: t, startedAt: s, endedAt: s + 3600e3 });
const cardio = (id: string, what: string, s: number): Workout => ({ id, template: "Cardio", kind: "cardio", startedAt: s, endedAt: s + 1500e3, cardio: { what, startedAt: s } });

describe("the week as seven days", () => {
  it("Monday to Sunday, what was done each day, today marked", () => {
    const ws = [lift("a", "Push + Quads", at("09", "17:00")), cardio("b", "20 min stairmaster", at("10", "07:00")), lift("c", "Pull", at("12", "18:00")), cardio("d", "Incline walk", at("12", "19:10")), lift("old", "Mixed", at("08", "11:00"))];
    const w = weekStrip(ws, NOW);
    expect(w.map((d) => d.dow)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(w.map((d) => d.labels)).toEqual([["Push"], ["Stair"], [], ["Pull", "Incline"], [], [], []]);
    expect(w.map((d) => d.today)).toEqual([false, false, false, false, true, false, false]);
    expect(w[3].past).toBe(true); expect(w[4].past).toBe(false);
  });
  it("short names", () => {
    expect(shortName(lift("x", "Upper A", 0))).toBe("Upper");
    expect(shortName(cardio("y", "Bike", 0))).toBe("Bike");
  });
});

describe("each lift's target, and what changed", () => {
  const t: Template = { id: "t", name: "Push + Quads", exercises: [{ name: "Squat", sets: 3, reps: 6, restSec: 150 }, { name: "Leg extension", sets: 3, reps: 12, repsMax: 15, restSec: 60 }, { name: "Dips", sets: 3, reps: 8, restSec: 90 }] };
  const set = (w: string, ex: string, kg: number, reps: number, d: string): LoggedSet => ({ at: at(d, "17:00"), workoutId: w, exercise: ex, kg, reps });
  const sets = [
    ...[6, 6, 6].map((r) => set("w1", "Squat", 102.5, r, "06")), // all 6s at 102.5 → up a step
    ...[13, 12, 12].map((r) => set("w1", "Leg extension", 50, r, "06")), // a range: add a rep first
  ];
  it("more weight when every set made it; a rep in a range; nothing for one never done", () => {
    const [sq, le, dips] = targetsFor(t, sets);
    expect(sq).toMatchObject({ plan: "3 × 6", kg: 105, reps: 6, change: "+2.5 kg" });
    // 13/12/12 inside 12–15: the same weight, 13 a set — the top set already had 13, so no "+" to show
    expect(le).toMatchObject({ plan: "3 × 12–15", kg: 50, reps: 13, change: null });
    expect(dips).toMatchObject({ kg: null, change: null });
  });
});

describe("the readiness line", () => {
  it("from push to easier; nothing without readiness", () => {
    expect(readyLine({ score: 88, word: "ready" })).toBe("Readiness 88: a good day to push the first lift.");
    expect(readyLine({ score: 72, word: "good" })).toBe("Readiness 72: go as planned.");
    expect(readyLine({ score: 50, word: "take it easier" })).toMatch(/^Readiness 50: take it easier/);
    expect(readyLine(null)).toBeNull();
  });
});
