// PLAN 177 — the body lab's numbers reach the AI, only what's clear or likely (owner, 15 Oct: "make sure app sees all data").
import { describe, expect, it } from "vitest";
import { labLines, labNow, type Lab } from "./lab";
import { buildContext } from "./context";
import type { Slope } from "../sessionfacts";
import { addDays, atMinute } from "../time";

const now = atMinute("2026-10-27", 10 * 60);
const fit = (slope: number, sure: Slope["sure"]): Slope => ({ pts: [], slope, p: sure === "clear" ? 0.001 : sure === "likely" ? 0.01 : 0.3, sure });
const none: Lab = { recovery: null, drink: null, smoke: null, caf: null, heat: null, clock: null, coins: [], fit: null };

describe("the body lab, as the AI is told (PLAN 177)", () => {
  it("found: each drink, smoking days, late caffeine, the wound-up hour, the body clock, a coin-flip — with the numbers the app shows", () => {
    const lab: Lab = {
      ...none,
      drink: { hr: { bins: [], base: 54, fit: fit(2.34, "clear") }, hrv: { bins: [], base: 50, fit: fit(-4.8, "likely") }, nights: [53, 1, 3, 3, 3], smoked: 0 },
      smoke: { rows: [{ id: "rhr", name: "Resting heart rate next morning", unit: "bpm", smoked: 58.2, not: 54.1, fit: fit(4, "clear") }, { id: "hrv", name: "HRV that night", unit: "ms", smoked: 50, not: 51, fit: fit(-1, "not clear") }], smoked: 14, not: 36, drinkNights: 8 },
      caf: { fit: { ...fit(-0.09, "clear"), pts: Array.from({ length: 63 }, () => [0, 0] as [number, number]) }, per100: -9.2, late: 33 },
      heat: { cells: [], days: 28, minutes: 240, top: { wd: 1, h: 15, hot: 4, weeks: 4, perHour: 58.6, name: "Tuesday" } },
      clock: { sleep: { onset: 1480, wake: 1940, mid: 1710, nights: 30 }, low: 1682, shift: 60, focus: { from: 10, to: 12, mean: 7.9, rest: 6, n: 30, p: 0.001, sure: "clear" }, slump: { from: 15, to: 16, mean: 3.6, rest: 6.5, n: 20, p: 0.001, sure: "clear" } },
    };
    const ls = labLines(lab, now);
    expect(ls).toEqual([
      "Each drink that evening went with heart rate asleep +2.3 bpm (clear), HRV −4.8 ms (likely) that night — nights in each column 0/1/2/3/4+: 53/1/3/3/3.",
      "Smoking days (drinking nights left out) vs days with none: resting heart rate next morning 58 vs 54 bpm (clear; 14 vs 36 days).",
      "Every 100 mg of caffeine after 14:00 went with 9 min less deep sleep (clear; 63 nights).",
      "Most wound-up hour (heart 10+ above usual while still): Tuesday 15:00–16:00, 4 of the last 4 Tuesdays (~59 min an hour).",
      "Body clock, last 30 days: asleep ~00:40 to ~08:20 (midpoint 04:30); night low 04:02; weekends +60 min later; focus best 10:00–12:00 (7.9 vs 6.0, clear); energy dips 15:00–16:00 (3.6 vs 6.5, clear).",
    ]);
  });
  it("control: could still be chance, too few, no hour standing out — the AI is told nothing", () => {
    const lab: Lab = {
      ...none,
      drink: { hr: { bins: [], base: 54, fit: fit(0.4, "not clear") }, hrv: null, nights: [80, 4, 3, 2, 1], smoked: 0 },
      smoke: { rows: [{ id: "rhr", name: "Resting heart rate next morning", unit: "bpm", smoked: 55, not: 54, fit: fit(1, "not clear") }], smoked: 6, not: 30, drinkNights: 2 },
      caf: { fit: fit(-0.01, "not clear"), per100: -1, late: 10 },
      heat: { cells: [], days: 28, minutes: 30, top: null },
      clock: { sleep: null, low: null, shift: null, focus: { from: 9, to: 11, mean: 6.4, rest: 6.1, n: 12, p: 0.4, sure: "not clear" }, slump: null },
    };
    expect(labLines(lab, now)).toEqual([]);
  });
  it("the morning after a night out: the hit, when back, what got you back faster, the lifts", () => {
    const night = { bed: atMinute("2026-10-27", 2 * 60) } as never;
    const lab: Lab = { ...none, recovery: { night, drinks: 4, cigs: null, hit: { meanHr: 10, hrv: 32, hrvUsual: 50, deep: 45, deepUsual: 45 }, typicalH: 29.5, past: 8, backAt: atMinute("2026-10-28", 7 * 60 + 30), done: 0.27, shrugged: false,
      factors: [{ id: "walk", name: "A walk before noon", gainH: 24, with: 4, without: 4 }], lifts: { pct: -8, n: 8 }, out: [] } };
    expect(labLines(lab, now)).toEqual(["Last night was a night out (4 drinks, bed 02:00): HRV 32 ms vs usual 50, heart rate asleep +10 bpm vs usual. Back to usual likely by tomorrow ~07:30 (typical from 8 past nights out). After past nights out, \"A walk before noon\" went with being back ~24 h sooner (4 with, 4 without). Lifts the day after nights out ran −8 % vs other sessions (8 sessions)."]);
  });
  it("lands in what the AI is told — the morning read and the chat alike — under its own heading; none, no heading", () => {
    const state = { entries: [], workouts: [], supplements: [], settings: { halfLifeMin: 300, bedMinute: 1380, coffeeMg: 95, bodyKg: 78, usualDrink: null }, profile: { conditions: [], meds: [], allergies: [], notes: "" }, goals: { kcal: 2400, p: 150 }, ai: { memory: [], experiments: [] } } as never;
    const lab = ["Every 100 mg of caffeine after 14:00 went with 9 min less deep sleep (clear; 63 nights)."];
    for (const slim of [false, true]) {
      const c = buildContext({ state, now, days: [], findings: [], patterns: [], lab, slim });
      expect(c).toContain("## Body lab — the app's own tested numbers, only what's clear or likely (goes with, not causes)\n- Every 100 mg");
    }
    expect(buildContext({ state, now, days: [], findings: [], patterns: [], lab: [] })).not.toContain("## Body lab");
  });
  it("fitness age reaches the AI only once you've said whose norms — never a guess at men's or women's", () => {
    const vo2: Record<string, { v: number }> = {};
    for (let k = 0; k < 60; k++) vo2[addDays("2026-10-27", -k)] = { v: 46 };
    const band = { hr: [], sleep: [], rhr: {}, hrv: {}, steps: [], vo2 } as never;
    const state = (sex?: "male") => ({ entries: [], workouts: [], supplements: [], settings: { halfLifeMin: 300, bedMinute: 1380, coffeeMg: 95, bodyKg: 78, usualDrink: null, age: 28, sex }, ai: { memory: [], experiments: [] } }) as never;
    expect(labNow(state(), band, now).some((l) => l.startsWith("Fitness age"))).toBe(false);
    expect(labNow(state("male"), band, now)).toContain("Fitness age 46 (age 28) — the age at which the average healthy man in Norway's HUNT study has this VO2 max (46.0 this week, the band's estimate: trust the trend more than the number). Steady over 8 weeks (VO2 max 46.0 → 46.0).");
  });
});
