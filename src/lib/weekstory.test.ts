import { describe, expect, it } from "vitest";
import { storyCards, storyWeek, type StoryIn } from "./weekstory";
import type { WeekReport } from "./weekreport";

// Item 12 (owner, 14 Nov): the Sunday story.
const at = (d: string, hm: string) => new Date(`2026-11-${d}T${hm}:00`).getTime();
const report = (o: Partial<WeekReport> = {}): WeekReport => ({ from: at("09", "00:00"), to: at("16", "00:00"), complete: true, title: "", lifts: [{ exercise: "Squat", weeks: [], best: 120, prev: 117.5, pb: true }], muscles: [],
  cardio: { min: 75, before: 55, zones: null, zonesBefore: null }, vo2: [], rhr: [54, 52], sessions: [{ at: 0, name: "Push" }, { at: 1, name: "Pull" }, { at: 2, name: "Mixed" }], planned: 3, kg: 0, usualKg: null, pbs: 1, next: null, ...o });
const nights = [["Mon", 82, 30, false], ["Tue", 85, 25, false], ["Wed", 80, 40, false], ["Thu", 91, 20, false], ["Fri", 74, 110, true], ["Sat", 70, 120, true]].map(([dayName, score, bedEve, weekend]) => ({ asleep: 440, score: score as number, dayName: dayName as string, bedEve: 300 + (bedEve as number), weekend: weekend as boolean }));
const base: StoryIn = { report: report(), nights, zone2: { min: 52, aim: 150 }, link: "Each drink goes with HRV 3.4 ms lower the next day", look: null, bestBed: "23:30" };

describe("which week", () => {
  it("Sunday from 18:00: this week; Monday: last week; otherwise none", () => {
    expect(storyWeek(at("15", "19:00"))).toBe(0);
    expect(storyWeek(at("15", "17:00"))).toBeNull();
    expect(storyWeek(at("16", "10:00"))).toBe(1);
    expect(storyWeek(at("17", "10:00"))).toBeNull();
  });
});

describe("the cards", () => {
  it("a full week: six cards, in order, each with its number", () => {
    const c = storyCards(base);
    expect(c.map((x) => x.key)).toEqual(["week", "strength", "cardio", "sleep", "link", "try"]);
    expect(c[0]).toMatchObject({ h: "A full week", big: "3", line: "sessions of 3. Squat +2.5 kg. 1 PB." });
    expect(c[2].line).toBe("cardio, up from 55 the week before. 52 of a 150-minute zone-2 aim. Resting heart rate 52 (−2).");
    expect(c[3]).toMatchObject({ h: "7 h 20 a night", big: "80" });
    expect(c[3].line).toMatch(/^average score\. Thu was your best \(91\)\. Weekends started 1 h 2\d later\.$/);
    expect(c[5]).toMatchObject({ h: "In bed by 23:30", act: { protocol: { measure: "sleep", days: 7 } } });
  });
  it("only what's true: no lifts moving, no strength card; under 3 nights, no sleep card; no link, none", () => {
    const c = storyCards({ ...base, report: report({ lifts: [], pbs: 0, sessions: [], cardio: { min: 0, before: 0, zones: null, zonesBefore: null } }), nights: nights.slice(0, 2), link: null, zone2: null, bestBed: null });
    expect(c.map((x) => x.key)).toEqual(["week"]);
    expect(c[0]).toMatchObject({ h: "A quiet week", big: "0" });
  });
});
