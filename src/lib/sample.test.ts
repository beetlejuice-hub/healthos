import { describe, expect, it } from "vitest";
import { makeSample, PLANTED } from "./sample";
import { dailyFacts, pairs } from "./insights";
import { scout } from "./scout";
import { personalSleep, ratedNights } from "./caffeine-sleep";
import { DEFAULT_SETTINGS } from "./store";
import type { Supplement } from "./types";
import { addDays, localDay } from "./time";

// PLAN 151 (owner, 30 Sept: "plant a known effect in fake data and check you find it, and check you DON'T find effects
// that aren't there"): the sample is built with known effects; the control is the same days with every effect off.
const NOW = new Date(2026, 9, 21, 15, 0).getTime(), today = localDay(NOW);
const stack: Supplement[] = ["creatine", "vitd", "cumin", "mag", "saffron"].map((id) => ({ id, name: id, dose: "", slot: "morning", at: 480, active: true }) as Supplement);
const world = (effects: boolean) => {
  const { entries, workouts } = makeSample(NOW, 60, { effects });
  const facts = dailyFacts(entries, workouts, DEFAULT_SETTINGS, addDays(today, -60), addDays(today, -1));
  return { entries, facts, sleep: personalSleep(ratedNights(entries, DEFAULT_SETTINGS.halfLifeMin, PLANTED.bedMinute)), pairs: pairs(facts), scout: scout(facts, stack) };
};
const planted = world(true), control = world(false);
const pair = (w: typeof planted, id: string) => w.pairs.find((p) => p.id === id)!.r!;
const found = (w: typeof planted, a: string, b: string, lag: 0 | 1) => w.scout.some((p) => p.a.id === a && p.b.id === b && p.lag === lag);

describe("the sample has what the review needs", () => {
  it("a sleep rating most mornings, with both kinds of night to compare", () => {
    expect(planted.entries.filter((e) => e.kind === "sleep" && e.rating != null).length).toBeGreaterThan(45);
    expect(planted.sleep.withN).toBeGreaterThanOrEqual(15);
    expect(planted.sleep.withoutN).toBeGreaterThanOrEqual(15);
  });
  it("the control is the same days: same entries, only the ratings differ", () => {
    const shape = (es: typeof planted.entries) => es.map((e) => `${e.kind}@${e.at}`).join();
    expect(shape(control.entries)).toBe(shape(planted.entries));
  });
});

describe("planted effects are found", () => {
  it("caffeine left at bedtime → a worse night, about as much as planted", () => {
    expect(planted.sleep.state).toBe("worse");
    expect(planted.sleep.lo!).toBeLessThan(PLANTED.cafSleep);
    expect(planted.sleep.hi!).toBeGreaterThan(PLANTED.cafSleep);
  });
  it("alcohol → less energy and a lower mood the next day", () => {
    expect(pair(planted, "alc-energy").clear && pair(planted, "alc-energy").value < 0).toBe(true);
    expect(pair(planted, "alc-mood").clear && pair(planted, "alc-mood").value < 0).toBe(true);
  });
  it("the pattern finder: protein → next-day energy, late caffeine → focus, alcohol → energy", () => {
    expect(found(planted, "protein", "energy", 1)).toBe(true);
    expect(found(planted, "lateCaf", "focus", 1)).toBe(true);
    expect(found(planted, "alcohol", "energy", 1)).toBe(true);
  });
});

describe("nothing is found where nothing was planted", () => {
  it("caffeine at bedtime: no difference in the control", () => {
    expect(control.sleep.state).toBe("no-difference");
  });
  it("the planted pairs are not there", () => {
    for (const id of ["caf-energy", "caf-focus", "alc-energy", "alc-mood"]) expect(pair(control, id).clear).toBe(false);
  });
  it("the pattern finder doesn't find the planted ones in the control", () => {
    expect(found(control, "protein", "energy", 1) || found(control, "lateCaf", "focus", 1) || found(control, "alcohol", "energy", 1)).toBe(false);
  });
});
