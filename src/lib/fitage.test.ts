// PLAN 177, body lab 4 — fitness age on HUNT 3's norms (Loe et al. 2013, Table 2). Known answers from the table; planted
// changes in fake band data (fitness, the kilos, both) found and split; a steady control finds nothing.
import { describe, expect, it } from "vitest";
import { ageAt, FITAGE, fitAge, fitLine, fitnessAge, fitWords, HUNT, NORM, perPoint, vo2At } from "./fitage";
import { addDays } from "./time";
import type { Vo2Day } from "./vo2";

const TODAY = "2026-10-27";
function rng(seed: number) { let s = seed >>> 0; const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; return () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }
/** 90 days to today: oxygen a minute `l(k)` (L/min, k days back) over weight `kg(k)`, ± 0.3 noise; weights logged every other day. */
function band(l: (k: number) => number, kg: (k: number) => number, seed = 1, noise = 0.3) {
  const g = rng(seed), vo2: Record<string, Vo2Day> = {}, kgs: Record<string, number> = {};
  for (let k = 89; k >= 0; k--) { const d = addDays(TODAY, -k); vo2[d] = { v: +((l(k) * 1000) / kg(k) + noise * g()).toFixed(1) }; if (k % 2 === 0) kgs[d] = +kg(k).toFixed(1); }
  return { vo2, kgs };
}

describe("the norms (HUNT 3, Loe et al. 2013, Table 2)", () => {
  it("the line runs through each decade's mean within 1.2 — about 3.7 a decade for men, 3.0 for women", () => {
    for (const sex of ["male", "female"] as const) for (const [age, v] of HUNT[sex]) expect(Math.abs(vo2At(age, sex) - v)).toBeLessThan(1.2);
    expect(NORM.male.perYear * 10).toBeCloseTo(-3.71, 2);
    expect(NORM.female.perYear * 10).toBeCloseTo(-2.98, 2);
  });
  it("known answers: each decade's average man is about that decade's age; 46 is a man in his mid-40s; a woman's 46 is under 20", () => {
    for (const [age, v] of HUNT.male) expect(Math.abs(ageAt(v, "male") - age)).toBeLessThan(3.2);
    expect(Math.round(fitnessAge(46, "male").age)).toBe(46);
    expect(fitWords(fitnessAge(46, "female"))).toBe("under 20");
    expect(perPoint("male")).toBeCloseTo(2.7, 1);
  });
  it("past the study's ages it says so, never a number it can't stand behind", () => {
    expect(fitnessAge(70, "male")).toEqual({ age: FITAGE.min, under: true, over: false });
    expect(fitWords(fitnessAge(12, "male"))).toBe("over 90");
    expect(fitnessAge(50, "male").age).toBeLessThan(fitnessAge(45, "male").age);
  });
});

