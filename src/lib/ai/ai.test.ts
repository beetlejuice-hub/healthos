import { describe, expect, it } from "vitest";
import { fromDescribed, judge } from "./apply";
import { CONTEXT_MAX, buildContext, dayTimeline, feelByTime, moodJournal } from "./context";
import { checkDescribe, checkNight, costUsd, jsonFrom } from "./tasks";
import { parseItem } from "../quickadd";
import { feelWorld } from "../bench";
import { EMPTY_AI, type State } from "../store";
import { DEFAULT_GOALS } from "../types";
import { addDays } from "../time";

describe("AI answers become your own data", () => {
  it("a described long coffee becomes your drink, found by what you typed next time — no AI", () => {
    const r = fromDescribed({ kind: "drink", name: "Long coffee, large", amount: "1 big cup", drink: { ml: 300, caffeineMg: 150.4, alcoholG: 0, kcal: 3 }, confidence: "medium", note: "assumed double shot" }, "drink:ai1", "my usual long coffee big cup");
    expect("drink" in r && r.drink.caffeineMg).toBe(150);
    const drink = "drink" in r ? r.drink : null;
    expect(parseItem("my usual long coffee big cup", [], [drink!]).drink?.drink.id).toBe("drink:ai1");
  });
  it("a described dish becomes your food, counted in its unit", () => {
    const r = fromDescribed({ kind: "food", name: "Spaghetti bolognese with mayo", amount: "1 plate", per100: { kcal: 190, p: 8, c: 20, f: 8.5 }, unit: { name: "Plate", g: 400 }, count: 1, confidence: "medium", note: "" }, "custom:ai2", "bolognese spaghetti w mayonnaise sos");
    expect("food" in r && r.line).toMatchObject({ count: 1, unit: "plate" });
    const food = "food" in r ? r.food : null;
    expect(parseItem("bolognese spaghetti w mayonnaise sos", [food!]).line?.food.id).toBe("custom:ai2");
  });
  it("checks keep impossible labels out", () => {
    const { items, dropped } = checkDescribe({ items: [
      { kind: "food", name: "ok", amount: "1", per100: { kcal: 100, p: 5, c: 15, f: 2 }, unit: { name: "piece", g: 50 }, count: 1, confidence: "high", note: "" },
      { kind: "food", name: "kcal off", amount: "1", per100: { kcal: 100, p: 30, c: 30, f: 10 }, unit: { name: "piece", g: 50 }, count: 1, confidence: "high", note: "" },
      { kind: "drink", name: "too much caffeine", amount: "1", drink: { ml: 250, caffeineMg: 900, alcoholG: 0, kcal: 0 }, confidence: "high", note: "" },
    ] });
    expect(items.map((i) => i.name)).toEqual(["ok"]);
    expect(dropped).toEqual(["kcal off", "too much caffeine"]);
  });
  it("JSON is found inside a text answer; cost uses list prices", () => {
    expect(jsonFrom('Sure! {"a":1} done')).toEqual({ a: 1 });
    expect(costUsd("sonnet", { input_tokens: 1e6, output_tokens: 1e5, server_tool_use: { web_search_requests: 2 } })).toBeCloseTo(2 + 1 + 0.02, 6);
  });
});

