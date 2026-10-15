import { describe, expect, it } from "vitest";
import { gridLines, todayLines, trainingLines } from "./sections";
import type { Readiness } from "../readiness";
import type { LiftTrend, Session } from "../liftstrength";
import type { Notice } from "../inbox";

describe("what the AI is told, organized (owner, 15 Oct: \"make sure app sees all data, organized\")", () => {
  it("this morning: readiness, what held it, every part with its points and zone, what isn't known", () => {
    const r: Readiness = { score: 20, word: "take it easier", day: "2026-10-15", added: 47, sleep: 80, cap: { to: 20, why: "HRV and resting heart rate both well off your usual" },
      parts: [{ id: "hrv", name: "HRV this morning", got: 0, max: 20, why: "33 ms · usual 47", zone: "poor" }, { id: "sleep", name: "Last night", got: 20, max: 25, why: "sleep score 80", zone: "ideal" }],
      left: [{ id: "load", name: "Training", max: 10 }] };
    expect(todayLines(r)).toEqual([
      "Readiness 20/100 (take it easier) — held at 20: HRV and resting heart rate both well off your usual (the parts add to 47).",
      "HRV this morning: 0/20 (poor) — 33 ms · usual 47", "Last night: 20/25 (ideal) — sleep score 80", "Not known yet: Training."]);
    expect(todayLines(null)).toEqual([]);
  });
  it("training: the week against the usual, each main lift's best set and trend, the last sessions", () => {
    const at = Date.parse("2026-10-13T18:00:00");
    const ss = [{ id: "w1", template: "Push day", startedAt: at, endedAt: at + 3600_000, sets: [], volume: 6240.4, workingSets: 18, pct: 2.34, lifts: [] }] as unknown as Session[];
    const lifts = [{ exercise: "Bench press", pts: [{ at, workoutId: "w1", e1rm: 101.3, kg: 85, reps: 6 }], gain: 4.21, days: 41.6 }] as unknown as LiftTrend[];
    expect(trainingLines(ss, lifts, { from: at, sessions: 2, workingSets: 30, pct: 1.26, usualSessions: 3, usualSets: 44.4 })).toEqual([
      "This week: 2 sessions (usual 3), 30 working sets (usual 44), strength +1.3 % against your trend.",
      "Bench press: best set 85 kg × 6 (≈ 101 kg 1-rep max), +4.2 kg over 42 days",
      "Last sessions:", "2026-10-13 Push day: 18 working sets, 6,240 kg, +2.3 % vs trend"]);
    expect(trainingLines([], [], { from: 0, sessions: 0, workingSets: 0, pct: null, usualSessions: null, usualSets: null })).toEqual([]);
  });
  it("the grids' findings, with what you said; the question to you left off; asks and low mornings aren't findings", () => {
    const f = (id: string, text: string, reply?: string): Notice => ({ id, kind: "finding", at: 0, title: "New finding · sleep", text, reply: reply ? { text: reply, at: 1 } : null });
    expect(gridLines([
      f("a", "Drinks that evening → HRV −9.0 ms, on 12 nights with it against 18 without. Goes with, not proof of why — anything else going on those nights?", "those were nights out"),
      f("b", "Drinks the evening before → mood that day −2.0 points, on 8 days with it against 20 without. Goes with, not proof of why — anything else going on those days?"),
      { id: "c", kind: "raised", at: 0, title: "", text: "x" },
    ])).toEqual([
      "Drinks that evening → HRV −9.0 ms, on 12 nights with it against 18 without. — I said: \"those were nights out\"",
      "Drinks the evening before → mood that day −2.0 points, on 8 days with it against 20 without."]);
  });
});
