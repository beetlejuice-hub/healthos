// PLAN 211 — where you stand out, where you're behind, and a fix. Known inputs, known answers; an ordinary person
// (the studies' averages, moderate logging) is the control: nothing stands out either way.
import { describe, expect, it } from "vitest";
import { compareOf } from "./card";
import { vo2At } from "./fitage";
import { standOut } from "./vsfix";

const avg = { vo2: vo2At(34, "male"), age: 34, sex: "male" as const, rhr: 65, asleepMin: 407, steps: 4961, strPerWeek: 0 };

describe("you vs everyone: stand-outs and fixes (PLAN 211)", () => {
  it("a low resting heart rate and long sleep stand out; 19 drinks a week and 1.1 g/kg protein are behind, each with a fix", () => {
    const r = standOut(compareOf({ ...avg, rhr: 54, asleepMin: 440 }), { drinksG: 266, loggedDays: 14, proteinGkg: 1.1, kg: 80, caffeineMg: 250 });
    expect(r.good.map((i) => i.key)).toEqual(["HRT", "SLP"]);
    expect(r.good[0].vs).toBe("lower than about 90 % of 92,457 Fitbit wearers (average 65)");
    expect(r.bad.map((i) => i.key)).toEqual(["alc", "pro"]);
    expect(r.bad[0].title).toBe("Drinks 19 a week (266 g)");
    expect(r.bad[0].vs).toMatch(/^2\.4× the UK's low-risk line/);
    expect(r.bad[1].fix).toBe("To 1.6 g per kg — about 40 g more a day.");
    expect(r.bad.every((i) => i.fix)).toBe(true);
  });
  it("short sleep and few steps: behind, with the study each fix comes from", () => {
    const r = standOut(compareOf({ ...avg, asleepMin: 340, steps: 2000 }), {});
    expect(r.bad.map((i) => i.key).sort()).toEqual(["PAC", "SLP"]);
    expect(r.bad.find((i) => i.key === "SLP")!.fix).toMatch(/Tasali/);
    expect(r.bad.find((i) => i.key === "PAC")!.fix).toMatch(/Banach 2023/);
  });
  it("control: the studies' averages and moderate logging — nothing stands out either way", () => {
    expect(standOut(compareOf(avg), { drinksG: 60, loggedDays: 14, proteinGkg: 1.3, kg: 80, caffeineMg: 200 })).toEqual({ good: [], bad: [] });
  });
  it("too little logging: drinks, protein and caffeine aren't judged", () => {
    expect(standOut(compareOf(avg), { drinksG: 400, loggedDays: 5, proteinGkg: 0.6, caffeineMg: 900 })).toEqual({ good: [], bad: [] });
  });
});
