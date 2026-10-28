// PLAN 178 phase 2 — how's your body? as chips with how much (owner, 28 Oct, picked C: "tap once a bit, twice a lot").
// The chips' rules; a day's words at their strongest; and that "how much" earns its place — with levels the finder finds
// a planted link in more people than with yes/no alone, and nothing in the control.
import { describe, expect, it } from "vitest";
import { feelWorld, rng } from "./bench";
import { bodyKeys, bodyLine, bodyOrder, BODY_CHIPS, feltOn, nextLevel } from "./bodywords";
import { dailyFacts, type DayFacts } from "./insights";
import { leadSeries } from "./ai/lead";
import { scout, signals } from "./scout";
import type { Settings } from "./store";
import { addDays, atMinute } from "./time";
import type { Entry, EntryOf } from "./types";

const feel = (at: number, x: Partial<EntryOf<"feel">> = {}): EntryOf<"feel"> => ({ id: `f${at}`, kind: "feel", at, ...x });

describe("the chips", () => {
  it("one tap a bit, two a lot, a third clears it", () => {
    expect(nextLevel(undefined)).toBe(1); expect(nextLevel(1)).toBe(2); expect(nextLevel(2)).toBeUndefined();
  });
  it("your own words: a body word files under its chip, anything else stays yours, several at once", () => {
    expect(bodyKeys("exhausted, knee pain and nausea")).toEqual(["tired", "knee-pain", "nauseous"]);
    expect(bodyKeys("  ")).toEqual([]);
  });
  it("the seven always, in order; your other words join once used (last 60 days), most used first", () => {
    const now = atMinute("2026-10-28", 12 * 60), D = 86_400_000;
    const es: Entry[] = [feel(now - D, { body: { "knee-pain": 1, nauseous: 2 } }), feel(now - 2 * D, { body: { "knee-pain": 2 } }), feel(now - 90 * D, { body: { cramps: 1 } })];
    expect(bodyOrder(es, now)).toEqual([...BODY_CHIPS, "knee-pain", "nauseous"]);
    expect(bodyLine({ weak: 2, "knee-pain": 1 })).toBe("weak ●●, knee pain ●");
    expect(bodyLine({ weak: 2, nauseous: 1 }, true)).toBe("weak (a lot), queasy (a bit)");
  });
});

describe("a day's body, from its check-ins", () => {
  it("each word at its strongest; a word in a note counts as a bit; no check-in is unknown, a check-in without is none", () => {
    expect(feltOn([feel(1, { note: "felt weak after lunch" }), feel(2, { body: { weak: 2, tired: 1 } })])).toEqual({ weak: 2, tired: 1 });
    expect(feltOn([feel(1, { note: "so tired" })])).toEqual({ tired: 1 });
    expect(feltOn([feel(1, { energy: 6 })])).toEqual({});
    expect(feltOn([])).toBeNull();
  });
  it("reaches the day's facts: chips and notes together, how much kept", () => {
    const settings = { halfLifeMin: 300, bedMinute: 1380, coffeeMg: 95, bodyKg: 78, usualDrink: null } as Settings;
    const es: Entry[] = [feel(atMinute("2026-10-27", 9 * 60), { body: { weak: 1 } }), feel(atMinute("2026-10-27", 18 * 60), { body: { weak: 2 }, note: "headache" })];
    const d = dailyFacts(es, [], settings, "2026-10-26", "2026-10-27");
    const day = d.find((x) => x.day === "2026-10-27")!;
    expect([...day.felt!].sort()).toEqual(["headache", "weak"]); expect(day.feltHow).toEqual({ weak: 2, headache: 1 });
    expect(d.find((x) => x.day === "2026-10-26")!.felt).toBeNull();
  });
});

/** 90 days, drinks graded 0 / 1 / 2 / 4 a night; "weak" the next day — `graded`: likelier and stronger with more drinks;
 *  `howOnly`: as likely any day, only how much follows the drinks; `none`: weak at random, a bit or a lot. */
