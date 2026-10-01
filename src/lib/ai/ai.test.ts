import { describe, expect, it } from "vitest";
import { fromDescribed, judge } from "./apply";
import { buildContext, feelByTime } from "./context";
import { checkDescribe, costUsd, jsonFrom } from "./tasks";
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
