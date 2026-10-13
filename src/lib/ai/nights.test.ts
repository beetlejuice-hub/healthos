import { describe, expect, it } from "vitest";
import { nightLines, nightsForAi } from "./nights";
import { buildContext } from "./context";
import type { BandData, SleepSession } from "../band";
import type { Entry, Supplement } from "../types";
import type { Evening, Night } from "../sleep";

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
/** One night: in bed 23:30 on the 11th, asleep 23:44, a 10-min waking at 03:00, up 07:15 on the 12th. */
function session(): SleepSession {
  const st = (type: SleepSession["stages"][number]["type"], a: number, b: number) => ({ type, start: a, end: b });
  const stages = [st("awake", at(11, 23, 30), at(11, 23, 44)), st("light", at(11, 23, 44), at(12, 1)), st("deep", at(12, 1), at(12, 2, 10)), st("rem", at(12, 2, 10), at(12, 3)),
    st("awake", at(12, 3), at(12, 3, 10)), st("light", at(12, 3, 10), at(12, 5)), st("rem", at(12, 5), at(12, 7, 5)), st("awake", at(12, 7, 5), at(12, 7, 15))];
  return { id: "s1", start: at(11, 23, 30), end: at(12, 7, 15), asleepMin: null, awakeMin: null, toFallAsleepMin: 14, nap: false, stageMin: {}, stages };
}
const mag: Supplement = { id: "mag", name: "Magnesium", dose: "200 mg", slot: "evening", at: 1290, active: true };

describe("the AI sees the band's nights (PLAN 88 phase 2)", () => {
  it("one line a night: the band's measures, then the evening before — only what's known", () => {
    const n = { day: "2026-10-12", eve: "2026-10-11", bed: at(11, 23, 30), asleep: 425, latency: 14, wakes: 1, deep: 70, rem: 140, low: 51, lowAt: at(12, 4, 10), hrv: 46, nap: null } as unknown as Night;
    const e: Evening = { drinks: [at(11, 20)], caffeineAtBed: 42, trained: true, ateLate: false, rating: 6, lastMealMin: 95, eveKcal: 820, lateTrain: true, eveStress: 7, supps: { mag: true }, tags: ["gf"], phoneMin: 45 };
    expect(nightLines([n], [e], [mag])).toEqual(["2026-10-12 (night from 2026-10-11): bed 23:30, asleep 7h05, fell asleep in 14 min, woke 1×, deep 70 min, REM 140 min, lowest HR 51 at 04:10, HRV 46 ms · evening before: 1 drink, 42 mg caffeine at bed, last meal 1h35 before bed, 820 kcal from 17:00, trained within 3 h of bed, evening stress 7/10, took Magnesium, last night: with gf, phone ~45 min before sleep, rated it 6/10"]);
    // nothing known about the evening: no "0 kcal", no "didn't eat" — just the band
    const bare: Evening = { drinks: [], caffeineAtBed: 0, trained: false, ateLate: false, rating: null, lastMealMin: null, eveKcal: null, eveStress: null, supps: {} };
    expect(nightLines([n], [bare], [mag])[0]).not.toMatch(/evening before|kcal|didn't/);
  });
  it("from band data and the log: the night, the dinner, magnesium answered 'didn't take', the morning's rating", () => {
    const band = { sleep: [session()], hr: [], rhr: {}, hrv: { "2026-10-12": 48 } } as unknown as BandData;
    const entries: Entry[] = [
      { id: "f", kind: "food", at: at(11, 21), name: "Pasta", grams: 400, macros: { kcal: 700, p: 25, c: 110, f: 15 } },
      { id: "m", kind: "supp", at: at(11, 21, 30), suppId: "mag", status: "skipped", slot: "evening" },
      { id: "r", kind: "sleep", at: at(12, 7, 40), rating: 5 },
    ];
    const lines = nightsForAi({ entries, workouts: [], supplements: [mag], halfLifeMin: 300 }, band, at(12, 12));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^2026-10-12 \(night from 2026-10-11\): bed 23:30, asleep \dh\d\d, fell asleep in 14 min, woke 1×, deep 70 min/);
    expect(lines[0]).toMatch(/HRV 48 ms · evening before: last meal 2h30 before bed, 700 kcal from 17:00, didn't take Magnesium, rated it 5\/10$/);
  });
  it("lands in what the AI is told, under its own heading", () => {
    const state = { entries: [], workouts: [], supplements: [], settings: { halfLifeMin: 300, bedMinute: 1380, coffeeMg: 95, bodyKg: 78, usualDrink: null }, profile: { conditions: [], meds: [], allergies: [], notes: "" }, goals: { kcal: 2400, p: 150 }, ai: { memory: [], experiments: [] } } as never;
    const c = buildContext({ state, now: at(12, 12), days: [], findings: [], patterns: [], nights: ["2026-10-12 (night from 2026-10-11): bed 23:30"] });
    expect(c).toContain("## My nights from the band, newest last");
    expect(c).toContain("- 2026-10-12 (night from 2026-10-11): bed 23:30");
  });
});
