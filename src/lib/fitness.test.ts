import { describe, expect, it } from "vitest";
import { cardioAnswer, cardioShort, headline, recoveryAnswer, strengthAnswer, weightAnswer, type Answer } from "./fitness";
import type { Overall } from "./strength";
import type { LaneTrend } from "./cardiofit";
import type { Trend } from "./tdee";

// Renovation part 1 (owner, 13 Nov: "do 1 then 3"; canvas A): the four answers on top of Training, and what's next.
const W = 7 * 86_400_000, wk = (i: number) => 1_790_000_000_000 + i * W;
const overall = (state: Overall["state"], change: number | null, n = 6): Overall => ({ weeks: Array.from({ length: n }, (_, i) => ({ week: wk(i), index: 100 + i, lifts: 4, kg: 5000 })), change, perWeek: 0.8, lo: 0.4, hi: 1.2, state, lifts: 4 });
const lane = (l: LaneTrend["lane"], word: "lower" | "higher" | "same" | null, change = -8): LaneTrend => ({
  lane: l, ref: 115, slope: 0.6, windows: 300, pts: Array.from({ length: 12 }, (_, i) => ({ week: wk(i), v: 112 + (change * i) / 11, n: 20, spm: 115 })),
  trend: word ? { from: 112, to: 112 + change, change, p: 0.01, word } : null, then: [], now: [], thenAt: null, nowAt: null,
});
const weight = (perDay: number, se: number): Trend => ({ perDay, se, n: 30, spanDays: 84, nowKg: 82, pts: [], fit: [[0, 84], [83, 82]], dropped: [] });

describe("the four answers", () => {
  it("strength: its engine's verdict, the change since the first week", () => {
    expect(strengthAnswer(overall("stronger", 4.52))).toMatchObject({ big: "+4.5 %", word: "stronger", tone: "good" });
    expect(strengthAnswer(overall("unclear", 1.2))).toMatchObject({ word: "not clear yet", tone: "flat" });
    expect(strengthAnswer(overall(null, null, 1))).toMatchObject({ big: null, tone: "none" });
  });
  it("cardio fitness: walking first; lower at the same pace is fitter, drawn so up is better", () => {
    const a = cardioAnswer([lane("stair", "lower", -5), lane("walk", "lower", -8)]);
    expect(a).toMatchObject({ big: "−8 bpm", word: "fitter, at the same walking pace", tone: "good" });
    expect(a.spark.at(-1)![1]).toBeGreaterThan(a.spark[0][1]);
    expect(cardioAnswer([lane("walk", "same", -1)])).toMatchObject({ word: "about the same, at the same walking pace", tone: "flat" });
    expect(cardioAnswer([lane("walk", null)])).toMatchObject({ tone: "none" });
    expect(cardioAnswer([])).toMatchObject({ big: null, tone: "none" });
  });
  it("recovery: a faster drop is fitter", () => {
    const r = { pts: [], last: null, trend: { from: 26, to: 33, change: 7, p: 0.01, word: "higher" as const } };
    expect(recoveryAnswer(r)).toMatchObject({ big: "+7 bpm", tone: "good" });
  });
  it("weight: from the trend line, clear only past twice its error; heavier is never 'bad'", () => {
    expect(weightAnswer(weight(-0.025, 0.004), 84, [])).toMatchObject({ big: "−2.1 kg", word: "lighter · about −0.2 kg a week", tone: "good" });
    expect(weightAnswer(weight(0.025, 0.004), 84, [])).toMatchObject({ big: "+2.1 kg", tone: "flat" });
    expect(weightAnswer(weight(-0.01, 0.008), 84, [])).toMatchObject({ word: "about the same", tone: "flat" });
    expect(weightAnswer(null, 84, [])).toMatchObject({ big: null, tone: "none" });
  });
});

describe("the line over the tiles", () => {
  const a = (key: Answer["key"], tone: Answer["tone"]): Answer => ({ key, name: key, big: "x", word: "", tone, spark: [] });
  it("all four good", () => {
    expect(headline([a("strength", "good"), a("cardio", "good"), a("recovery", "good"), a("weight", "good")])).toBe("Yes on all four: stronger, fitter on cardio, recovering faster and lighter.");
  });
  it("mixed: the good, then the bad, then the rest", () => {
    expect(headline([a("strength", "good"), a("cardio", "bad"), a("recovery", "flat"), a("weight", "good")])).toBe("Stronger and lighter, but less fit on cardio; the rest about the same.");
  });
  it("nothing known yet; nothing moved", () => {
    expect(headline([a("strength", "none")])).toBe("Not enough yet to say. Each tile says what it needs.");
    expect(headline([a("strength", "flat"), a("weight", "flat")])).toBe("About the same on everything that can be measured yet.");
  });
});

describe("cardio short this week", () => {
  const weeks = (mins: number[]) => mins.map((min, i) => ({ week: wk(i), min, sessions: 1, kcal: 0 }));
  it("the minutes short of the 3 weeks before, from 10", () => {
    expect(cardioShort(weeks([60, 80, 90, 70, 55]))).toEqual({ min: 55, usual: 80, short: 25 });
    expect(cardioShort(weeks([60, 80, 90, 70, 75]))).toBeNull();
    expect(cardioShort(weeks([0, 0, 10, 0, 0]))).toBeNull();
    expect(cardioShort(weeks([80, 80]))).toBeNull();
  });
});
