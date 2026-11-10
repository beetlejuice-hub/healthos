// PLAN 202 — owner, 10 Nov: "i want to hear how my day was compared to others". Known answers: the bell curve at its
// middle and at one and two spreads; 10,000 steps against the 4,961 ± 2,684 of 717,527 people is more than about 95 %;
// 6 h 47 asleep is the middle; a resting 54 is 11 under 65. Controls: nothing known says nothing; a 0 or a junk
// heart rate isn't compared.
import { describe, expect, it } from "vitest";
import { normalCdf, vsBest, vsBlock, vsOthers } from "./norms";

describe("you against everyone else", () => {
  it("the bell curve: half at the middle, 84 % at one spread, 98 % at two", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1)).toBeCloseTo(0.8413, 3);
    expect(normalCdf(-2)).toBeCloseTo(0.0228, 3);
  });
  it("steps, sleep and resting heart rate, each against its study", () => {
    expect(vsOthers({ steps: 10_000, sleepMin: 407, rhr: 54 })).toEqual([
      "Steps yesterday 10,000 — the average is 4,961; more than about 95 % of 717,527 people in 111 countries (Althoff 2017)",
      "Asleep last night 6 h 47 — the average is 6 h 47; longer than about 50 % of about 120,000 Fitbit wearers (Jaiswal 2020)",
      "Resting heart rate 54 — 11 under the average 65 of 92,457 Fitbit wearers (Quer 2020); lower is fitter",
    ]);
    expect(vsOthers({ steps: 3_000 })[0]).toMatch(/more than about 25 %/);
    expect(vsOthers({ sleepMin: 360 })[0]).toMatch(/Asleep last night 6 h 00 .* longer than about 15 %/);
  });
  it("control: nothing known, nothing said; a 0 or a junk heart rate isn't compared", () => {
    expect(vsOthers({})).toEqual([]);
    expect(vsOthers({ steps: 0, sleepMin: 0, rhr: 3 })).toEqual([]);
    expect(vsBlock([])).toEqual([]);
    expect(vsBlock(["x"])[0]).toMatch(/^## You against everyone else/);
  });
  it("the one for a small space: the furthest from the average, short", () => {
    expect(vsBest({ steps: 10_000, sleepMin: 407, rhr: 54 })).toBe("more steps yesterday than about 95 % of 717,527 people"); // 1.9 spreads vs 0 and 1.4
    expect(vsBest({ steps: 5_000, sleepMin: 407, rhr: 50 })).toBe("resting heart rate 15 under the average of 92,457 Fitbit wearers");
    expect(vsBest({ sleepMin: 330 })).toBe("shorter asleep last night than about 95 % of 120,000 Fitbit wearers");
    expect(vsBest({})).toBeNull();
  });
});
