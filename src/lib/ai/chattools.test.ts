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
    expect(t).toContain("Calories eaten 802 kcal"); // the pizza and the coffee, as Today counts them
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
    expect(t).toContain("1 of 1 day with a value (today so far: 300 kcal); average 802 kcal");
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
    expect(t).toMatch(/^"pizza": 2 times on 2 days in the last 180 days, newest first:\n- 2026-10-14 Wed 13:00 food: Pizza diavola \(800 kcal\) \[id:k5\]\n- 2026-10-11 Sun 19:00 food: Pizza margherita \(900 kcal\) \[id:k4\]/);
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

describe("chat part 2: compare, nights, sessions (PLAN 67)", () => {
  const T0 = "2026-08-17", N = 60, noise = (i: number, k: number) => ((((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1) + 1) % 1) - 0.5;
  const day = (i: number) => {
    const d = new Date(`${T0}T12:00:00`); d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  /**
   * 60 days: mood ~6, +1 on days magnesium was taken (even days); magnesium answered "not taken" on days i%4==1, not
   * logged on the other odd days (since 20 Oct that's "not taken" too: owner, "if i dont … log it, it should be taken as if
   * i did not take it"); a beer every 3rd evening, and the next morning's resting heart rate 4 bpm higher; days 50–52 with
   * nothing logged at all. No effect of drinks on mood is planted.
   */
  function world2() {
    const entries: Entry[] = [], rhr: Record<string, number> = {};
    for (let i = 0; i < N; i++) {
      const d = day(i);
      rhr[d] = 54 + (i > 0 && (i - 1) % 3 === 0 ? 4 : 0) + noise(i, 1) * 3;
      if (i >= 50 && i <= 52) continue;
      entries.push({ id: `f${i}`, kind: "feel", at: at(d, 14), mood: Math.round((6 + (i % 2 === 0 ? 1 : 0) + noise(i, 2) * 2) * 10) / 10 } as Entry);
      entries.push({ id: `k${i}`, kind: "food", at: at(d, 13), name: "Lunch", grams: 400, macros: { kcal: 700, p: 40, c: 80, f: 20 } } as Entry);
      if (i % 3 === 0) entries.push({ id: `b${i}`, kind: "drink", at: at(d, 21), drinkId: "beer", name: "Beer", ml: 500, caffeineMg: 0, alcoholG: 19.7, kcal: 215 } as Entry);
      if (i % 2 === 0) entries.push({ id: `m${i}`, kind: "supp", at: at(d, 22), suppId: "mag", status: "taken" } as Entry);
      else if (i % 4 === 1) entries.push({ id: `m${i}`, kind: "supp", at: at(d, 22), suppId: "mag", status: "skipped" } as Entry);
    }
    return { entries, rhr };
  }
  const w = world2(), now2 = at(day(N), 9);
  const d2: ToolData = { state: { entries: w.entries, workouts: [], settings: DEFAULT_SETTINGS, supplements: [{ id: "mag", name: "Magnesium", dose: "400 mg", slot: "evening", at: 1320, active: true }], ai: EMPTY_AI }, band: { hr: [], sleep: [], rhr: w.rhr, hrv: {} }, now: now2 };
  const run2 = (name: string, input: Record<string, unknown>) => runChatTool({ id: "t", name: name as never, input }, d2);
  const span2 = { from: day(0), to: day(N - 1) };

  it("planted: the morning after a beer, resting heart rate about 4 bpm higher — found, clear", () => {
    const t = run2("compare", { measure: "rhr", thing: "drinks", supplement: "", when: "next_day", ...span2 }).text;
    const diff = Number(t.match(/Difference \+([\d.]+) bpm/)?.[1]);
    expect(diff).toBeGreaterThan(3); expect(diff).toBeLessThan(5);
    expect(t).toMatch(/: clear\. Goes with, not proof of cause\.$/);
    expect(t).toContain("Resting heart rate the next day with drinks vs without");
    // the band has days 50–52 too, but nothing was logged then — not "without drinks", just unknown
    expect(t).toMatch(/with: average [\d.]+ bpm over 19 days; without: [\d.]+ bpm over 37\./);
  });
  it("nothing planted: mood on drink days isn't called different — and the 3 empty days aren't counted as without", () => {
    const t = run2("compare", { measure: "mood", thing: "drinks", supplement: "", when: "same_day", ...span2 }).text;
    expect(t).toMatch(/not clear — the range crosses zero/);
    expect(t).toMatch(/with: average [\d.]+\/10 over 19 days; without: [\d.]+\/10 over 38/); // 57 logged days, not 60
  });
  it("planted: mood about 1 point higher on magnesium days — taken against not taken (said, or not logged); days with nothing logged left out", () => {
    const t = run2("compare", { measure: "mood", thing: "supplement", supplement: "magnes", when: "same_day", ...span2 }).text;
    expect(t).toContain("Mood with Magnesium vs without");
    expect(t).toMatch(/over 2[78] days; without: [\d.]+\/10 over 29\./); // taken on even days; every odd day is without, but the 51st (nothing logged)
    const diff = Number(t.match(/Difference \+([\d.]+)\/10/)?.[1]);
    expect(diff).toBeGreaterThan(0.6); expect(diff).toBeLessThan(1.4);
    expect(t).toMatch(/: clear\./);
    expect(run2("compare", { measure: "mood", thing: "supplement", supplement: "zinc", when: "same_day", ...span2 })).toMatchObject({ error: true, text: expect.stringContaining("the stack: Magnesium") });
  });
  it("too few days on a side says so instead of a number", () => {
    expect(run2("compare", { measure: "mood", thing: "drinks", supplement: "", when: "same_day", from: day(0), to: day(4) }).text).toContain("Too few days on one side");
  });
  it("nights: the band's nights with bed, up and stages; sessions: each with its best sets", () => {
    const T = (d: string, h: number) => atMinute(d, 0) + h * 3_600_000;
    const sleep = [{ id: "n1", start: T("2026-10-13", 23), end: T("2026-10-13", 31), asleepMin: null, awakeMin: null, toFallAsleepMin: 10, nap: false, stageMin: {},
      stages: [{ type: "awake", start: T("2026-10-13", 23), end: T("2026-10-13", 23) + 600_000 }, { type: "light", start: T("2026-10-13", 23) + 600_000, end: T("2026-10-13", 26) }, { type: "deep", start: T("2026-10-13", 26), end: T("2026-10-13", 27.5) }, { type: "rem", start: T("2026-10-13", 27.5), end: T("2026-10-13", 31) }] }];
    const withNight: ToolData = { ...data, band: { ...band, sleep } as never };
    const nt = runChatTool({ id: "t", name: "nights", input: { from: "2026-10-10", to: "2026-10-15" } }, withNight).text;
    expect(nt).toMatch(/^1 night from the band[\s\S]*- 2026-10-14 Wed: bed 23:00, up 07:00, asleep 7 h \d\d, deep 90 min, REM 210 min/);
    expect(nt).toContain("HRV 48 ms");
    expect(runChatTool({ id: "t", name: "nights", input: { from: "2026-10-10", to: "2026-10-15" } }, data).text).toBe("No nights from the band yet.");
    const sets = [80, 82.5].flatMap((kg, j) => [5, 5, 4].map((reps, k) => ({ id: `s${j}${k}`, kind: "set", at: at(j ? "2026-10-14" : "2026-10-12", 18, k), workoutId: `w${j}`, exercise: "Bench press", kg, reps })));
    const withTraining: ToolData = { ...data, state: { ...data.state, entries: [...entries, ...sets] as Entry[], workouts: [{ id: "w0", template: "Push", startedAt: at("2026-10-12", 18), endedAt: at("2026-10-12", 19) }, { id: "w1", template: "Push", startedAt: at("2026-10-14", 18), endedAt: at("2026-10-14", 19) }] as never } };
    const st = runChatTool({ id: "t", name: "sessions", input: { from: "2026-10-01", to: "2026-10-15" } }, withTraining).text;
    expect(st).toMatch(/^2 sessions[\s\S]*- 2026-10-14 Wed 18:00 Push: 3 working sets, 1,155 kg volume · best sets: Bench press 82.5 kg × 5/);
  });
});
