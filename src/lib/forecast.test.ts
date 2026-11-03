// PLAN 187 phase 2 — tonight's bet (owner, 3 Nov: "App could do prediction vs real so it predicts based on drinks workout
// food etc to sleep"; picked B: "simpler, cleaner"). Planted worlds with known effects — each drink −3, a meal within 2 h
// of bed −4, each hour past usual bedtime −4 — must be recovered near size; a world with no effects must push nothing
// much; the range must hold about 8 in 10 of the nights it hasn't seen; a bet uses only the nights before it.
import { describe, expect, it } from "vitest";
import { betBefore, betOn, FORECAST, featuresOf, forecastModel, lastBets, mostly, usualBedH, type Scored } from "./forecast";
import type { Evening, Night } from "./sleep";
import { rng } from "./bench";
import { addDays, atMinute } from "./time";

/** n nights from 2026-08-01: drinks 0–3 on 30 % of evenings, a late meal on 25 %, bed 23:00 ± 50 min; score 80 + effects + noise. */
function world(seed: number, plant: { drink?: number; meal?: number; bedPerH?: number }, n = 90, noise = 4): Scored[] {
  const { r, g } = rng(seed), out: Scored[] = [];
  for (let i = 0; i < n; i++) {
    const eve = addDays("2026-08-01", i), day = addDays(eve, 1);
    const bedMin = 23 * 60 + Math.round(g() * 50), bed = atMinute(eve, bedMin);
    const drinks = r() < 0.3 ? 1 + Math.floor(r() * 3) : 0, meal = r() < 0.25, trained = r() < 0.4;
    const n0 = { id: `n${i}`, day, eve, bed, up: bed + 8 * 3_600_000 } as unknown as Night;
    const e = { drinks: Array.from({ length: drinks }, (_, k) => bed - (k + 1) * 3_600_000), caffeineAtBed: r() < 0.3 ? 40 : 5, trained, ateLate: meal, rating: null, lateTrain: false, lastMealMin: meal ? 60 : 200, eveStress: null } as Evening;
    const late = (bedMin - 23 * 60) / 60;
    const score = 80 - (plant.drink ?? 0) * drinks - (meal ? plant.meal ?? 0 : 0) - (plant.bedPerH ?? 0) * Math.max(0, late) + g() * noise;
    out.push({ n: n0, e, score });
  }
  return out;
}
const pushOf = (b: ReturnType<typeof betOn>, id: string) => b.pushes.find((p) => p.id === id)?.pts ?? 0;

describe("tonight's bet", () => {
  it("planted: 2 drinks and a late meal push the bet down near their size; your usual is your usual", () => {
    let hits = 0;
    for (let s = 1; s <= 20; s++) {
      const w = world(s, { drink: 3, meal: 4 }), bedH = usualBedH(w.map((x) => x.n));
      const m = forecastModel(w.map((x) => ({ x: featuresOf(x.n, x.e, bedH), y: x.score })), bedH)!;
      const tonight = { ...w[0].e, drinks: [1, 2], lastMealMin: 60 } as Evening;
      const b = betOn(m, featuresOf(w[0].n, tonight, bedH, true));
      const mu = w.reduce((a, x) => a + x.e.drinks.length, 0) / w.length;
      // each drink −3 against an average night's drinks; the meal −4 against how often there's one
      if (Math.abs(pushOf(b, "drinks") - -3 * (2 - mu)) <= 1.5 && pushOf(b, "lateMeal") <= -2) hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(17);
  });
  it("planted: an hour past your usual bedtime, found from the nights; a bet takes your usual bed", () => {
    const w = world(3, { bedPerH: 4 }), bedH = usualBedH(w.map((x) => x.n));
    const m = forecastModel(w.map((x) => ({ x: featuresOf(x.n, x.e, bedH), y: x.score })), bedH)!;
    const j = 6; // bedLate
    expect(m.w[j] / m.sd[j]).toBeLessThan(-1.2);
    expect(featuresOf(w[0].n, w[0].e, bedH, true)[j]).toBe(0);
  });
  it("control: a world with no effects pushes nothing much, and says no 'mostly …'", () => {
    let quiet = 0;
    for (let s = 1; s <= 20; s++) {
      const w = world(100 + s, {}), bedH = usualBedH(w.map((x) => x.n));
      const m = forecastModel(w.map((x) => ({ x: featuresOf(x.n, x.e, bedH), y: x.score })), bedH)!;
      const b = betOn(m, featuresOf(w[0].n, { ...w[0].e, drinks: [1, 2], lastMealMin: 60 } as Evening, bedH, true));
      if (mostly(b) == null && Math.abs(b.bet - b.usual) <= 3) quiet++;
    }
    expect(quiet).toBeGreaterThanOrEqual(17);
  });
  it("its range holds about 8 in 10 of the nights it bets on without having seen them", () => {
    const w = world(7, { drink: 3, meal: 4 }, 120);
    let inside = 0, n = 0;
    for (let i = 60; i < w.length; i++) { const b = betBefore(w, i)!; n++; if (w[i].score >= b.low - 0.5 && w[i].score <= b.high + 0.5) inside++; }
    expect(inside / n).toBeGreaterThan(0.65);
    expect(inside / n).toBeLessThan(0.97);
  });
  it("a bet uses only the nights before it: changing later nights doesn't change it", () => {
    const w = world(9, { drink: 3 }), later = w.map((x, i) => (i > 50 ? { ...x, score: 20 } : x));
    expect(betBefore(later, 50)!.bet).toBe(betBefore(w, 50)!.bet);
    expect(betBefore(later, 51)!.bet).toBe(betBefore(w, 51)!.bet);
  });
  it("under 21 nights, no bet; the week: 7 nights, each called within ±5 or not", () => {
    expect(forecastModel(world(1, {}, 20).map((x) => ({ x: featuresOf(x.n, x.e, 23), y: x.score })), 23)).toBeNull();
    const w = world(11, { drink: 3, meal: 4 }), week = lastBets(w);
    expect(week).toHaveLength(FORECAST.week);
    expect(week.every((c) => c.hit === Math.abs(c.real - c.bet) <= FORECAST.hit)).toBe(true);
    expect(week.at(-1)!.day).toBe(w.at(-1)!.n.day);
  });
  it("in words: the biggest push, signed; nothing for one under 2 points", () => {
    expect(mostly({ bet: 74, low: 68, high: 80, usual: 80, pushes: [{ id: "drinks", say: "2 drinks", pts: -6 }, { id: "caf", say: "40 mg caffeine at bed", pts: -1 }] })).toBe("mostly 2 drinks (−6)");
    expect(mostly({ bet: 79, low: 70, high: 86, usual: 80, pushes: [{ id: "caf", say: "x", pts: -1 }] })).toBeNull();
  });
});
