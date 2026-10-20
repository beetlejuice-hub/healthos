import { describe, expect, it } from "vitest";
import { overallStrength, overallWords } from "./strength";
import type { LoggedSet } from "./training";

// Owner, 20 Oct: "a graph of my overall strength computed from kgs lifted and reps how its evolving? Make it smart"
const DAY = 864e5, NOW = new Date("2026-10-20T20:00:00").getTime();
/** Seeded noise in [−1, 1]. */
const noise = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
/** Two sessions a week for `weeks` weeks ending today; each lift's e1RM grows `perWeek` % a week, ±`jitter` % per session. */
function plant({ weeks = 12, perWeek = 1, jitter = 2, seed = 11, lifts = [["Bench press", 80], ["Squat", 100], ["Lateral raise", 16]] as [string, number][], from = 0 } = {}): LoggedSet[] {
  const r = noise(seed), out: LoggedSet[] = [];
  for (let d = weeks * 7 - 1; d >= 0; d -= 3.5) {
    const wk = (weeks * 7 - 1 - d) / 7;
    if (wk < from) continue;
    for (const [ex, kg] of lifts) out.push({ at: NOW - d * DAY, workoutId: `w${d}`, exercise: ex, kg: kg * (1 + perWeek / 100) ** wk * (1 + (r() * jitter) / 100), reps: 8 });
  }
  return out;
}

describe("overall strength, one line", () => {
  it("finds a planted +1 % a week through ±2 % session noise — stronger, about +1 %, the line up about 11 %", () => {
    const o = overallStrength(plant(), NOW);
    expect(o.state).toBe("stronger");
    expect(o.perWeek!).toBeGreaterThan(0.6); expect(o.perWeek!).toBeLessThan(1.4);
    expect(o.change!).toBeGreaterThan(7); expect(o.change!).toBeLessThan(16); // 1.01^11 − 1 ≈ 11.6 %
    expect(o.weeks.length).toBeGreaterThanOrEqual(12);
    expect(overallWords(o)).toMatch(/^Getting stronger: about \+[01]\.\d % a week across 3 lifts/);
  });
  it("doesn't find progress that isn't there: flat lifts with the same noise aren't \"stronger\"", () => {
    for (const seed of [3, 7, 19, 23]) {
      const o = overallStrength(plant({ perWeek: 0, seed }), NOW);
      expect(o.state, `seed ${seed}`).not.toBe("stronger");
      expect(o.state, `seed ${seed}`).not.toBe("dropping");
      expect(Math.abs(o.change!), `seed ${seed}`).toBeLessThan(6);
    }
  });
  it("a planted −1 % a week reads as getting weaker", () => {
    expect(overallStrength(plant({ perWeek: -1 }), NOW).state).toBe("dropping");
  });
  it("a heavy lift added halfway doesn't make the line jump — each lift is measured against itself", () => {
    const flat = plant({ perWeek: 0, jitter: 0 });
    const deadlift = plant({ perWeek: 0, jitter: 0, lifts: [["Deadlift", 180]], from: 6 });
    const o = overallStrength([...flat, ...deadlift], NOW);
    expect(Math.max(...o.weeks.map((w) => Math.abs(w.index - 100)))).toBeLessThan(0.01);
  });
  it("a typo (315 for 31.5) is capped at 20 % up and comes back down — not a tenfold spike", () => {
    const sets = plant({ perWeek: 0, jitter: 0, lifts: [["Lateral raise", 31.5], ["Bench press", 80]] });
    const i = sets.findIndex((s) => s.exercise === "Lateral raise" && s.at > NOW - 30 * DAY);
    const typo = sets.map((s, k) => (k === i ? { ...s, kg: 315 } : s));
    const o = overallStrength(typo, NOW);
    expect(Math.max(...o.weeks.map((w) => w.index))).toBeLessThanOrEqual(110.01); // half the lifts +20 % (capped) → +10 %
    expect(Math.abs(o.weeks[o.weeks.length - 1].index - 100)).toBeLessThan(0.5);
  });
  it("kg lifted a week counts every working set once (kg × reps); weeks without training aren't on the line", () => {
    const sets: LoggedSet[] = [
      { at: NOW - 15 * DAY, workoutId: "a", exercise: "Bench press", kg: 80, reps: 8 }, { at: NOW - 15 * DAY, workoutId: "a", exercise: "Bench press", kg: 40, reps: 10, warmup: true },
      { at: NOW - DAY, workoutId: "b", exercise: "Bench press", kg: 82.5, reps: 8 }, { at: NOW - DAY, workoutId: "b", exercise: "DB bench press", kg: 40, reps: 10 },
    ];
    const o = overallStrength(sets, NOW);
    expect(o.weeks.map((w) => Math.round(w.kg))).toEqual([640, 1060]); // 80×8; 82.5×8 + 40×10 — the warm-up left out
    expect(o.weeks[1].index).toBeCloseTo(100 * (82.5 / 80), 6); // only bench was done both weeks
  });
  it("nothing logged: says what it needs", () => {
    const o = overallStrength([], NOW);
    expect(o.weeks).toEqual([]); expect(o.change).toBeNull();
    expect(overallWords(o)).toBe("Needs 3 sessions of a lift in the last 8 weeks to say.");
  });
});
