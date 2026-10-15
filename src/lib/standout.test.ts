import { describe, expect, it } from "vitest";
import { standout, standouts } from "./standout";
import { sleepScore } from "./sleepscore";
import { atMinute } from "./time";
import type { Evening, Night } from "./sleep";

const H = 3_600_000, MIN = 60_000;
/** A night from the evening of day `k` (Sept), in bed at `bedH`, asleep 12 min later, `asleepMin` asleep. */
function night(k: number, o: Partial<Night> & { bedH?: number; asleepMin?: number } = {}): Night {
  const eve = `2026-09-${String(k).padStart(2, "0")}`, bed = atMinute(eve, Math.round((o.bedH ?? 23) * 60)), asleep = o.asleepMin ?? 460;
  return { id: `n${k}`, day: `2026-09-${String(k + 1).padStart(2, "0")}`, eve, bed, up: bed + (asleep + 25) * MIN, onset: bed + 12 * MIN, wake: bed + (asleep + 20) * MIN,
    asleep, deep: asleep * 0.15, rem: asleep * 0.22, light: asleep * 0.63, awake: 10, wakes: 1, latency: 12, stages: [], low: 50, lowAt: bed + 4 * H, meanHr: 54, hrv: 50, rhr: 54, nap: null, ...o };
}
const usualNights = Array.from({ length: 12 }, (_, i) => night(i + 1));
const eve = (o: Partial<Evening> = {}): Evening => ({ drinks: [], caffeineAtBed: 0, trained: false, ateLate: false, rating: 7, tags: [], phoneMin: 0, ...o });
const S = (n: Night, e: Evening) => standout(n, e, [...usualNights, n], sleepScore(n, e.rating, [...usualNights, n]));
const drinks = (k: number) => Array.from({ length: k }, (_, i) => atMinute("2026-09-20", 19 * 60 + i * 40));

describe("the one thing that stood out that night (owner, 15 Oct)", () => {
  it("an ordinary evening, nothing logged, usual bedtime: nothing shown", () => {
    expect(S(night(20), eve())).toBeNull();
    expect(standout(night(20), undefined, usualNights)).toBeNull();
  });
  it("drunk outweighs the rest: 4 drinks over \"with gf\" and an hour on the phone", () => {
    expect(S(night(20), eve({ drinks: drinks(4), tags: ["gf"], phoneMin: 60 }))!.label).toBe("4 drinks");
  });
  it("one drink with nothing off doesn't beat a 2-hour-late night", () => {
    const s = S(night(20, { bedH: 25.5 }), eve({ drinks: drinks(1) }));
    expect([s!.id, s!.label]).toEqual(["late", "late night — asleep 01:42"]);
  });
  it("late against your usual and the study's window, whichever is less: an owl's usual 00:30 isn't a late night", () => {
    const owls = Array.from({ length: 12 }, (_, i) => night(i + 1, { bedH: 24.3 }));
    const n = night(20, { bedH: 24.5 });
    expect(standout(n, eve(), [...owls, n], sleepScore(n, 7, [...owls, n]))).toBeNull();
    expect(S(night(20, { bedH: 24.5 }), eve())!.id).toBe("late"); // usual 23:12 → 1 h 30 later
  });
  it("the night's own numbers say it beside the thing — and tip the pick to what they point at", () => {
    // gf (0.5) against ~45 min of phone (0.45): an ordinary night keeps "with gf"; taking 50 min to fall asleep moves it to the phone
    expect(S(night(20), eve({ tags: ["gf"], phoneMin: 45 }))!.label).toBe("with gf");
    const slow = S(night(20, { latency: 50, onset: night(20).bed + 50 * MIN }), eve({ tags: ["gf"], phoneMin: 45 }));
    expect([slow!.label, slow!.also]).toEqual(["phone ~45 min before sleep", "50 min to fall asleep"]);
  });
  it("drinks with HRV 25 % under: said as \"and\", not as a cause", () => {
    const s = S(night(20, { hrv: 37.5 }), eve({ drinks: drinks(2) }));
    expect([s!.label, s!.also]).toEqual(["2 drinks", "HRV 25 % under your usual"]);
    expect(S(night(20), eve({ drinks: drinks(2) }))!.also).toBeNull();
  });
  it("caffeine still in you at bed beats training late; under 30 mg isn't a thing", () => {
    expect(S(night(20), eve({ caffeineAtBed: 84, lateTrain: true }))!.label).toBe("~80 mg caffeine at bed");
    expect(S(night(20), eve({ caffeineAtBed: 25, lateTrain: true }))!.label).toBe("trained late");
  });
  it("your own words, stress, a late meal and a nap all count; unknowns (not asked) don't", () => {
    expect(S(night(20), eve({ tags: ["birthday party"] }))!.label).toBe("birthday party");
    expect(S(night(20), eve({ eveStress: 9 }))!.label).toBe("stressed evening, 9/10");
    expect(S(night(20), eve({ lastMealMin: 50 }))!.label).toBe("ate 50 min before bed");
    expect(S(night(20, { nap: { start: 0, end: 0, min: 45 } }), eve())!.label).toBe("napped 45 min");
    expect(S(night(20), eve({ tags: null, phoneMin: null, eveStress: null, lastMealMin: null }))).toBeNull();
  });
  it("all of them, most significant first", () => {
    const all = standouts(night(20, { bedH: 25 }), eve({ drinks: drinks(3), caffeineAtBed: 60, tags: ["out"], phoneMin: 60 }), usualNights);
    expect(all.map((x) => x.id)).toEqual(["drinks", "caf", "late", "phone", "tag:out"]);
  });
});
