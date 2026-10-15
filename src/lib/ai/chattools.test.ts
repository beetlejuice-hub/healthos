import { describe, expect, it } from "vitest";
import { runChatTool, type ToolData } from "./chattools";
import { DEFAULT_SETTINGS, EMPTY_AI } from "../store";
import { atMinute } from "../time";
import type { Entry } from "../types";

const at = (d: string, h: number, m = 0) => atMinute(d, h * 60 + m);
const NOW = at("2026-10-15", 20);
let n = 0;
const feel = (d: string, h: number, mood: number, note?: string): Entry => ({ id: `f${n++}`, kind: "feel", at: at(d, h), mood, ...(note ? { note } : {}) } as Entry);
const food = (d: string, h: number, name: string, kcal: number): Entry => ({ id: `k${n++}`, kind: "food", at: at(d, h), name, grams: 300, macros: { kcal, p: 30, c: 80, f: 20 } } as Entry);
const entries: Entry[] = [
  feel("2026-10-12", 14, 5), feel("2026-10-13", 14, 6), feel("2026-10-14", 14, 7, "deadline at work"), feel("2026-10-15", 14, 8),
  food("2026-10-11", 19, "Pizza margherita", 900), food("2026-10-14", 13, "Pizza diavola", 800), food("2026-10-15", 12, "Ciorbă", 300),
  { id: "c1", kind: "drink", at: at("2026-10-14", 8, 10), drinkId: "coffee", name: "Coffee", ml: 200, caffeineMg: 95, alcoholG: 0, kcal: 2 } as Entry,
  { id: "p1", kind: "drink", at: at("2026-10-13", 21), drinkId: "palinka", name: "Pálinka", ml: 40, caffeineMg: 0, alcoholG: 13, kcal: 95 } as Entry,
  { id: "s1", kind: "supp", at: at("2026-10-14", 8), suppId: "creatine", status: "taken" } as Entry,
];
const band = {
  hr: [], sleep: [], rhr: { "2026-10-14": 52.4 }, hrv: { "2026-10-14": 48 }, kcal: { "2026-10-14": 2450, "2026-10-15": 1200 },
  steps: [[at("2026-10-14", 9), 5, 1000], [at("2026-10-14", 12), 5, 1500], [at("2026-10-14", 18), 5, 500]] as [number, number, number][],
};
const data: ToolData = { state: { entries, workouts: [], settings: DEFAULT_SETTINGS, supplements: [{ id: "creatine", name: "Creatine", dose: "5 g", slot: "morning", at: 480, active: true }], ai: { ...EMPTY_AI, memory: [{ id: "m", text: "Usual coffee is a long coffee", at: 0 }] } }, band, now: NOW };
const run = (name: string, input: Record<string, unknown>) => runChatTool({ id: "t", name: name as never, input }, data);

describe("the chat's tools answer from the app's data (PLAN 67)", () => {
  it("day: the day's averages, supplements, the band, everything in order", () => {
    const t = run("day", { date: "2026-10-14" }).text;
    expect(t).toContain("Mood 7.0/10");
    expect(t).toContain("Calories eaten 800 kcal"); // food, as the pages count it
    expect(t).toContain("Supplements taken: Creatine");
    expect(t).toContain("Band: resting heart rate 52 bpm, HRV 48 ms, 3,000 steps, 2,450 kcal burned");
    expect(t).toMatch(/- 08:10 drank Coffee \(95 mg caffeine\)[\s\S]*- 13:00 ate Pizza diavola \(800 kcal[\s\S]*- 14:00 check-in: mood 7 · my note: "deadline at work"/);
  });
  it("day: a future date, or a bad one, comes back as an error the AI can fix", () => {
    expect(run("day", { date: "2026-10-20" })).toMatchObject({ error: true, text: expect.stringContaining("hasn't happened yet") });
    expect(run("day", { date: "yesterday" }).error).toBe(true);
  });
  it("series: each day, the average, lowest and highest — known answers", () => {
    const t = run("series", { measure: "mood", from: "2026-10-12", to: "2026-10-15" }).text;
    expect(t).toContain("Mood, 2026-10-12 to 2026-10-15: 4 of 4 days with a value; average 6.5/10, lowest 5.0/10 (2026-10-12), highest 8.0/10 (2026-10-15)");
    expect(t).toContain("2026-10-13 Tue 6.0/10");
  });
  it("series: today's calories are shown as so far and left out of the average; the band's measures too", () => {
    const t = run("series", { measure: "kcal", from: "2026-10-14", to: "2026-10-15" }).text;
    expect(t).toContain("1 of 1 day with a value (today so far: 300 kcal); average 800 kcal");
    expect(t).toContain("2026-10-15 Thu 300 kcal (today, so far)");
    expect(run("series", { measure: "steps", from: "2026-10-14", to: "2026-10-14" }).text).toContain("average 3,000");
    expect(run("series", { measure: "rhr", from: "2026-10-01", to: "2026-10-31" }).text).toContain("2026-10-01 to 2026-10-15"); // not past today
  });
  it("series: a bad span says why", () => {
    expect(run("series", { measure: "mood", from: "2026-01-01", to: "2026-10-15" })).toMatchObject({ error: true, text: "at most 120 days at a time" });
    expect(run("series", { measure: "mood", from: "2026-10-15", to: "2026-10-01" }).error).toBe(true);
    expect(run("series", { measure: "happiness", from: "2026-10-01", to: "2026-10-02" }).error).toBe(true);
  });
  it("find: every time a word shows up, newest first, accents ignored", () => {
    const t = run("find", { text: "pizza" }).text;
    expect(t).toMatch(/^"pizza": 2 times on 2 days in the last 180 days, newest first:\n- 2026-10-14 Wed 13:00 food: Pizza diavola \(800 kcal\)\n- 2026-10-11 Sun 19:00 food: Pizza margherita/);
    expect(run("find", { text: "palinka" }).text).toContain("drink: Pálinka");
    expect(run("find", { text: "ciorba" }).text).toContain("food: Ciorbă");
    expect(run("find", { text: "deadline" }).text).toContain('note: "deadline at work"');
    expect(run("find", { text: "creatine" }).text).toContain("supplement taken: Creatine");
    expect(run("find", { text: "sushi" }).text).toBe('"sushi" doesn\'t show up in the last 180 days.');
  });
  it("show_chart: a chart the app draws, described back to the AI; nothing to draw is an error", () => {
    expect(run("show_chart", { measure: "mood", from: "2026-10-12", to: "2026-10-15", title: "Mood this week" })).toMatchObject({ chart: { measure: "mood", from: "2026-10-12", to: "2026-10-15", title: "Mood this week" }, text: expect.stringContaining("average 6.5/10") });
    expect(run("show_chart", { measure: "weight", from: "2026-10-12", to: "2026-10-15", title: "Weight" })).toMatchObject({ error: true });
    // only today, partway: still a chart (today drawn hollow), with no average to quote
    expect(run("show_chart", { measure: "burned", from: "2026-10-15", to: "2026-10-15", title: "Burned" })).toMatchObject({ chart: { measure: "burned" }, text: "Chart attached under your reply: Calories burned, today so far: 1,200 kcal." });
  });
  it("remember: a new line is handed back to save; one already known isn't", () => {
    expect(run("remember", { text: "Trains Mon/Wed/Fri evenings" })).toEqual({ text: "Saved to memory.", remember: "Trains Mon/Wed/Fri evenings" });
    expect(run("remember", { text: "usual coffee is a long coffee" })).toEqual({ text: "Already remembered." });
    expect(run("nope", {}).error).toBe(true);
  });
});
