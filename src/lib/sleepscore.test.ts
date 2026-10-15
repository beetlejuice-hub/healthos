import { describe, expect, it } from "vitest";
import { curveAt, scoreWord, sleepScore } from "./sleepscore";
import { atMinute } from "./time";
import type { Night } from "./sleep";

const H = 3_600_000, MIN = 60_000;
/** A night from the evening of day `k` (Sept), in bed at `bedH` (22.5 = 22:30), asleep 10 min later, `asleepMin` asleep. */
function night(k: number, o: Partial<Night> & { bedH?: number; asleepMin?: number } = {}): Night {
  const eve = `2026-09-${String(k).padStart(2, "0")}`, bed = atMinute(eve, Math.round((o.bedH ?? 22.5) * 60)), asleep = o.asleepMin ?? 480;
  return { id: `n${k}`, day: `2026-09-${String(k + 1).padStart(2, "0")}`, eve, bed, up: bed + (asleep + 25) * MIN, onset: bed + 10 * MIN, wake: bed + (asleep + 20) * MIN,
    asleep, deep: asleep * 0.15, rem: asleep * 0.22, light: asleep * 0.63, awake: 10, wakes: 1, latency: 10, stages: [], low: 50, lowAt: bed + 4 * H, meanHr: 54, hrv: 50, rhr: 54, nap: null, ...o };
}
const usualNights = Array.from({ length: 10 }, (_, i) => night(i + 1));
const p = (s: ReturnType<typeof sleepScore>, id: string) => s.parts.find((x) => x.id === id)!;

