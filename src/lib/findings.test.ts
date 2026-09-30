import { describe, expect, it } from "vitest";
import { bodyWorld, type BodyWorld } from "./bench";
import { bodyDays, realBurn, weightTrend } from "./tdee";
import { notice } from "./findings";
import { DEFAULT_GOALS } from "./types";
import { addDays, atMinute } from "./time";

const LAST = "2026-09-29";
const NOW = atMinute("2026-09-30", 12 * 60);
const world = (w: Partial<BodyWorld>) => bodyWorld({ seed: 1, days: 28, lastDay: LAST, tdee: 2800, intakeMean: 2800, ...w });
const days = (w: Partial<BodyWorld>) => bodyDays(world(w), addDays(LAST, -27), LAST);
const seeds = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("real burn (test bench)", () => {
  it("recovers a planted burn inside its 90% range about 90% of the time", () => {
    let inside = 0, err = 0;
    const runs = seeds(200);
    for (const seed of runs) {
      const b = realBurn(days({ seed, tdee: 2800, intakeMean: 3050 }))!;
      if (b.lo <= 2800 && 2800 <= b.hi) inside++;
      err += Math.abs(b.kcal - 2800);
    }
    expect(inside / runs.length).toBeGreaterThan(0.82);
    expect(err / runs.length).toBeLessThan(150);
  });

  it("works for a cut too, and leaves partly logged days out", () => {
    const b = realBurn(days({ seed: 7, tdee: 2500, intakeMean: 2000, partialRate: 0.15 }))!;
    expect(b.partial).toBeGreaterThan(0);
    expect(b.lo).toBeLessThanOrEqual(2500);
    expect(b.hi).toBeGreaterThanOrEqual(2500);
  });

  it("waits for enough data", () => {
    expect(realBurn(bodyDays(world({ days: 10 }), addDays(LAST, -27), LAST))).toBeNull();
    expect(realBurn(days({ logRate: 0.3 }))).toBeNull();
  });
});

describe("weight trend (test bench)", () => {
  it("finds a planted gain with the right size", () => {
    // +250 kcal/day ≈ +0.23 kg/week
    const hits = seeds(100).map((seed) => weightTrend(days({ seed, intakeMean: 3050 }))!.perDay * 7);
    const avg = hits.reduce((a, b) => a + b, 0) / hits.length;
    expect(avg).toBeGreaterThan(0.18);
    expect(avg).toBeLessThan(0.28);
  });

  it("rarely claims a change when there is none", () => {
    let alarms = 0;
    for (const seed of seeds(300)) {
      const r = notice(world({ seed }), DEFAULT_GOALS, NOW);
      if (r.found.some((f) => f.id === "weight-trend" && /going (up|down)/.test(f.title))) alarms++;
    }
    expect(alarms / 300).toBeLessThan(0.1);
  });

  it("needs 8 weigh-ins over 14 days", () => {
    expect(weightTrend(days({ weighRate: 0.1 }))).toBeNull();
  });
});

describe("notice", () => {
  it("reports a clear gain and the real burn against your goal", () => {
    const r = notice(world({ seed: 3, days: 35, intakeMean: 3300, tdee: 2800 }), { ...DEFAULT_GOALS, kcal: 3300 }, NOW);
    expect(r.found.map((f) => f.id)).toEqual(["real-burn", "weight-trend"]);
    expect(r.found[1].title).toMatch(/going up about 0\.[3-5]\d kg a week/);
    expect(r.found[0].detail).toMatch(/goal is \d+ above it/);
    expect(r.checking).toHaveLength(0);
  });

  it("on a new account says what's missing instead of guessing", () => {
    const r = notice([], DEFAULT_GOALS, NOW);
    expect(r.found).toHaveLength(0);
    expect(r.checking.map((c) => c.missing)).toEqual(["0 of 8 weigh-ins, over at least 14 days", "0 of 14 days of food logged, 0 of 8 weigh-ins"]);
  });

  it("ignores today's half-eaten day", () => {
    const e = world({ seed: 5 });
    const withSnack = [...e, { id: "x", kind: "food" as const, at: NOW, name: "Snack", grams: 50, macros: { kcal: 150, p: 3, c: 20, f: 6 } }];
    expect(notice(withSnack, DEFAULT_GOALS, NOW).found.find((f) => f.id === "real-burn")?.value)
      .toBe(notice(e, DEFAULT_GOALS, NOW).found.find((f) => f.id === "real-burn")?.value);
  });
});
