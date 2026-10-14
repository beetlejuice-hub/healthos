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

describe("a night out of 100 (PLAN 97, checked against Fitbit, Oura and the NSF 14 Oct)", () => {
  it("a full night on every count, rated 10: 100, \"great\"; the parts add to 100", () => {
    const s = sleepScore(night(20), 10, usualNights);
    expect(s.score).toBe(100); expect(s.word).toBe("great"); expect(s.left).toEqual([]);
    expect(s.parts.map((p) => p.max).reduce((a, b) => a + b, 0)).toBe(100);
    expect(s.parts.map((p) => [p.id, p.max])).toEqual([["length", 35], ["continuity", 15], ["onset", 5], ["deep", 7], ["rem", 8], ["timing", 10], ["heart", 5], ["rating", 15]]);
  });
  it("length: 5 h asleep (2 h under the 7) loses 25 of its 35; with the short night's timing, 70 — \"fair\"; 6 h → 86, \"good\" — not great", () => {
    const s = sleepScore(night(20, { asleepMin: 300, bedH: 25 }), 10, usualNights);
    expect(s.parts.find((p) => p.id === "length")!.got).toBe(10); expect(s.score).toBe(70); expect(s.word).toBe("fair");
    const six = sleepScore(night(20, { asleepMin: 360, bedH: 24.5 }), 10, usualNights);
    expect(six.score).toBe(86); expect(six.word).toBe("good");
  });
  it("more sleep never lowers it up to 9 h 30 (in bed as usual, up later); an 11-hour lie-in costs 10 — 5 for length past 10 h, 5 for waking 3 h late", () => {
    const at = (m: number) => sleepScore(night(20, { asleepMin: m }), 8, usualNights).score;
    for (let m = 240; m < 570; m += 15) expect(at(m + 15)).toBeGreaterThanOrEqual(at(m));
    expect(at(570) - at(660)).toBe(10);
  });
  it("not rated yet: the rating is left out and named, the rest scaled to 100 — a 5-hour night is still only fair", () => {
    const s = sleepScore(night(20), null, usualNights);
    expect(s.left.map((l) => l.id)).toEqual(["rating"]); expect(s.score).toBe(100);
    const five = sleepScore(night(20, { asleepMin: 300, bedH: 25 }), null, usualNights);
    expect(five.score).toBe(65); expect(five.word).toBe("fair"); // 55 of 85
  });
  it("your rating counts 15: a 5/10 morning takes 7.5 off a full night", () => {
    expect(sleepScore(night(20), 5, usualNights).score).toBe(93);
  });
  it("no stages from the band: deep and REM left out, not counted as none", () => {
    const s = sleepScore(night(20, { deep: null, rem: null }), 10, usualNights);
    expect(s.left.map((l) => l.id)).toEqual(["deep", "rem"]); expect(s.score).toBe(100);
  });
  it("deep and REM by their share: 6.5 % deep is half of deep's 7; 10 % REM half of REM's 8", () => {
    const s = sleepScore(night(20, { deep: 480 * 0.065, rem: 480 * 0.1 }), 10, usualNights);
    expect(s.parts.find((p) => p.id === "deep")!.got).toBe(3.5); expect(s.parts.find((p) => p.id === "rem")!.got).toBe(4);
  });
  it("continuity, by the NSF's marks: 40 min awake is half of its 7; three long wakings a third of 3; 75 % asleep in bed half of 5", () => {
    const c = (o: Partial<Night>) => sleepScore(night(20, o), 10, usualNights).parts.find((p) => p.id === "continuity")!;
    expect(c({ awake: 40 }).got).toBe(10.6); // (3.5 + 5 of the 12 known) × 15
    const bed = atMinute("2026-09-20", 23 * 60 + 30), aw = (h: number, min: number) => ({ type: "awake" as const, start: bed + h * H, end: bed + h * H + min * MIN });
    const three = c({ stages: [aw(2, 8), aw(3, 12), aw(5, 6), aw(6, 3)] }); // the 3-min one doesn't count
    expect(three.got).toBe(13); expect(three.why).toBe("10 min awake · 3 wakings over 5 min · 95 % of bed asleep");
    expect(c({ up: bed + 640 * MIN }).got).toBe(11.9); // 480 of 640 min in bed asleep: 75 %
  });
  it("falling asleep, by the NSF's 30 minutes: 25 min is full, 45 half, an hour none", () => {
    const o = (l: number) => sleepScore(night(20, { latency: l }), 10, usualNights).parts.find((p) => p.id === "onset")!.got;
    expect([o(25), o(45), o(60)]).toEqual([5, 2.5, 0]);
  });
  it("timing: falling asleep and waking against your usual, averaged — within 45 min full; 2 h 30 off none; says both", () => {
    const t = (o: Partial<Night> & { bedH?: number; asleepMin?: number }) => sleepScore(night(20, o), 10, usualNights).parts.find((p) => p.id === "timing")!;
    expect(t({ bedH: 26 }).got).toBe(0); expect(t({ bedH: 26 }).why).toBe("asleep 2 h 30 later than usual · up 2 h 30 later than usual");
    expect(t({ bedH: 24.1 }).got).toBe(10);
    expect(t({ bedH: 22.5 }).got).toBe(8.3); expect(t({ bedH: 22.5 }).why).toBe("asleep 1 h 00 earlier than usual · up 1 h 00 earlier than usual");
    // 2 h late to bed, up at the usual time: an hour off on average — not hidden as the middle of the night (40 min) would
    const late = t({ bedH: 25.5, asleepMin: 360 });
    expect(late.got).toBe(8.3); expect(late.why).toBe("asleep 2 h 00 later than usual · up at your usual time");
  });
  it("heart: HRV at 90 % of your usual is half; without HRV the lowest heart rate, 4 bpm over usual half", () => {
    expect(sleepScore(night(20, { hrv: 45 }), 10, usualNights).parts.find((p) => p.id === "heart")!.got).toBe(2.5);
    const noHrv = sleepScore(night(20, { hrv: null, low: 54 }), 10, usualNights).parts.find((p) => p.id === "heart")!;
    expect(noHrv.got).toBe(2.5); expect(noHrv.why).toBe("lowest 54 bpm · usual 50");
  });
  it("the usual is the 28 nights before this one: later nights, and ones over 4 weeks back, don't move it", () => {
    const n = night(20, { bedH: 24.5 }), base = sleepScore(n, 10, usualNights);
    // 15 of each — more than the 10 usual nights, so a median would move if they counted
    const later = Array.from({ length: 15 }, (_, i) => ({ ...night(1, { bedH: 26 }), id: `l${i}`, day: `2026-10-${String(1 + i).padStart(2, "0")}`, eve: `2026-09-${String(30 - i).padStart(2, "0")}` }));
    expect(sleepScore(n, 10, [...usualNights, ...later]).score).toBe(base.score);
    const longAgo = Array.from({ length: 15 }, (_, i) => ({ ...night(1, { bedH: 26 }), id: `o${i}`, day: `2026-07-${String(1 + i).padStart(2, "0")}`, eve: `2026-06-${String(30 - i).padStart(2, "0")}` }));
    expect(sleepScore(n, 10, [...usualNights, ...longAgo]).score).toBe(base.score);
  });
  it("too few other nights for a usual: timing and heart left out, not guessed", () => {
    const s = sleepScore(night(20), 10, usualNights.slice(0, 3));
    expect(s.left.map((l) => l.id)).toEqual(["timing", "heart"]); expect(s.score).toBe(100);
  });
  it("a measure missing from the band (undefined, NaN) is left out — never a NaN score", () => {
    const s = sleepScore(night(20, { awake: undefined as unknown as number, latency: Number.NaN }), 10, usualNights);
    expect(Number.isFinite(s.score)).toBe(true); expect(s.left.map((l) => l.id)).toEqual(["onset"]); expect(s.score).toBe(100);
    expect(Number.isFinite(sleepScore(night(20, { asleepMin: Number.NaN }), 10, usualNights).score)).toBe(true);
  });
  it("the words, as Fitbit's bands: 90+ great, 80+ good, 60+ fair, under that rough", () => {
    expect([95, 90, 89, 80, 79, 60, 59].map(scoreWord)).toEqual(["great", "great", "good", "good", "fair", "fair", "rough"]);
  });
});