describe("a night out of 100, on the studies' ranges (PLAN 97; owner, 15 Oct)", () => {
  it("a full night on every count, rated 10: 100, \"great\"; with stages every part is in and they add to 100", () => {
    const aw = (h: number) => ({ type: "awake" as const, start: atMinute("2026-09-20", 22 * 60 + 30) + h * H, end: atMinute("2026-09-20", 22 * 60 + 30) + h * H + 3 * MIN });
    const s = sleepScore(night(20, { stages: [aw(3)] }), 10, usualNights);
    expect(s.score).toBe(100); expect(s.word).toBe("great"); expect(s.left).toEqual([]);
    expect(s.parts.reduce((a, x) => a + x.max, 0)).toBe(100);
    expect(s.parts.every((x) => x.zone === "ideal")).toBe(true);
  });
  it("your usual being poor doesn't make a poor night good (owner: \"if my usual is pretty bad, it will still show me a good score\")", () => {
    const fives = Array.from({ length: 10 }, (_, i) => night(i + 1, { asleepMin: 300 }));
    const s = sleepScore(night(20, { asleepMin: 300 }), 7, fives);
    expect(p(s, "length").got).toBe(6.3); expect(p(s, "length").zone).toBe("poor"); expect(p(s, "length").usualText).toBe("5 h 00");
    expect(s.word).not.toBe("great"); expect(s.word).not.toBe("good");
  });
  it("length on the NSF's ranges: 7–9 h ideal, 6–7 fair, under 6 poor", () => {
    const L = (m: number) => p(sleepScore(night(20, { asleepMin: m }), 10, usualNights), "length");
    expect([L(420).got, L(360).got, L(300).got, L(240).got]).toEqual([25, 15, 6.3, 0]);
    expect([L(480).zone, L(390).zone, L(330).zone, L(570).zone, L(630).zone]).toEqual(["ideal", "fair", "poor", "fair", "poor"]);
  });
  it("bedtime on the study's window, never against your usual: an earlier night than usual isn't marked down", () => {
    const late = Array.from({ length: 10 }, (_, i) => night(i + 1, { bedH: 25 }));
    const B = (bedH: number, base = usualNights) => p(sleepScore(night(20, { bedH }), 10, base), "bedtime");
    expect(B(22.3, late).got).toBe(5); expect(B(22.3, late).why).toBe("22:28"); expect(B(22.3, late).usualText).toBe("01:10");
    expect([B(23.3).zone, B(24.83).zone]).toEqual(["fair", "poor"]);
    expect(B(25.83).got).toBeLessThan(1.5);
  });
  it("continuity on the NSF's marks: asleep in bed, awake in the night, long wakings, falling asleep", () => {
    const c = (o: Partial<Night>) => sleepScore(night(20, o), 10, usualNights);
    const bed = atMinute("2026-09-20", 22 * 60 + 30);
    expect(p(c({ up: bed + 640 * MIN }), "efficiency").got).toBe(4); // 480 of 640 min: 75 % → fair, 4 of 10
    expect(p(c({ up: bed + 640 * MIN }), "efficiency").zone).toBe("fair");
    expect([p(c({ awake: 35 }), "waso").got, p(c({ awake: 50 }), "waso").got, p(c({ awake: 90 }), "waso").got]).toEqual([4.9, 2.8, 0]);
    const aw = (h: number, min: number) => ({ type: "awake" as const, start: bed + h * H, end: bed + h * H + min * MIN });
    const three = p(c({ stages: [aw(2, 8), aw(3, 12), aw(5, 6), aw(6, 3)] }), "wakings"); // the 3-min one doesn't count
    expect([three.got, three.why, three.zone]).toEqual([1.5, "3", "fair"]);
    expect([p(c({ latency: 25 }), "onset").got, p(c({ latency: 45 }), "onset").got, p(c({ latency: 75 }), "onset").got]).toEqual([5, 2.5, 0]);
  });
  it("no stages: wakings, deep and REM left out and named, not counted as none", () => {
    const s = sleepScore(night(20, { deep: null, rem: null }), 10, usualNights);
    expect(s.left.map((l) => l.id)).toEqual(["wakings", "deep", "rem"]); expect(s.score).toBe(100);
  });
  it("deep and REM by their share: 10 % deep is fair, 64 % of its 7; 15 % REM half of its 8", () => {
    const s = sleepScore(night(20, { deep: 48, rem: 72 }), 10, usualNights);
    expect([p(s, "deep").got, p(s, "deep").zone, p(s, "rem").got, p(s, "rem").zone]).toEqual([4.5, "fair", 4, "fair"]);
  });
  it("a night after wine: HRV 25 % under your usual and heart rate 5 bpm up — both red, whatever else", () => {
    const s = sleepScore(night(20, { hrv: 37.5, meanHr: 59 }), 6, usualNights);
    expect([p(s, "hrv").zone, p(s, "hrsleep").zone]).toEqual(["poor", "poor"]);
    expect(p(s, "hrv").why).toBe("38 ms · usual 50 (−25 %)"); expect(p(s, "hrsleep").why).toBe("59 bpm · usual 54");
    expect(p(s, "hrv").got + p(s, "hrsleep").got).toBeLessThan(5);
  });
  it("heart rate asleep falls back to the lowest when the band had too little of the night", () => {
    const s = sleepScore(night(20, { meanHr: null, low: 54 }), 10, usualNights.map((x) => ({ ...x, meanHr: null })));
    expect([p(s, "hrsleep").why, p(s, "hrsleep").zone]).toEqual(["lowest 54 bpm · usual 50", "fair"]);
  });
  it("not rated yet: left out and named, the rest scaled to 100", () => {
    const s = sleepScore(night(20), null, usualNights);
    expect(s.left.map((l) => l.id)).toEqual(["wakings", "rating"]); expect(s.score).toBe(100);
  });
  it("more sleep never lowers it up to 9 h", () => {
    const at = (m: number) => sleepScore(night(20, { asleepMin: m }), 8, usualNights).score;
    for (let m = 240; m < 540; m += 15) expect(at(m + 15)).toBeGreaterThanOrEqual(at(m));
  });
  it("the heart's usual is the 28 nights before this one: later nights and older ones don't move it", () => {
    const n = night(20, { hrv: 45 }), base = sleepScore(n, 10, usualNights);
    const later = Array.from({ length: 15 }, (_, i) => ({ ...night(1, { hrv: 90 }), id: `l${i}`, day: `2026-10-${String(1 + i).padStart(2, "0")}`, eve: `2026-09-${String(30 - i).padStart(2, "0")}` }));
    const older = Array.from({ length: 15 }, (_, i) => ({ ...night(1, { hrv: 90 }), id: `o${i}`, day: `2026-07-${String(1 + i).padStart(2, "0")}`, eve: `2026-06-${String(30 - i).padStart(2, "0")}` }));
    expect(sleepScore(n, 10, [...usualNights, ...later, ...older]).score).toBe(base.score);
  });
  it("too few nights for the heart's usual: HRV and heart rate asleep left out, not guessed", () => {
    const s = sleepScore(night(20), 10, usualNights.slice(0, 3));
    expect(s.left.map((l) => l.id)).toEqual(["wakings", "hrv", "hrsleep"]);
  });
  it("a measure missing from the band (undefined, NaN) is left out — never a NaN score", () => {
    const s = sleepScore(night(20, { awake: undefined as unknown as number, latency: Number.NaN }), 10, usualNights);
    expect(Number.isFinite(s.score)).toBe(true); expect(s.left.map((l) => l.id)).toEqual(["waso", "wakings", "onset"]);
    expect(Number.isFinite(sleepScore(night(20, { asleepMin: Number.NaN }), 10, usualNights).score)).toBe(true);
  });
  it("curves: straight between points, flat past the ends; words as Fitbit's bands", () => {
    expect([curveAt([[0, 0], [10, 1]], 5), curveAt([[0, 0], [10, 1]], -3), curveAt([[0, 0], [10, 1]], 12)]).toEqual([0.5, 0, 1]);
    expect([95, 90, 89, 80, 79, 60, 59].map(scoreWord)).toEqual(["great", "great", "good", "good", "fair", "fair", "rough"]);
  });
});