describe("experiments: before vs during", () => {
  const base = feelWorld({ seed: 7, days: 60, rateRate: 1 }).map((d, i) => ({ ...d, day: addDays("2026-08-01", i) }));
  const x = { id: "x", name: "No caffeine after 14:00", how: "", days: 21, measure: "energy", start: addDays("2026-08-01", 30) };
  it("a real +1.5 energy change is called better; no change isn't", () => {
    const lifted = base.map((d) => (d.day >= x.start && d.energy != null ? { ...d, energy: d.energy + 1.5 } : d));
    expect(judge(x, lifted, addDays(x.start, 25)).state).toBe("better");
    expect(judge(x, base, addDays(x.start, 25)).state).toBe("no-clear-change");
  });
  it("too early or too few ratings: says so", () => {
    expect(judge(x, base, addDays(x.start, 3)).state).toBe("running");
    expect(judge({ ...x, start: "2026-08-03" }, base, "2026-09-20").state).toBe("too-few");
  });
  it("sleep is judged on the next morning's rating: each night belongs to the day before it", () => {
    let k = 0; const slept = base.map((d) => ({ ...d, sleep: 6 + ((k++ * 7) % 5) / 4 })); // 6.0–7.0, no trend
    const sx = { ...x, measure: "sleep" };
    // Better from the first night of the protocol: mornings after the start day.
    const better = slept.map((d) => (d.day > sx.start ? { ...d, sleep: d.sleep + 1.5 } : d));
    expect(judge(sx, better, addDays(sx.start, 25)).state).toBe("better");
    expect(judge(sx, slept, addDays(sx.start, 25)).state).toBe("no-clear-change");
    // The start day's own morning (the night before it began) counts as "before", not "during".
    const v = judge(sx, slept, addDays(sx.start, 25));
    expect(v.n[0]).toBe(14); expect(v.n[1]).toBe(25);
    // A great night just before the start (rated on the start day's morning) is "before": it can't flatter the protocol.
    const flat = base.map((d) => ({ ...d, sleep: d.day === sx.start ? 10 : 6 }));
    const f = judge(sx, flat, addDays(sx.start, 25));
    expect(f.before!).toBeGreaterThan(6); expect(f.during).toBe(6);
  });
});

describe("what the AI sees", () => {
  const state = { entries: [
    { id: "f1", kind: "feel", at: new Date(2026, 8, 30, 16, 0).getTime(), energy: 3, mood: 6, focus: 4 },
    { id: "f2", kind: "feel", at: new Date(2026, 8, 29, 16, 30).getTime(), energy: 4, mood: 6, focus: 5 },
    { id: "f3", kind: "feel", at: new Date(2026, 8, 29, 21, 0).getTime(), energy: 7, mood: 7, focus: 7 },
  ], supplements: [{ id: "saffron", name: "Saffron", dose: "30 mg", slot: "evening", at: 0, active: true, status: "low" }],
    profile: { conditions: ["psoriasis"], meds: [], allergies: [], notes: "" }, goals: DEFAULT_GOALS, ai: { ...EMPTY_AI, memory: [{ id: "m", text: "Usual coffee is a long coffee", at: 0 }] } } as unknown as State;
  it("feel by time of day shows the afternoon dip", () => {
    expect(feelByTime(state, new Date(2026, 9, 1).getTime())).toEqual([
      "afternoon (14–18): 2 check-ins · energy 3.5 · mood 6 · focus 4.5",
      "evening (18–24): 1 check-in · energy 7 · mood 7 · focus 7",
    ]);
  });
  it("summary has about-me, stack status and memory — not raw entries", () => {
    const c = buildContext({ state, now: new Date(2026, 9, 1).getTime(), days: [], findings: [], patterns: [] });
    expect(c).toContain("Conditions: psoriasis");
    expect(c).toContain("Saffron 30 mg (evening) — running low");
    expect(c).toContain("Usual coffee is a long coffee");
    expect(c).not.toContain("f1");
  });
});

