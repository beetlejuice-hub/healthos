import { describe, expect, it } from "vitest";
import { ABSORB_HALF_MIN, caffeineAt, caffeineCurve, caffeineInBlood, doseCaffeine, latestDoseFor, SIP_MIN, type Dose } from "./caffeine";

const at = (h: number, m = 0) => new Date(2026, 8, 29, h, m).getTime();
const MIN = 60_000;
const day = [{ at: at(8, 10), mg: 95 }, { at: at(13), mg: 95 }];

/**
 * An independent check of the closed form: step the three places caffeine can be (cup → gut → blood → gone) a
 * hundredth of a minute at a time. If the formula is right, the two agree.
 */
function simulate(d: Dose, minutes: number, halfLife = 300) {
  const T = d.sipMin ?? SIP_MIN, k = Math.LN2 / ABSORB_HALF_MIN, e = Math.LN2 / halfLife, dt = 0.01;
  let cup = d.mg, gut = 0, blood = 0;
  for (let t = 0; t < minutes - 1e-9; t += dt) {
    const drink = T > 0 ? Math.min(cup, (d.mg / T) * dt) : cup;
    cup -= drink; gut += drink;
    const absorbed = gut * (1 - Math.exp(-k * dt)); gut -= absorbed; blood += absorbed;
    blood *= Math.exp(-e * dt);
  }
  return { left: cup + gut + blood, blood };
}

describe("caffeine, sipped and absorbed (PLAN 86)", () => {
  it("the formula agrees with a minute-by-minute simulation, gulped or sipped, at any time", () => {
    for (const sipMin of [0, 10, 15, 20]) for (const m of [3, 15, 30, 50, 120, 300, 600]) {
      const d = { at: 0, mg: 100, sipMin }, f = doseCaffeine(d, m * MIN), s = simulate(d, m);
      expect(Math.abs(f.left - s.left)).toBeLessThan(0.15);
      expect(Math.abs(f.blood - s.blood)).toBeLessThan(0.15);
    }
  });
  it("a gulped coffee peaks in the blood about 45 min later, at about 90% of it", () => {
    const d = { at: 0, mg: 100, sipMin: 0 }, curve = Array.from({ length: 180 }, (_, m) => doseCaffeine(d, m * MIN).blood);
    const peakAt = curve.indexOf(Math.max(...curve));
    expect(peakAt).toBeGreaterThanOrEqual(38); expect(peakAt).toBeLessThanOrEqual(48);
    expect(Math.max(...curve)).toBeGreaterThan(85); expect(Math.max(...curve)).toBeLessThan(93);
  });
  it("sipped over 15 min (the default), it peaks a few minutes later and a little lower — not at the moment it's logged", () => {
    const gulp = Array.from({ length: 180 }, (_, m) => doseCaffeine({ at: 0, mg: 100, sipMin: 0 }, m * MIN).blood);
    const sip = Array.from({ length: 180 }, (_, m) => doseCaffeine({ at: 0, mg: 100 }, m * MIN).blood);
    const p = (c: number[]) => c.indexOf(Math.max(...c));
    expect(p(sip) - p(gulp)).toBeGreaterThanOrEqual(4); expect(p(sip) - p(gulp)).toBeLessThanOrEqual(10);
    expect(Math.max(...sip)).toBeLessThan(Math.max(...gulp));
    expect(caffeineInBlood([{ at: 0, mg: 100 }], 0)).toBe(0);
    expect(caffeineInBlood([{ at: 0, mg: 100 }], 10 * MIN)).toBeLessThan(25); // it's still going down
  });
  it("what's logged counts in full at once for bedtime — a coffee 5 min before bed isn't 'nothing at bed'", () => {
    const late = [{ at: at(22, 55), mg: 95 }];
    expect(caffeineAt(late, at(23))).toBeCloseTo(95, 0);
    expect(caffeineInBlood(late, at(23))).toBe(0); // under 10 mg reached the blood yet
  });
  it("hours after a drink the two numbers agree, a few % above the plain halving (absorption delays clearing)", () => {
    const one = [{ at: at(8), mg: 100 }];
    expect(Math.abs(caffeineAt(one, at(13)) - caffeineInBlood(one, at(13)))).toBeLessThan(1);
    expect(caffeineAt(one, at(13))).toBeGreaterThan(50); expect(caffeineAt(one, at(13))).toBeLessThan(53);
  });
  it("ignores doses that haven't happened yet", () => {
    expect(caffeineAt(day, at(7))).toBe(0);
    expect(caffeineInBlood(day, at(8, 9))).toBe(0);
  });
  it("bedtime barely moves from the old instant model: the day's 36 mg at 23:00 is now 37–38", () => {
    expect(Math.round(caffeineAt(day, at(23)))).toBeGreaterThanOrEqual(36);
    expect(Math.round(caffeineAt(day, at(23)))).toBeLessThanOrEqual(38);
  });
  it("ends: under 10 mg counts as none, so a day-old coffee is 0, not 'a trace'", () => {
    const one = [{ at: at(8), mg: 95 }];
    expect(caffeineAt(one, at(8) + 24 * 3600e3)).toBe(0); // ≈ 3.5 mg
    expect(caffeineAt(one, at(8) + 15 * 3600e3)).toBeGreaterThan(10); // ≈ 12.4 mg, still counts
    expect(caffeineAt([{ at: at(8), mg: 3 }], at(8))).toBe(0); // a decaf is no caffeine
  });
  it("respects a personal half-life (checked against the simulation)", () => {
    const d = { at: 0, mg: 100 };
    expect(Math.abs(doseCaffeine(d, 240 * MIN, 240).left - simulate(d, 240, 240).left)).toBeLessThan(0.15);
    expect(caffeineAt([d], 240 * MIN, 240)).toBeLessThan(caffeineAt([d], 240 * MIN, 420));
  });
  it("draws the blood curve at the requested step: starts at 0, rises over the hour", () => {
    const c = caffeineCurve(day, at(8), at(9, 30), 15);
    expect(c).toHaveLength(7);
    expect(c[0][1]).toBe(0);
    const v = c.map((p) => p[1]);
    expect(v[2]).toBeLessThan(v[4]); // 08:30 < 09:00
    expect(Math.max(...v)).toBeGreaterThan(80);
  });
});

describe("latestDoseFor — the coffee cut-off", () => {
  it("returns null when bedtime is already over the target", () => {
    expect(latestDoseFor(day, at(23), 95, 30)).toBeNull();
  });
  it("an empty body, 100 mg, 50 mg by 23:00: a little before 18:00 (plain halving said 18:00 exactly)", () => {
    const t = latestDoseFor([], at(23), 100, 50)!;
    expect(t).toBeGreaterThan(at(17, 30)); expect(t).toBeLessThan(at(18));
    expect(caffeineAt([{ at: t, mg: 100 }], at(23))).toBeCloseTo(50, 4);
  });
  it("allows any time when the dose alone fits under the target", () => {
    expect(latestDoseFor([], at(23), 40, 50)).toBe(at(23));
  });
  it("agrees with caffeineAt at the returned time", () => {
    const t = latestDoseFor(day, at(23), 95, 60)!;
    expect(caffeineAt([...day, { at: t, mg: 95 }], at(23))).toBeCloseTo(60, 4);
  });
});