function world(seed: number, plant: "graded" | "howOnly" | "none"): DayFacts[] {
  const f = feelWorld({ seed, days: 90 }), { r, g } = rng(seed + 900);
  f.forEach((d) => { const u = r(); d.alcoholG = u < 0.6 ? 0 : u < 0.75 ? 14 : u < 0.9 ? 28 : 56; d.asleepMin = Math.round(420 + g() * 50); d.steps = Math.round(8000 + g() * 2500); });
  f.forEach((d, i) => {
    d.day = addDays("2026-07-29", i);
    if (d.energy == null) { d.felt = null; return; }
    const drinks = (f[i - 1]?.alcoholG ?? 0) / 14, how: Record<string, number> = {};
    if (plant === "graded") { if (r() < 0.12 + 0.12 * drinks) how.weak = r() < 0.15 + 0.2 * drinks ? 2 : 1; }
    else if (plant === "howOnly") { if (r() < 0.4) how.weak = r() < 0.2 + 0.2 * drinks ? 2 : 1; }
    else if (r() < 0.25) how.weak = r() < 0.4 ? 2 : 1;
    if (r() < 0.125) how.tired = r() < 0.4 ? 2 : 1;
    d.felt = Object.keys(how); d.feltHow = how;
  });
  return f;
}
const yesNo = (f: DayFacts[]) => f.map((d) => ({ ...d, feltHow: undefined }));
const weakAfterDrinks = (ps: ReturnType<typeof scout>) => ps.some((p) => p.a.id === "alcohol" && p.b.id === "felt-weak" && p.lag === 1);
const count = (n: number, f: (s: number) => boolean) => Array.from({ length: n }, (_, s) => f(s + 1)).filter(Boolean).length;

describe("how much, in the pattern finder", () => {
  // measured (28 Oct, 60 people, 90 days): graded 34 with levels vs 25 yes/no only; how-much-only 0 vs 0; control 0 vs 0
  it("planted: more drinks, likelier and weaker the next day — how much finds it in more people than yes/no alone", () => {
    const lv = count(60, (s) => weakAfterDrinks(scout(world(s, "graded"), []))), yn = count(60, (s) => weakAfterDrinks(scout(yesNo(world(s, "graded")), [])));
    expect(lv).toBeGreaterThanOrEqual(30);
    expect(lv - yn).toBeGreaterThanOrEqual(5);
  });
  it("said honestly: when only how much follows the drinks, 90 days aren't enough — and the control finds nothing", () => {
    expect(count(30, (s) => weakAfterDrinks(scout(world(s, "howOnly"), [])))).toBeLessThanOrEqual(2);
    expect(count(60, (s) => weakAfterDrinks(scout(world(s, "none"), [])))).toBeLessThanOrEqual(2);
  });
  it("said as a share of days, a bit or a lot alike — never an average of levels", () => {
    const f = feelWorld({ seed: 9, days: 90 }), { r } = rng(77);
    f.forEach((d, i) => {
      d.day = addDays("2026-07-29", i); d.cigs = r() < 0.35 ? 5 : 0;
      if (d.energy == null) { d.felt = null; return; }
      const after = (f[i - 1]?.cigs ?? 0) > 0, how: Record<string, number> = {};
      if (r() < (after ? 0.75 : 0.08)) how.weak = after ? 2 : 1;
      d.felt = Object.keys(how); d.feltHow = how;
    });
    const p = scout(f, []).find((x) => x.a.id === "smoke" && x.b.id === "felt-weak")!;
    expect(p.onAvg!).toBeLessThanOrEqual(1);
    expect(p.text).toMatch(/^On the day after a smoking day, you felt weak more often \((\d+) % of days vs (\d+) %\)$/);
    const pct = +p.text.match(/\((\d+) %/)![1];
    expect(pct).toBeGreaterThan(55); expect(pct).toBeLessThanOrEqual(100);
  });
  it("your own words join on 4+ days and say it your way; a lead's chart rebuilds one it doesn't have", () => {
    const f = feelWorld({ seed: 5, days: 90 }), { r } = rng(55);
    f.forEach((d, i) => {
      d.day = addDays("2026-07-29", i);
      if (d.energy == null) { d.felt = null; return; }
      const how: Record<string, number> = {};
      if (r() < (f[i - 1]?.trained ? 0.7 : 0.05)) how["knee-pain"] = 1;
      d.felt = Object.keys(how); d.feltHow = how;
    });
    const p = scout(f, []).find((x) => x.b.id === "felt-knee-pain")!;
    expect(p.text).toMatch(/^On the day after a gym day, you noted knee pain more often \(\d+ % of days vs \d+ %\)$/);
    const three = f.map((d, i) => ({ ...d, felt: d.felt == null ? null : i < 30 && d.felt.length ? d.felt : [], feltHow: undefined })).map((d, i, a) => (a.slice(0, i).filter((x) => x.felt?.length).length >= 3 ? { ...d, felt: d.felt == null ? null : [] } : d));
    expect(signals([], three).some((s) => s.id === "felt-knee-pain")).toBe(false);
    const s = leadSeries({ id: "x", a: "gym", b: "felt-knee-pain", lag: 1 }, f, signals([], [], true), f.at(-2)!.day, 14)!;
    expect(s.b.name).toBe("knee pain"); expect(s.b.body).toBe(true);
    expect(s.b.vals.filter((v) => v != null).every((v) => v === 0 || v === 1)).toBe(true);
  });
});
