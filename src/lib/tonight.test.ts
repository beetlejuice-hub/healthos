import { describe, expect, it } from "vitest";
import { phrase, tonightEve, tonightLines, tonightNight } from "./tonight";
import { evenings, FACTORS, goesWith, suppFactors, type Night } from "./sleep";
import { rng } from "./bench";
import { addDays, atMinute, HOUR } from "./time";

const EVE0 = "2026-09-10";
type Inputs = Parameters<typeof evenings>[1];
/**
 * 30 nights (no stages needed: the grid reads the numbers). Planted: dinner within 2 h of bed → 20 min longer to fall
 * asleep; magnesium taken → 14 min more deep. Then tonight, with its own dinner and magnesium answer.
 */
function world(tonight: { dinnerH: number; mag: "taken" | "skipped" | null }) {
  const { r, g } = rng(9), ns: Night[] = [];
  const inp: Inputs = { drinks: [], caffeineAt: () => 0, workouts: [], meals: [], ratings: [], foods: [], sessions: [], checks: [], supps: [] };
  for (let k = 0; k < 30; k++) {
    const eve = addDays(EVE0, k), bed = atMinute(eve, 23 * 60 + 15), dinnerH = 18 + r() * 5, mag = r() < 0.5;
    inp.foods!.push({ at: atMinute(eve, dinnerH * 60), kcal: 750, c: 80 });
    inp.supps!.push({ at: atMinute(eve, 21 * 60), suppId: "mag", status: mag ? "taken" : "skipped" });
    const late = bed - atMinute(eve, dinnerH * 60) < 2 * HOUR;
    ns.push({ ...tonightNight(eve, bed), id: eve, asleep: 420 + g() * 15, latency: 12 + Math.abs(g() * 4) + (late ? 20 : 0), deep: 75 + g() * 6 + (mag ? 14 : 0), rem: 95 + g() * 8, awake: 20 + g() * 4, wakes: 2, low: 50 + g(), hrv: 45 + g() * 3 });
  }
  const eve = addDays(EVE0, 30), bed = atMinute(eve, 23 * 60 + 15), n = tonightNight(eve, bed);
  inp.foods!.push({ at: atMinute(eve, tonight.dinnerH * 60), kcal: 750, c: 80 });
  if (tonight.mag) inp.supps!.push({ at: atMinute(eve, 21 * 60), suppId: "mag", status: tonight.mag });
  const evs = evenings([...ns, n], inp), past = evs.slice(0, -1), e = evs.at(-1)!;
  const factors = [...FACTORS, ...suppFactors([{ id: "mag", name: "Magnesium" }], past)];
  return { ns, n, e, factors, cells: goesWith(ns, past, { factors }) };
}

describe("Tonight (PLAN 88)", () => {
  it("dinner within 2 h of bed tonight, magnesium not logged: both lines, surest first", () => {
    const w = world({ dinnerH: 22, mag: null }), lines = tonightLines(w.factors, w.cells, w.n, w.e);
    const meal = lines.find((l) => l.factor.id === "meal2h"), mag = lines.find((l) => l.factor.id === "supp:mag");
    expect(meal?.kind).toBe("holds"); expect(meal?.cell.toward).toBe("worse");
    expect(["latency", "asleep"]).toContain(meal!.cell.outcome);
    expect(mag?.kind).toBe("missing"); expect(mag?.cell.outcome).toBe("deep"); expect(mag?.cell.toward).toBe("better");
    expect(lines.map((l) => l.cell.p!)).toEqual([...lines.map((l) => l.cell.p!)].sort((a, b) => a - b));
  });
  it("dinner at 18:00 and magnesium taken: no meal line; magnesium holds (its nights went with more deep)", () => {
    const w = world({ dinnerH: 18, mag: "taken" }), lines = tonightLines(w.factors, w.cells, w.n, w.e);
    expect(lines.find((l) => l.factor.id === "meal2h")).toBeUndefined();
    expect(lines.find((l) => l.factor.id === "supp:mag")?.kind).toBe("holds");
  });
  it("magnesium answered 'didn't take': no line — not nagged, and not a night with it", () => {
    const w = world({ dinnerH: 18, mag: "skipped" });
    expect(tonightLines(w.factors, w.cells, w.n, w.e).find((l) => l.factor.id === "supp:mag")).toBeUndefined();
  });
  it("'ate after 21:00' and 'ate within 2 h of bed' are one fact: only the surer shows", () => {
    const w = world({ dinnerH: 22, mag: null });
    const both = [{ factor: "late", outcome: "latency", nWith: 9, nWithout: 9, diff: 15, p: 0.004, sure: "likely" as const, toward: "worse" as const },
      { factor: "meal2h", outcome: "latency", nWith: 9, nWithout: 9, diff: 19, p: 0.0004, sure: "clear" as const, toward: "worse" as const }];
    expect(tonightLines(FACTORS, both, w.n, w.e).map((l) => l.factor.id)).toEqual(["meal2h"]);
  });
  it("rows that need the night itself or a finished day never show in the evening", () => {
    const w = world({ dinnerH: 22, mag: null });
    const fake = [{ factor: "latebed", outcome: "deep", nWith: 9, nWithout: 9, diff: -20, p: 0.0001, sure: "clear" as const, toward: "worse" as const }];
    const late = { ...w.n, bed: atMinute(w.n.eve, 24 * 60 + 40) };
    expect(tonightLines(FACTORS, fake, late, w.e)).toEqual([]);
  });
  it("the evening of 00:30 is still yesterday's; differences read in words", () => {
    expect(tonightEve(new Date(2026, 9, 13, 0, 30).getTime())).toBe("2026-10-12");
    expect(tonightEve(new Date(2026, 9, 13, 21, 0).getTime())).toBe("2026-10-13");
    expect(phrase("latency", 19.4)).toBe("19 min longer to fall asleep");
    expect(phrase("deep", -22.2)).toBe("22 min less deep sleep");
    expect(phrase("wakes", -0.64)).toBe("0.6 fewer wakings");
    expect(phrase("hrv", -6.04)).toBe("HRV 6 ms lower");
  });
});
