// PLAN 184 phase 2 — walking speed from Apple Health in the pattern finder (owner, 29 Oct, his Health app's list: "pls
// select all that are interesting or important and can help the app make predictions"; 31 Oct: "do 2"). Picked as a test:
// walking speed may go with tired days. Known answers: the Shortcut's day (its latest run), a planted slower walk the day
// after drinks is found; nothing planted, nothing found; walking speed is never paired with steps.
import { describe, expect, it } from "vitest";
import { feelWorld, rng } from "./bench";
import { walkByDay, type HealthSample } from "./healthimport";
import { withHealth } from "./daysband";
import type { DayFacts } from "./insights";
import { scout } from "./scout";
import { addDays, atMinute } from "./time";

describe("walking speed per day", () => {
  it("the day's latest run (it covers the most of the day); by local day; weight and fat aren't walks", () => {
    const s: HealthSample[] = [
      { type: "walk", at: atMinute("2026-10-30", 11 * 60), value: 4.6 },
      { type: "walk", at: atMinute("2026-10-30", 21 * 60), value: 4.9 },
      { type: "walk", at: atMinute("2026-10-30", 23 * 60 + 50), value: 5.0 },
      { type: "walk", at: atMinute("2026-10-31", 10), value: 5.4 },
      { type: "weight", at: atMinute("2026-10-29", 7 * 60), value: 82.4 },
    ];
    expect([...walkByDay(s)]).toEqual([["2026-10-30", 5.0], ["2026-10-31", 5.4]]);
  });
  it("into the days the finder reads; without any walk, the days are as they were", () => {
    const days = [{ day: "2026-10-30" }, { day: "2026-10-31" }] as DayFacts[];
    expect(withHealth(days, [{ type: "walk", at: atMinute("2026-10-31", 660), value: 5.1 }]).map((d) => d.walkKmh)).toEqual([null, 5.1]);
    expect(withHealth(days, [{ type: "weight", at: atMinute("2026-10-31", 420), value: 82 }])).toBe(days);
  });
});

/**
 * 90 days of a person (lib/bench: drinks on about 1 day in 5), the band's sleep and steps, and the Shortcut's walking
 * speed at 11:00 on 85 % of days: 5.0 km/h ± 0.3. Planted when asked: 0.4 km/h slower the day after 28 g+ of alcohol;
 * `withSteps`: speed rising with steps (the phone measures it while you walk) — not a connection to show.
 */
function world(seed: number, plant: { slowAfterDrinks?: boolean; withSteps?: boolean } = {}): DayFacts[] {
  const f = feelWorld({ seed, days: 90 }), { r, g } = rng(seed + 900), samples: HealthSample[] = [];
  f.forEach((d, i) => {
    d.day = addDays("2026-08-02", i);
    d.asleepMin = Math.round(420 + g() * 50);
    d.steps = Math.round(8000 + g() * 2500);
    if (r() > 0.85) return;
    const prev = f[i - 1];
    const v = 5 + g() * 0.3 - (plant.slowAfterDrinks && prev && prev.alcoholG >= 28 ? 0.4 : 0) + (plant.withSteps ? (d.steps - 8000) / 2500 * 0.3 : 0);
    samples.push({ type: "walk", at: atMinute(d.day, 11 * 60), value: Math.round(v * 100) / 100 });
  });
  return withHealth(f, samples);
}
const walkLeads = (ps: ReturnType<typeof scout>) => ps.filter((p) => p.a.id === "walk" || p.b.id === "walk");
const count = (n: number, f: (s: number) => boolean) => Array.from({ length: n }, (_, s) => f(s + 1)).filter(Boolean).length;

describe("walking speed in the pattern finder", () => {
  it("planted: slower the day after drinks → found, in words, on most of 10 worlds", () => {
    const found = count(10, (s) => walkLeads(scout(world(s, { slowAfterDrinks: true }), [])).some((p) => p.a.id === "alcohol" && p.b.id === "walk" && p.lag === 1 && p.sign < 0));
    expect(found).toBeGreaterThanOrEqual(8);
    const p = walkLeads(scout(world(1, { slowAfterDrinks: true }), []))[0];
    expect(p.text).toBe("Alcohol and next-day walking speed move opposite ways");
  });
  it("control: nothing planted → no walking-speed lead (at most 1 world in 20 by chance)", () => {
    expect(count(20, (s) => walkLeads(scout(world(s), [])).length > 0)).toBeLessThanOrEqual(1);
  });
  it("control: speed that rises with steps is never a lead (more walking, more of it measured)", () => {
    expect(count(10, (s) => walkLeads(scout(world(s, { withSteps: true }), [])).some((p) => p.a.id === "steps" || p.b.id === "steps"))).toBe(0);
  });
});
