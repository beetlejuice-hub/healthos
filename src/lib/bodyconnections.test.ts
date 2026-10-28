// Owner, 27 Oct: "make sure it can find connections between things i log like feeling weak and what I've been doing".
// Sleep and steps from the band, your own sleep rating, and body words from check-in notes, in the pattern finder.
import { describe, expect, it } from "vitest";
import { feelWorld, rng } from "./bench";
import { bodyWords } from "./bodywords";
import type { DayFacts } from "./insights";
import { LEAD, pickLead } from "./ai/lead";
import { scout, signals } from "./scout";
import { addDays } from "./time";

/**
 * 90 days of a person (lib/bench), plus the band's sleep (~7 h ± 50 min), steps, and a check-in note on rated days.
 * Planted when asked: `sleepEnergy` — energy that day +1.3 an hour of sleep; `weakAfterDrinks` — "felt weak" the day after
 * 42 g of alcohol 7 in 10 times, else 1 in 20; `weakShortSleep` — "felt weak" after under 6 h 7 in 10 times. Otherwise
 * "weak" and "tired" turn up at random on 1 day in 8 (noise, so the words exist as signals in the controls too).
 */
function world(seed: number, plant: { sleepEnergy?: boolean; weakAfterDrinks?: boolean; weakShortSleep?: boolean; weakLessSleep?: boolean } = {}): DayFacts[] {
  const f = feelWorld({ seed, days: 90 }), { r, g } = rng(seed + 500);
  f.forEach((d, i) => {
    d.day = addDays("2026-07-29", i);
    d.asleepMin = Math.round(420 + g() * 50);
    d.steps = Math.round(8000 + g() * 2500);
    if (plant.sleepEnergy && d.energy != null) d.energy = Math.max(1, Math.min(10, Math.round(d.energy + (d.asleepMin / 60 - 7) * 1.3)));
    if (d.energy == null) { d.felt = null; return; }
    const prev = f[i - 1], words: string[] = [];
    const after = plant.weakAfterDrinks && prev && prev.alcoholG >= 28, short = plant.weakShortSleep && d.asleepMin < 360;
    // graded: 5 % at 7 h, +35 points for each hour under it (6 h → 40 %, 5 h 30 → 58 %)
    const graded = plant.weakLessSleep ? Math.min(0.9, 0.05 + Math.max(0, 7 - d.asleepMin / 60) * 0.35) : null;
    if (graded != null ? r() < graded : after || short ? r() < 0.7 : r() < (plant.weakAfterDrinks || plant.weakShortSleep ? 0.05 : 0.125)) words.push("weak");
    if (r() < 0.125) words.push("tired");
    d.felt = words;
  });
  return f;
}
const has = (ps: ReturnType<typeof scout>, a: string, b: string, lag?: number) => ps.some((p) => ((p.a.id === a && p.b.id === b) || (p.a.id === b && p.b.id === a)) && (lag == null || p.lag === lag));
const count = (n: number, f: (s: number) => boolean) => Array.from({ length: n }, (_, s) => f(s + 1)).filter(Boolean).length;

describe("body words from check-in notes", () => {
  it("whole words, said not denied, idioms left out", () => {
    expect(bodyWords("felt weak after the gym, bit of a headache")).toEqual(["weak", "headache"]);
    expect(bodyWords("great weekend")).toEqual([]);
    expect(bodyWords("not tired at all")).toEqual([]);
    expect(bodyWords("so sick of work")).toEqual([]);
    expect(bodyWords("feeling ill, exhausted")).toEqual(["tired", "sick"]);
    expect(bodyWords(undefined)).toEqual([]);
  });
  it("a word joins the finder once it's on 4+ days; a day without a check-in is unknown, not a day without it", () => {
    const f = world(3);
    const weak = signals([], f).find((s) => s.id === "felt-weak")!;
    expect(weak.yes).toBe("a day you felt weak");
    expect(weak.get({ ...f[0], felt: null })).toBeNull();
    expect(weak.get({ ...f[0], felt: [] })).toBe(0);
    expect(signals([], f.map((d) => ({ ...d, felt: d.felt ? d.felt.filter((w) => w !== "weak") : d.felt }))).some((s) => s.id === "felt-weak")).toBe(false);
  });
});

describe("connections with sleep, steps and how your body felt", () => {
  it("planted: an hour more sleep → more energy that day — found in 27+ of 30 people", () => {
    expect(count(30, (s) => has(scout(world(s, { sleepEnergy: true }), []), "asleep", "energy", 0))).toBeGreaterThanOrEqual(27);
  }, 30_000);
  it("planted: drinks → feeling weak the next day — found in 27+ of 30, as 'the next day'", () => {
    expect(count(30, (s) => has(scout(world(s, { weakAfterDrinks: true }), []), "alcohol", "felt-weak", 1))).toBeGreaterThanOrEqual(27);
  }, 30_000);
  // power, measured (27 Oct): 17 of 30 at 90 days — the finder is strict on purpose (chance kept at its calibrated rate);
  // a pattern like this shows for about half to two thirds of people within 90 days, and firms up as days come in
  it("planted: the less you sleep, the likelier you feel weak that day — found in 15+ of 30 at 90 days", () => {
    expect(count(30, (s) => has(scout(world(s, { weakLessSleep: true }), []), "asleep", "felt-weak", 0))).toBeGreaterThanOrEqual(15);
  }, 30_000);
  it("power, said plainly: only under 6 h makes it likelier, ~7 such nights in 90 days — found in about half (12+ of 30)", () => {
    expect(count(30, (s) => has(scout(world(s, { weakShortSleep: true }), []), "asleep", "felt-weak", 0))).toBeGreaterThanOrEqual(12);
  }, 30_000);
  it("the sentence says it the way you'd say it, on the right day", () => {
    const p = scout(world(4, { weakAfterDrinks: true }), []).find((x) => x.a.id === "alcohol" && x.b.id === "felt-weak")!;
    expect(p.text).toBe("With more alcohol, you felt weak the next day more often");
    const q = scout(world(4, { weakLessSleep: true }), []).find((x) => x.a.id === "asleep" && x.b.id === "felt-weak")!;
    expect(q.text).toBe("With more sleep, you felt weak that day less often");
  });
  it("control: sleep, steps and the words as noise — the new signals flag a pattern for at most 1 in 10, and lead for at most 5 in 100", () => {
    const fresh = (ps: ReturnType<typeof scout>) => ps.filter((p) => [p.a.id, p.b.id].some((id) => ["asleep", "steps", "sleepRating"].includes(id) || id.startsWith("felt-")));
    expect(count(100, (s) => fresh(scout(world(s), [])).length > 0)).toBeLessThanOrEqual(10);
    expect(count(100, (s) => { const p = pickLead(scout(world(s), []), [], "2026-10-27"); return !!p && p.p < LEAD.maxP; })).toBeLessThanOrEqual(5);
  }, 30_000);
});
