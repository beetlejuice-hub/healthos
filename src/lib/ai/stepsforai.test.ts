// PLAN 229 — steps and strain for the AI. Known answers: resting heart 54 stepping to 59 on 25 Oct, drinks up around it —
// one line naming the step, its levels, "the worse way" and the drinks; a flat HRV — no line; load lines from rated workouts.
import { describe, expect, it } from "vitest";
import { stepLines, strainLines } from "./stepsforai";
import type { DayFacts } from "../insights";
import { addDays } from "../time";
import type { Workout } from "../types";

const TODAY = "2026-11-24";
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
describe("steps and strain for the AI", () => {
  it("a step in resting heart with drinks up around it: one line; flat HRV: none", () => {
    const r = rng(2), rhr: Record<string, number> = {}, hrv: Record<string, number> = {}, days: DayFacts[] = [];
    for (let i = 90; i >= 1; i--) { const d = addDays(TODAY, -i), after = d >= "2026-10-25";
      rhr[d] = 54 + (r() - 0.5) * 2 + (after ? 5 : 0); hrv[d] = 60 + (r() - 0.5) * 6;
      days.push({ day: d, logged: true, alcoholG: after ? 28 : 0, lateCaffeineMg: 0, caffeineMg: 150, trained: false, volumeKg: 0, kcal: 2200, proteinG: 140, taken: new Set(), skipped: new Set() } as unknown as DayFacts); }
    const ls = stepLines([{ key: "rhr", name: "Resting heart", unit: "bpm", better: -1, series: rhr }, { key: "hrv", name: "HRV", unit: "ms", better: 1, series: hrv }], days, [], TODAY);
    expect(ls).toHaveLength(1);
    expect(ls[0]).toMatch(/^Resting heart stepped up [456](\.\d)? bpm \(the worse way\) on 2[3-7] Oct — about 5\d(\.\d)? the week before, 5\d(\.\d)? the week after/);
    expect(ls[0]).toMatch(/Around it .*drinks 0 a week → 14 a week/);
  });
  it("load from rated workouts", () => {
    const now = Date.parse(`${TODAY}T20:00:00`), w = (d: number, rpe: number): Workout => ({ id: String(d), template: "x", startedAt: now - d * 864e5, endedAt: now - d * 864e5 + 3_600_000, rpe } as Workout);
    expect(strainLines(null, [w(1, 7), w(9, 5), w(16, 5), w(23, 5)], TODAY, now)).toEqual(["Training load this week 420 (how hard 1–10 × minutes), usual week 225"]);
  });
});
