// PLAN 228 — change points. Known answers: a resting heart rate of 54 that steps to 58 on a known day is found there (±3
// days), with before ≈ 54 and after ≈ 58; across fake people: steps called in noise and in steady slopes rarely, in a
// smooth weight decline never; a planted step of 2 spreads found near its day (less often when days carry over).
import { describe, expect, it } from "vitest";
import { changePoints } from "./changepoint";
import { addDays } from "./time";

const START = "2026-06-01";
function gauss(seed: number) { let s = seed >>> 0; const u = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; return () => { let x = 0; for (let i = 0; i < 12; i++) x += u(); return x - 6; }; }
const series = (seed: number, n: number, phi: number, step: number, at: number, base = 54, sd = 1.5) => {
  const g = gauss(seed); let a = g(); const s: Record<string, number> = {};
  for (let i = 0; i < n; i++) { a = phi * a + Math.sqrt(1 - phi * phi) * g(); s[addDays(START, i)] = base + sd * a + (i >= at ? step : 0); }
  return s;
};
const slope = (seed: number, phi: number, perDay: number) => { const s = series(seed + phi * 1e4, 120, phi, 0, 0); return Object.fromEntries(Object.entries(s).map(([d, v], i) => [d, v + perDay * i])); };
const weightFall = (seed: number) => { let x = seed; const r = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  const s: Record<string, number> = {}; for (let i = 0; i < 90; i++) s[addDays("2026-08-01", i)] = 81 - (2.4 * i) / 89 + (r() + r() + r() - 1.5) * 0.3; return s; };
const dist = (a: string, b: string) => Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / 864e5));

describe("change points", () => {
  it("a step from 54 to 58 is found near its day, with its levels", () => {
    const cs = changePoints(series(3, 120, 0.3, 4, 70));
    expect(cs).toHaveLength(1);
    expect(dist(cs[0].day, addDays(START, 70))).toBeLessThanOrEqual(3);
    // the step itself ≈ 4; the levels are the week either side, so a week's noise (about ±1) in each
    expect(cs[0].step).toBeGreaterThan(3); expect(cs[0].step).toBeLessThan(5.5); // 100 fake people: median 4.17, 80 % within 3.3–4.9
    expect(cs[0].before).toBeGreaterThan(52); expect(cs[0].before).toBeLessThan(56);
    expect(cs[0].after).toBeGreaterThan(56); expect(cs[0].after).toBeLessThan(60);
  });
  it("too few days: nothing", () => expect(changePoints(series(1, 10, 0, 4, 5))).toEqual([]));
  const rate = (f: (k: number) => boolean, n = 200) => { let c = 0; for (let k = 0; k < n; k++) if (f(k)) c++; return c / n; };
  // measured 24 Nov, 200 fake people each, 120 days (carry-over 0 / 0.5 / 0.8): a step called in noise 0 / 3.5 / 6.5 %, in a
  // steady slope (6 bpm over 120 days) 0.5 / 3.5 / 7.5 %, in a smooth 2.4 kg decline over 90 days 0 %; a step of 2 spreads
  // found within a week of its day in 91 / 36 / 16 % — when days carry over, a step and a wander look alike, and it says
  // less rather than more
  it("control: noise that wanders, and a steady slope — a step called in few; a smooth decline never", () => {
    expect(rate((k) => changePoints(series(k + 1, 120, 0, 0, 0)).length > 0)).toBeLessThan(0.03);
    expect(rate((k) => changePoints(series(k + 1 + 0.5e4, 120, 0.5, 0, 0)).length > 0)).toBeLessThan(0.07);
    expect(rate((k) => changePoints(series(k + 1 + 0.8e4, 120, 0.8, 0, 0)).length > 0)).toBeLessThan(0.11);
    expect(rate((k) => changePoints(slope(k + 3, 0.5, 0.05)).length > 0)).toBeLessThan(0.07);
    expect(rate((k) => changePoints(weightFall(k + 1)).length > 0, 100)).toBe(0);
  });
  it("planted: a step on day 60 of 120 — found near its day", () => {
    const near = (phi: number, step: number) => rate((k) => changePoints(series(k + 7 + phi * 1e4, 120, phi, step, 60)).some((c) => dist(c.day, addDays(START, 60)) <= 7));
    expect(near(0, 3)).toBeGreaterThan(0.85);
    expect(near(0.5, 3)).toBeGreaterThan(0.28);
  });
});
