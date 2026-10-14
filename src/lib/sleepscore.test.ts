import { describe, expect, it } from "vitest";
import { scoreWord, sleepScore } from "./sleepscore";
import { atMinute } from "./time";
import type { Night } from "./sleep";

const H = 3_600_000, MIN = 60_000;
/** A night from the evening of day `k` (Sept), in bed at `bedH` (23.5 = 23:30), `asleepMin` asleep, the rest as given. */
function night(k: number, o: Partial<Night> & { bedH?: number; asleepMin?: number } = {}): Night {
  const eve = `2026-09-${String(k).padStart(2, "0")}`, bed = atMinute(eve, Math.round((o.bedH ?? 23.5) * 60)), asleep = o.asleepMin ?? 480;
  return { id: `n${k}`, day: `2026-09-${String(k + 1).padStart(2, "0")}`, eve, bed, up: bed + (asleep + 25) * MIN, onset: bed + 10 * MIN, wake: bed + (asleep + 20) * MIN,
    asleep, deep: asleep * 0.15, rem: asleep * 0.22, light: asleep * 0.63, awake: 10, wakes: 1, latency: 10, stages: [], low: 50, lowAt: bed + 4 * H, hrv: 50, rhr: 54, nap: null, ...o };
}
const usualNights = Array.from({ length: 10 }, (_, i) => night(i + 1));

describe("a night out of 100 (PLAN 97)", () => {
  it("a full night on every count, rated 10: 100, \"great\"", () => {
    const s = sleepScore(night(20), 10, usualNights);
    expect(s.score).toBe(100); expect(s.word).toBe("great"); expect(s.left).toEqual([]);
    expect(s.parts.map((p) => p.max).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("length: 5 h asleep (2 h under the 7) loses 25 of its 35 → 75; 12.5 a missing hour", () => {
    const s = sleepScore(night(20, { asleepMin: 300 }), 10, usualNights);
    expect(s.parts.find((p) => p.id === "length")!.got).toBe(10); expect(s.score).toBe(75);
    expect(sleepScore(night(20, { asleepMin: 360 }), 10, usualNights).score).toBe(88);
  });
  it("more sleep never lowers it up to 10 h; a long lie-in past 10 h only a little", () => {
    const at = (m: number) => sleepScore(night(20, { asleepMin: m }), 8, usualNights).score;
    for (let m = 240; m < 600; m += 15) expect(at(m + 15)).toBeGreaterThanOrEqual(at(m));
    expect(at(660)).toBeGreaterThanOrEqual(at(600) - 5);
  });
  it("not rated yet: the rating is left out and named, the rest scaled to 100", () => {
    const s = sleepScore(night(20), null, usualNights);
    expect(s.left.map((l) => l.id)).toEqual(["rating"]); expect(s.score).toBe(100);
    expect(sleepScore(night(20, { asleepMin: 300 }), null, usualNights).score).toBe(69); // 55 of 80: a 5-hour night is "okay", not "good"
    expect(sleepScore(night(20, { asleepMin: 300 }), null, usualNights).word).toBe("okay");
  });
  it("your rating counts 20: a 5/10 morning takes 10 off a full night", () => {
    expect(sleepScore(night(20), 5, usualNights).score).toBe(90);
  });
  it("no stages from the band: deep and REM left out, not counted as none", () => {
    const s = sleepScore(night(20, { deep: null, rem: null }), 10, usualNights);
    expect(s.left.map((l) => l.id)).toEqual(["deep", "rem"]); expect(s.score).toBe(100);
  });
  it("deep and REM by their share: 6.5 % deep is half of deep's 10; 10 % REM half of REM's 10", () => {
    const s = sleepScore(night(20, { deep: 480 * 0.065, rem: 480 * 0.1 }), 10, usualNights);
    expect(s.parts.find((p) => p.id === "deep")!.got).toBe(5); expect(s.parts.find((p) => p.id === "rem")!.got).toBe(5);
  });
  it("restful and falling asleep: 45 min awake is half of 10; 40 min to fall asleep half of 5", () => {
    const s = sleepScore(night(20, { awake: 45, latency: 40 }), 10, usualNights);
    expect(s.parts.find((p) => p.id === "restful")!.got).toBe(5); expect(s.parts.find((p) => p.id === "onset")!.got).toBe(2.5);
  });
  it("timing against your usual bedtime: within 45 min full; 2 h 30 late none; says how late", () => {
    const late = sleepScore(night(20, { bedH: 26 }), 10, usualNights).parts.find((p) => p.id === "timing")!;
    expect(late.got).toBe(0); expect(late.why).toBe("in bed 2 h 30 later than usual");
    expect(sleepScore(night(20, { bedH: 24.1 }), 10, usualNights).parts.find((p) => p.id === "timing")!.got).toBe(5);
    expect(sleepScore(night(20, { bedH: 22.5 }), 10, usualNights).parts.find((p) => p.id === "timing")!.why).toBe("in bed 1 h 00 earlier than usual");
  });
  it("heart: HRV at 90 % of your usual is half; without HRV the lowest heart rate, 4 bpm over usual half", () => {
    expect(sleepScore(night(20, { hrv: 45 }), 10, usualNights).parts.find((p) => p.id === "heart")!.got).toBe(2.5);
    const noHrv = sleepScore(night(20, { hrv: null, low: 54 }), 10, usualNights).parts.find((p) => p.id === "heart")!;
    expect(noHrv.got).toBe(2.5); expect(noHrv.why).toBe("lowest 54 bpm · usual 50");
  });
  it("too few other nights for a usual: timing and heart left out, not guessed", () => {
    const s = sleepScore(night(20), 10, usualNights.slice(0, 3));
    expect(s.left.map((l) => l.id)).toEqual(["timing", "heart"]); expect(s.score).toBe(100);
  });
  it("a measure missing from the band (undefined, NaN) is left out — never a NaN score", () => {
    const s = sleepScore(night(20, { awake: undefined as unknown as number, latency: Number.NaN }), 10, usualNights);
    expect(Number.isFinite(s.score)).toBe(true); expect(s.left.map((l) => l.id)).toEqual(["restful", "onset"]); expect(s.score).toBe(100);
    expect(Number.isFinite(sleepScore(night(20, { asleepMin: Number.NaN }), 10, usualNights).score)).toBe(true);
  });
  it("the words: 85+ great, 70+ good, 55+ okay, under that rough", () => {
    expect([90, 85, 84, 70, 69, 55, 54].map(scoreWord)).toEqual(["great", "great", "good", "good", "okay", "okay", "rough"]);
  });
});
