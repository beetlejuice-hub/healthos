// How you compare (PLAN 206: the card's comparisons without the game). Known answers: right at every study's average is
// "about 50 %"; one spread better is about 85 %; lower resting heart rate is ahead. Controls: no age, no endurance; no band,
// nothing said; the ends kept between 5 and 95.
import { describe, expect, it } from "vitest";
import { compareOf, middle, pctWords } from "./card";
import { vo2At } from "./fitage";

const avg = { vo2: vo2At(34, "male"), age: 34, sex: "male" as const, rhr: 65, asleepMin: 407, steps: 4961, strPerWeek: 0 };
const words = (c: ReturnType<typeof compareOf>) => c.map((s) => (s.p == null ? null : pctWords(s.p)));

describe("how you compare", () => {
  it("right at every average: about 50 % on each", () => {
    expect(words(compareOf(avg))).toEqual(new Array(5).fill("about 50 %"));
  });
  it("one spread better is about 85 %; one worse about 15 %; lower resting heart rate is ahead", () => {
    expect(words(compareOf({ ...avg, vo2: avg.vo2 + 8, rhr: 57, asleepMin: 407 - 48, steps: 4961 + 2684 }))).toEqual(["about 85 %", "about 85 %", "about 15 %", "about 85 %", "about 50 %"]);
  });
  it("says who it's against: men 30–39 for VO2 max", () => {
    expect(compareOf(avg)[0].against).toBe("healthy men 30–39 (HUNT)");
  });
  it("controls: no age — endurance waits; no band — nothing said; the ends kept between 5 and 95", () => {
    expect(compareOf({ ...avg, age: null })[0]).toMatchObject({ p: null, says: "needs your age in Settings" });
    expect(compareOf({}).every((s) => s.p == null)).toBe(true);
    expect([pctWords(0.001), pctWords(0.999)]).toEqual(["about 5 %", "about 95 %"]);
    expect([middle([3, 1, 2]), middle([4, 1, 2, 3]), middle([])]).toEqual([2, 2.5, null]);
  });
});
