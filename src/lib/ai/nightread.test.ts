import { describe, expect, it } from "vitest";
import { dayWindow, dayWord, eveningOf, nightDue } from "./nightread";
import { nightContext } from "./client";
import { checkNight } from "./tasks";
import { DEFAULT_SETTINGS, EMPTY_AI, type State } from "../store";
import { DEFAULT_GOALS } from "../types";

// Owner, 16 Oct: "do 2" — the night read-back around midnight, after the morning read took yesterday for today (#106).
const at = (d: string, hm: string) => new Date(`2026-10-${d}T${hm}:00`).getTime();
const logged15 = (day: string) => day === "2026-10-15";

describe("which day is read back, and when", () => {
  it("tonight from 21:00; past midnight it's still tonight, until 04:00", () => {
    expect(nightDue(at("15", "20:59"), undefined, logged15)).toBeNull();
    expect(nightDue(at("15", "21:30"), undefined, logged15)).toBe("2026-10-15");
    expect(nightDue(at("16", "00:40"), undefined, logged15)).toBe("2026-10-15"); // opened first at 00:40: it used to wait until 05:00
    expect(nightDue(at("16", "03:59"), undefined, logged15)).toBe("2026-10-15");
    expect(nightDue(at("16", "00:40"), "2026-10-15", logged15)).toBeNull(); // done at 21:30 — refreshed only when asked
  });
  it("from 04:00 until noon, yesterday's if it wasn't read back; not after noon; nothing logged, nothing read", () => {
    expect(nightDue(at("16", "07:40"), "2026-10-14", logged15)).toBe("2026-10-15");
    expect(nightDue(at("16", "07:40"), "2026-10-15", logged15)).toBeNull();
    expect(nightDue(at("16", "12:05"), "2026-10-14", logged15)).toBeNull();
    expect(nightDue(at("16", "21:30"), "2026-10-15", () => false)).toBeNull();
  });
  it("an evening runs to 04:00", () => {
    expect([eveningOf(at("16", "00:40")), eveningOf(at("16", "03:59")), eveningOf(at("16", "04:00")), eveningOf(at("15", "23:59"))]).toEqual(["2026-10-15", "2026-10-15", "2026-10-16", "2026-10-15"]);
    expect(dayWindow("2026-10-15")).toEqual([at("15", "04:00"), at("16", "04:00")]);
  });
  it("names the day the way it is: today, tonight past midnight, yesterday", () => {
    expect(dayWord("2026-10-15", at("15", "21:30"))).toEqual({ label: "Thu 15 Oct", when: "today" });
    expect(dayWord("2026-10-15", at("16", "00:40")).when).toBe("tonight, past midnight");
    expect(dayWord("2026-10-15", at("16", "07:40")).when).toBe("yesterday");
  });
});