describe("your fitness age over the weeks, and what moved it", () => {
  it("planted: fitness up at the same weight (3.4 → 3.65 L/min at 80 kg) — about 8 years younger over 8 weeks, all of it fitness", () => {
    const { vo2, kgs } = band((k) => 3.65 - (0.25 * k) / 89, () => 80);
    const f = fitAge(vo2, TODAY, "male", { age: 28, kg: kgs })!;
    expect(f.vo2).toBeGreaterThan(45); expect(f.vo2).toBeLessThan(46.3);
    expect(f.change!.weeks).toBe(8); expect(f.change!.word).toBe("up");
    expect(f.change!.years).toBeGreaterThanOrEqual(5); expect(f.change!.years).toBeLessThanOrEqual(8);
    expect(f.change!.fitness).toBeNull(); // no weight change, nothing to split
    expect(f.weeks).toHaveLength(12);
    expect(f.weeks.at(-1)!.age).toBeCloseTo(f.fit.age, 5);
    expect(f.weeks[0].age).toBeGreaterThan(f.weeks.at(-1)!.age);
    expect(f.you).toBe(28);
  });
  it("planted: only the kilos (3.5 L/min, 85 → 81 kg) — younger, and the split puts it on the kilos, not fitness", () => {
    const { vo2, kgs } = band(() => 3.5, (k) => 81 + (4 * k) / 89, 2);
    const c = fitAge(vo2, TODAY, "male", { kg: kgs })!.change!;
    expect(c.years).toBeGreaterThanOrEqual(3);
    expect(Math.abs(c.fitness!)).toBeLessThanOrEqual(1);
    expect(c.kg).toBe(c.years! - c.fitness!);
    expect(c.kgLost!).toBeGreaterThan(2);
  });
  it("pulling opposite ways — fitness falling (3.65 → 3.4 L/min) while 0.8 kg comes off: the kilos younger, fitness older, 20 people", () => {
    for (let s = 1; s <= 20; s++) {
      const { vo2, kgs } = band((k) => 3.4 + (0.25 * k) / 89, (k) => 80 + (1.2 * k) / 89, 200 + s);
      const c = fitAge(vo2, TODAY, "male", { kg: kgs })!.change!;
      expect(c.kg).not.toBeNull();
      expect(c.kg!).toBeGreaterThanOrEqual(0); expect(c.fitness!).toBeLessThan(0);
    }
  });
  it("planted: both (3.3 → 3.5 L/min, 85 → 81 kg) — fitness and kilos each take a share, adding up to the change shown", () => {
    const { vo2, kgs } = band((k) => 3.5 - (0.2 * k) / 89, (k) => 81 + (4 * k) / 89, 3);
    const f = fitAge(vo2, TODAY, "male", { kg: kgs })!, c = f.change!;
    expect(c.fitness!).toBeGreaterThanOrEqual(2); expect(c.kg!).toBeGreaterThanOrEqual(2);
    expect(c.fitness! + c.kg!).toBe(Math.round(c.thenFit.age) - Math.round(f.fit.age));
  });
  // a week's median of a noisy estimate wobbles ~0.5 of a point, ~1.4 years: under 1 point is "steady", as on the Heart page,
  // and the card gives no years then. Measured (27 Oct, 500 people): ± 0.3 a day → all steady, ± 0.8 → 95 %, at most 4 years.
  it("control: steady with day-to-day noise (± 0.8 a day), 50 people — called steady for 45+, never past 4 years", () => {
    const cs = Array.from({ length: 50 }, (_, s) => { const { vo2, kgs } = band(() => 3.6, () => 80, 100 + s, 0.8); return fitAge(vo2, TODAY, "male", { kg: kgs })!.change!; });
    expect(cs.filter((c) => c.word === "steady").length).toBeGreaterThanOrEqual(45);
    expect(Math.max(...cs.map((c) => Math.abs(c.years!)))).toBeLessThanOrEqual(4);
  });
  it("alongside, without years: resting heart rate that week and cardio minutes a week — none when there's nothing", () => {
    const { vo2 } = band(() => 3.6, () => 80);
    const rhr: Record<string, number> = {}, cardio: Record<string, number> = {};
    for (let k = 0; k < 90; k++) { rhr[addDays(TODAY, -k)] = k > 40 ? 57 : 54; if (k % 7 === 0) cardio[addDays(TODAY, -k)] = k > 40 ? 40 : 75; }
    const f = fitAge(vo2, TODAY, "male", { rhr, cardio })!;
    expect(f.rhr).toEqual([57, 54]);
    expect(f.cardio).toEqual([40, 75]);
    const none = fitAge(vo2, TODAY, "male", { rhr: {}, cardio: {} })!;
    expect(none.rhr).toBeNull(); expect(none.cardio).toBeNull();
  });
  it("women's norms set the same VO2 max younger; under 3 days of VO2 max this week, nothing", () => {
    const { vo2 } = band(() => 3.2, () => 80);
    expect(fitAge(vo2, TODAY, "female")!.fit.age).toBeLessThan(fitAge(vo2, TODAY, "male")!.fit.age);
    const thin: Record<string, Vo2Day> = { [TODAY]: { v: 45 }, [addDays(TODAY, -3)]: { v: 45 } };
    expect(fitAge(thin, TODAY, "male")).toBeNull();
    expect(fitAge(undefined, TODAY, "male")).toBeNull();
  });
  it("past the study's ages there are no years — the VO2 max change still shows", () => {
    const { vo2 } = band((k) => 4.6 - (0.2 * k) / 89, () => 70, 5);
    const f = fitAge(vo2, TODAY, "male")!;
    expect(f.fit.under).toBe(true);
    expect(f.change!.years).toBeNull();
  });
  it("the AI's sentence: the number with its caveat, the change with its split, steady as steady", () => {
    const both = band((k) => 3.5 - (0.2 * k) / 89, (k) => 81 + (4 * k) / 89, 3), f = fitAge(both.vo2, TODAY, "male", { age: 28, kg: both.kgs })!, c = f.change!;
    expect(fitLine(f)).toBe(`Fitness age ${Math.round(f.fit.age)} (age 28) — the age at which the average healthy man in Norway's HUNT study has this VO2 max (${f.vo2.toFixed(1)} this week, the band's estimate: trust the trend more than the number). `
      + `8 weeks ago ${Math.round(c.thenFit.age)}: ${c.years} years younger now — fitness at the same weight: ${c.fitness} years younger; the ${c.kgLost!.toFixed(1)} kg lost: ${c.kg} years younger (VO2 max is per kg).`);
    const flat = band(() => 3.6, () => 80, 7, 0.2);
    expect(fitLine(fitAge(flat.vo2, TODAY, "male")!)).toMatch(/ Steady over 8 weeks \(VO2 max 4\d\.\d → 4\d\.\d\)\.$/);
  });
});
