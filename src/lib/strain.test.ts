// PLAN 227 — HRV status and training load. Known answers: 80 days of HRV around 60 ms (±8 %) — within its band; the last
// 8 days at 45 ms — below, 3+ days running, and with resting heart rate 4 bpm up: strain building; the same drop with
// resting heart rate steady — rarely a strain note (only by an unusual swing); too short a history — nothing. Load: a
// 60-minute session at 7 is 420; this week 3 × 420 against 4 weeks of 2 × 300 a week — 1,260 against 600.
import { describe, expect, it } from "vitest";
import { hrvStatus, sessionLoad, strainBuilding, weekLoad } from "./strain";
import { addDays } from "./time";
import type { Workout } from "./types";

const TODAY = "2026-11-24";
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const world = (drop: number, rhrUp: number, days = 80, seed = 5) => {
  const r = rng(seed), hrv: Record<string, number> = {}, rhr: Record<string, number> = {};
  for (let k = days - 1; k >= 0; k--) { const d = addDays(TODAY, -k), late = k < 8;
    hrv[d] = Math.round(60 * (1 + (r() - 0.5) * 0.16) * (late ? drop : 1)); rhr[d] = Math.round(54 + (r() - 0.5) * 2 + (late ? rhrUp : 0)); }
  return { hrv, rhr };
};

describe("HRV status", () => {
  it("steady: within its band, no strain", () => {
    const { hrv, rhr } = world(1, 0), s = hrvStatus(hrv, rhr, TODAY)!;
    expect(s.today.where).toBe("within");
    expect(s.today.lo).toBeLessThan(60); expect(s.today.hi).toBeGreaterThan(60);
    expect(strainBuilding(s)).toBeNull();
  });
  it("HRV down 25 % for 8 days with resting heart rate up 4: below, strain building", () => {
    const { hrv, rhr } = world(0.75, 4), s = hrvStatus(hrv, rhr, TODAY)!;
    expect(s.today.where).toBe("below");
    expect(s.below).toBeGreaterThanOrEqual(3);
    expect(strainBuilding(s)!.rhrUp!).toBeGreaterThanOrEqual(3);
  });
  it("across 40 fake people: the drop with resting heart rate up — a strain note nearly always; the drop alone — rarely; steady — never", () => {
    const rate = (drop: number, up: number) => { let c = 0; for (let k = 1; k <= 40; k++) { const { hrv, rhr } = world(drop, up, 80, k * 13); if (strainBuilding(hrvStatus(hrv, rhr, TODAY))) c++; } return c / 40; };
    expect(rate(0.75, 4)).toBeGreaterThanOrEqual(0.9);
    expect(rate(0.75, 0)).toBeLessThanOrEqual(0.2); // only by a swing past its usual 90th percentile
    expect(rate(1, 0)).toBe(0);
  });
  it("under 3 weeks of history: nothing", () => { const { hrv, rhr } = world(1, 0, 20); expect(hrvStatus(hrv, rhr, TODAY)).toBeNull(); });
});

describe("training load (session RPE)", () => {
  const H = 3_600_000, now = Date.parse(`${TODAY}T20:00:00`);
  const w = (daysAgo: number, rpe: number | undefined, min: number): Workout => ({ id: `${daysAgo}-${rpe}`, template: "x", startedAt: now - daysAgo * 24 * H, endedAt: now - daysAgo * 24 * H + min * 60_000, ...(rpe ? { rpe } : {}) } as Workout);
  it("how hard × minutes; this week against the 4 weeks before", () => {
    expect(sessionLoad(w(1, 7, 60))).toBe(420);
    expect(sessionLoad(w(1, undefined, 60))).toBeNull();
    const ws = [w(1, 7, 60), w(3, 7, 60), w(5, 7, 60), w(6, undefined, 45), ...[8, 11, 15, 18, 22, 25, 29, 32].map((d) => w(d, 5, 60))];
    expect(weekLoad(ws, now)).toEqual({ week: 1260, usual: 600, rated: 3, unrated: 1 });
  });
});
