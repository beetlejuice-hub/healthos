import { describe, expect, it } from "vitest";
import { feelWorld, type FeelWorld } from "../bench";
import { effectFindings } from "./effects";
import type { Supplement } from "../types";

const STACK: Supplement[] = [
  { id: "saffron", name: "Saffron", dose: "30 mg", slot: "evening", at: 1290, active: true },
  { id: "creatine", name: "Creatine", dose: "5 g", slot: "morning", at: 480, active: true },
];
const seeds = (n: number, from = 1) => Array.from({ length: n }, (_, i) => i + from);
const rate = (n: number, w: Omit<FeelWorld, "seed">, hit: (ids: string[]) => boolean) =>
  seeds(n).filter((seed) => hit(effectFindings(feelWorld({ seed, ...w }), STACK).found.flatMap((f) => f.covers ?? [f.id]))).length / n;

describe("effect engine — test bench", () => {
  // Measured 30 Sept: 83% at 90 days, 62% at 60 — a 1-point effect needs about three months of ratings.
  it("finds a planted 1-point energy drop after late caffeine: ≥80% of fake people by 90 days", () => {
    const power = rate(100, { days: 90, lateCafEnergy: -1 }, (ids) => ids.some((id) => /^fx-(late-caf(-mg)?|caf-bed)-energy$/.test(id)));
    expect(power).toBeGreaterThanOrEqual(0.8);
  });

  it("stays quiet when nothing is planted: any false finding across ~60 questions in ≤10% of fake people", () => {
    expect(rate(200, {}, (ids) => ids.length > 0)).toBeLessThanOrEqual(0.1);
    expect(rate(100, { days: 90 }, (ids) => ids.length > 0)).toBeLessThanOrEqual(0.12);
  });

  it("isn't fooled by weekends: Friday/Saturday drinks + better weekend mood ≠ alcohol lifts mood", () => {
    const fooled = rate(100, { weekendDrinking: true, weekendMood: 1.2 }, (ids) => ids.some((id) => id.startsWith("fx-alc") && id.endsWith("-mood")));
    expect(fooled).toBeLessThanOrEqual(0.1);
  });

  it("isn't fooled by drift: mood rising + saffron started halfway ≠ saffron lifts mood", () => {
    const fooled = rate(100, { drift: 2, saffronFrom: 30 }, (ids) => ids.includes("fx-supp-saffron-mood"));
    expect(fooled).toBeLessThanOrEqual(0.1);
  });

  it("still finds it with 30% of evenings unrated (≥65% by 90 days)", () => {
    const power = rate(100, { days: 90, lateCafEnergy: -1, rateRate: 0.7 }, (ids) => ids.some((id) => /^fx-(late-caf(-mg)?|caf-bed)-energy$/.test(id)));
    expect(power).toBeGreaterThanOrEqual(0.65);
  });

  it("finds eating patterns: +450 kcal on gym days", () => {
    const power = rate(60, { gymKcal: 450 }, (ids) => ids.includes("fx-gym-kcal"));
    expect(power).toBeGreaterThanOrEqual(0.8);
  });

  it("says 'no effect' when there is enough data and nothing there", () => {
    const r = effectFindings(feelWorld({ seed: 3, days: 120 }), STACK);
    expect(r.none.length).toBeGreaterThan(0);
    expect(r.none[0].text).toMatch(/: no effect bigger than \d\.\d (points|kcal) \(\d+ days\)$/);
  });

  it("a finding reads like a sentence with its evidence", () => {
    const f = effectFindings(feelWorld({ seed: 5, lateCafEnergy: -1.5 }), STACK).found.find((x) => x.id.startsWith("fx-late-caf"))!;
    expect(f.title).toMatch(/(The day after caffeine past 14:00, your energy is \d\.\d points lower|Each (100 mg of caffeine after 14:00|50 mg of caffeine left at bedtime) goes with next-day energy \d\.\d points lower)/);
    expect(f.evidence).toMatch(/95% range .* · \d+% sure · held up in both halves of your data/);
  });

  it("tells you how to settle a question stuck without off days", () => {
    const r = effectFindings(feelWorld({ seed: 7, saffronFrom: 0 }), STACK);
    expect(r.checking[0]).toMatchObject({ question: "Saffron: does it change how you feel?" });
    expect(r.checking[0].missing).toMatch(/^\d+ days without Saffron — skip it on days you choose/);
    expect(r.checking.map((c) => c.missing).join(" | ")).not.toMatch(/undefined|1 more days/);
  });
});