describe("what the read-back is given", () => {
  const st = { entries: [
    { id: "w", kind: "drink", at: at("15", "22:10"), name: "Wine", ml: 150, caffeineMg: 0, alcoholG: 14, kcal: 120 },
    { id: "b", kind: "drink", at: at("16", "00:40"), name: "Beer", ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 210 },
    { id: "m", kind: "food", at: at("15", "08:30"), name: "Eggs", grams: 150, macros: { kcal: 220, p: 18, c: 1, f: 15 } },
    { id: "n", kind: "food", at: at("16", "09:00"), name: "Oats", grams: 80, macros: { kcal: 300, p: 10, c: 50, f: 6 } },
  ], workouts: [], supplements: [], settings: DEFAULT_SETTINGS, profile: { conditions: [], meds: [], allergies: [], notes: "" }, goals: DEFAULT_GOALS, ai: EMPTY_AI, foods: [], drinks: [], templates: [], scout: {} } as unknown as State;
  // the day's own section (the plates follow it — tested below)
  const section = (c: string) => { const a = c.slice(c.indexOf("## The day being read back")), z = a.indexOf("\n## ", 3); return z < 0 ? a : a.slice(0, z); };
  it("the day's plates with their food scores follow it (PLAN 139): the 00:40 beer last, after midnight; not the next morning's oats", () => {
    const c = nightContext("2026-10-15", st, at("16", "10:00"));
    const plates = c.slice(c.indexOf("## Plates that day")).split("\n");
    expect(plates[0]).toBe("## Plates that day, with the app's food score (0–100: goal 45 — protein per 100 kcal; quality 35 — Nutri-Score; timing 20 — hours before bed)");
    expect(plates.slice(1).map((l) => l.split(":")[0])).toEqual(["- Breakfast 08", "- Late 22", "- After midnight 00"]);
    expect(plates[1]).toBe("- Breakfast 08:30, 220 kcal: no plate score — Eggs — no score (not a food the app knows)");
    expect(plates[2]).toMatch(/^- Late 22:10, \d+ kcal: 0 — Wine 0 \(goal 0\/45: 0\.0 g protein per 100 kcal; quality 0\/35: alcohol; timing 0\/20: 0\.8 h before bed\)$/);
    expect(c).not.toMatch(/Oats/);
  });
  it("past midnight: the beer at 00:40 is that evening's, after the wine, marked; the header says so", () => {
    const s = section(nightContext("2026-10-15", st, at("16", "00:50")));
    expect(s.split("\n")).toEqual([
      "## The day being read back: Thu 15 Oct (tonight, past midnight), as it happened — it runs to 04:00 the next morning",
      "- Totals, as the app counts them (food and drinks): 550 kcal · P 18 g · C 1 g · F 15 g — goals 2,600 kcal · P 160 g",
      "- 08:30 ate Eggs (220 kcal, P 18 g)", "- 22:10 drank Wine (14 g alcohol)", "- 00:40 (after midnight) drank Beer (20 g alcohol)",
    ]);
  });
  it("read back the next morning: called yesterday, still with the beer, without the next morning's oats", () => {
    const c = nightContext("2026-10-15", st, at("16", "09:30"));
    expect(c).not.toContain("## Today, as it happened");
    expect(section(c)).toMatch(/^## The day being read back: Thu 15 Oct \(yesterday\)[^\n]*\n- Totals, as the app counts them[^\n]*\n- 08:30 ate Eggs[^\n]*\n- 22:10 drank Wine[^\n]*\n- 00:40 \(after midnight\) drank Beer[^\n]*$/);
    expect(c).not.toContain("Oats");
    expect(c.split("\n")[0]).toMatch(/^Now: Fri 16 Oct 2026, 09:30 — today is 2026-10-16\. "Last 14 days" ends yesterday \(2026-10-15\)\. "Last night"/); // no "Today so far" promised
  });
  it("the next day's read-back doesn't get the 00:40 beer again", () => {
    expect(section(nightContext("2026-10-16", st, at("16", "21:30")))).not.toContain("Beer");
  });
});

// PLAN 129 (owner, 20 Oct: "ai look at the workout at eod … compare how i am improving etc … it should not fire often, it
// costs api credits"): no call of its own — on a workout day the read-back gets the session against the last one.
describe("a workout day's read-back", () => {
  const set = (id: string, d: string, hm: string, w: string, exercise: string, kg: number, reps: number, warmup = false) => ({ id, kind: "set", at: at(d, hm), workoutId: w, exercise, kg, reps, ...(warmup ? { warmup } : {}) });
  const st = { entries: [
    set("a", "13", "18:10", "w1", "Bench press", 60, 8), set("b", "13", "18:15", "w1", "Bench press", 60, 8),
    set("c", "15", "18:05", "w2", "Bench press", 30, 10, true), // a warm-up: never counted
    set("d", "15", "18:10", "w2", "Bench press", 62.5, 8), set("e", "15", "18:15", "w2", "Bench press", 62.5, 7),
  ], workouts: [{ id: "w1", template: "Push", startedAt: at("13", "18:00"), endedAt: at("13", "19:00") }, { id: "w2", template: "Push", startedAt: at("15", "18:00"), endedAt: at("15", "19:05") }],
  supplements: [], settings: DEFAULT_SETTINGS, profile: { conditions: [], meds: [], allergies: [], notes: "" }, goals: DEFAULT_GOALS, ai: EMPTY_AI, foods: [], drinks: [], templates: [], scout: {} } as unknown as State;
  it("gets the session against the last Push and each lift against last time, warm-ups left out", () => {
    const c = nightContext("2026-10-15", st, at("15", "22:00"));
    const w = c.slice(c.indexOf("## The workout that day")).split("\n");
    expect(w[0]).toBe("## The workout that day (each lift against the last time it was done; working sets only)");
    expect(w[1]).toBe("- Push 18:00–19:05 (65 min): 2 working sets, 938 kg (last Push, Tue 13 Oct: 960 kg, −2.3 %)");
    expect(w[2]).toMatch(/^ {2}- Bench press: 62\.5 × 8, 62\.5 × 7 — best 62\.5 × 8 ≈ 79 kg 1-rep max; last time Tue 13 Oct 60 × 8 ≈ 76 kg, \+4\.2 % — new best$/);
  });
  it("a day without a workout has no workout section", () => {
    expect(nightContext("2026-10-14", st, at("14", "22:00"))).not.toContain("## The workout that day");
    expect(nightContext("2026-10-13", st, at("13", "22:00"))).toMatch(/your first Push/);
  });
  it("the answer keeps a workout part only when it says something; trims its lists", () => {
    const base = { summary: "s", happened: [], notes: "", change: [], remember: [] };
    expect(checkNight(base).workout).toBeUndefined();
    expect(checkNight({ ...base, workout: { summary: " ", better: ["x"], next: "y" } }).workout).toBeUndefined();
    const w = checkNight({ ...base, workout: { summary: "Up on bench.", better: ["a", "", "b", "c", "d"], next: "Bench 62.5 × 8 ×2" } }).workout;
    expect(w).toEqual({ summary: "Up on bench.", better: ["a", "b", "c"], next: "Bench 62.5 × 8 ×2" });
  });
});

// Owner, 21 Oct: the AI "said it cant see how much protein the protein coffee had, but the app logged it correctly, and
// the ai said 108 protein at eod, in reality it was 158" (PLAN 149)
describe("protein from drinks reaches the AI", () => {
  const st = { entries: [
    { id: "f1", kind: "food", at: at("20", "08:00"), name: "Eggs", grams: 200, macros: { kcal: 300, p: 26, c: 2, f: 20 } },
    { id: "f2", kind: "food", at: at("20", "13:00"), name: "Chicken rice", grams: 450, macros: { kcal: 700, p: 52, c: 80, f: 12 } },
    { id: "f3", kind: "food", at: at("20", "19:00"), name: "Salmon", grams: 200, macros: { kcal: 420, p: 30, c: 0, f: 28 } },
    { id: "d1", kind: "drink", at: at("20", "10:00"), name: "Protein coffee", ml: 330, caffeineMg: 120, alcoholG: 0, kcal: 210, p: 50, c: 9, f: 3 },
  ], workouts: [], supplements: [], settings: DEFAULT_SETTINGS, profile: { conditions: [], meds: [], allergies: [], notes: "" }, goals: DEFAULT_GOALS, ai: EMPTY_AI, foods: [], drinks: [], templates: [], scout: {} } as unknown as State;
  it("the read-back's day: the drink with its protein, and the day's totals as the app counts them — 158 g, not 108", () => {
    const c = nightContext("2026-10-20", st, at("20", "22:00"));
    expect(c).toMatch(/- 10:00 drank Protein coffee \(120 mg caffeine; 210 kcal, P 50 g\)/);
    expect(c).toMatch(/- Totals, as the app counts them \(food and drinks\): 1,630 kcal · P 158 g · C 91 g · F 63 g — goals 2,600 kcal · P 160 g/);
  });
});