describe("the day, read back (owner, 2 Oct)", () => {
  const T = (h: number, m = 0) => new Date(2026, 9, 1, h, m).getTime();
  const state = { entries: [
    { id: "d1", kind: "drink", at: T(8, 10), name: "Coffee", ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 },
    { id: "f1", kind: "feel", at: T(14), mood: 4, stress: 8, note: "deadline at work", doing: ["work"] },
    { id: "s1", kind: "sleep", at: T(7, 30), rating: 5, slow: true },
    { id: "x", kind: "feel", at: T(14) - 86_400_000, mood: 9, note: "yesterday's note" },
  ], workouts: [{ id: "w", template: "Upper A", startedAt: T(18), endedAt: T(19) }], supplements: [], profile: { conditions: [], meds: [], allergies: [], notes: "" }, goals: DEFAULT_GOALS, ai: EMPTY_AI } as unknown as State;

  it("the timeline is that day, in order, with the note quoted exactly", () => {
    expect(dayTimeline(state, "2026-10-01")).toEqual([
      "07:30 rated last night's sleep 5/10, slow to fall asleep",
      "08:10 drank Coffee (95 mg caffeine)",
      '14:00 check-in: mood 4, stress 8 · up to: work · my note: "deadline at work"',
      "18:00 gym: Upper A",
    ]);
  });

  it("notes reach every AI call's context, marked as the user's own reasons", () => {
    const c = buildContext({ state, now: T(22), days: [], findings: [], patterns: [] });
    expect(c).toMatch(/## Why I felt that way \(my own notes[\s\S]*2026-10-01 14:00 mood 4, stress 8 — "deadline at work"/);
    expect(c).toContain("yesterday's note");
  });

  it("checkNight keeps it short and refuses an empty summary", () => {
    expect(() => checkNight({ summary: " ", happened: [], notes: "", change: [], remember: [] })).toThrow();
    const n = checkNight({ summary: "ok", happened: ["a", "", "b"], notes: "  n ", change: [{ what: "", why: "x" }, { what: "walk", why: "dip" }], remember: ["short", "Stress runs high on deadline days.", "x".repeat(300), "third one is dropped"] });
    expect(n).toEqual({ summary: "ok", happened: ["a", "b"], notes: "n", change: [{ what: "walk", why: "dip" }], remember: ["Stress runs high on deadline days.", "x".repeat(180)] });
  });
});

describe("the AI knows everything about mood (owner, 2 Oct)", () => {
  const D = 86_400_000, now = new Date(2026, 9, 2, 22).getTime();
  const many = (days: number) => {
    const entries: unknown[] = [];
    for (let d = days - 1; d >= 0; d--) {
      const t = now - d * D;
      entries.push({ id: `s${d}`, kind: "sleep", at: t - 14 * 3600e3, rating: 6, slow: d % 2 === 0 });
      entries.push({ id: `a${d}`, kind: "feel", at: t - 12 * 3600e3, energy: 6, mood: 7, doing: ["work"] });
      entries.push({ id: `b${d}`, kind: "feel", at: t - 6 * 3600e3, stress: 8, note: d === 0 ? "deadline at work" : undefined });
    }
    return { entries, workouts: [], supplements: [], settings: { halfLifeMin: 300, bedMinute: 23 * 60, coffeeMg: 95, bodyKg: 78, usualDrink: null }, profile: { conditions: [], meds: [], allergies: [], notes: "" }, goals: DEFAULT_GOALS, ai: EMPTY_AI } as unknown as State;
  };
  it("the journal has every check-in of a day on one line, sleep first, notes quoted", () => {
    const j = moodJournal(many(3), now);
    expect(j).toHaveLength(3);
    expect(j[2]).toBe('2026-10-02: slept 6 (slow to fall asleep) · 10:00 E6 M7 [work] · 16:00 S8 "deadline at work"');
  });
  it("two months of check-ins fit; a year is trimmed oldest-first to the budget, newest days kept", () => {
    const two = buildContext({ state: many(60), now, days: [], findings: [], patterns: [] });
    expect(two).toMatch(/## Mood journal[^\n]*— 60 days/);
    const year = buildContext({ state: many(365), now, days: [], findings: [], patterns: [] });
    expect(year.length).toBeLessThanOrEqual(CONTEXT_MAX);
    expect(year).toContain('2026-10-02: slept 6');
    expect(year).not.toContain("2025-10-05:");
  });
});
