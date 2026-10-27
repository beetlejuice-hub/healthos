// PLAN 177, body lab 5 — owner, 27 Oct: the nervous-system heatmap "yes".
import { describe, expect, it } from "vitest";
import type { HrMinute, SleepSession, StepBucket } from "./band";
import { usualByHour } from "./hrusual";
import { addDays, atMinute } from "./time";
import { woundHeat } from "./wound";

const today = "2026-10-27"; // a Tuesday
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/**
 * 35 days awake 07:00–23:00 at ~60 bpm, asleep otherwise; a walk every day 12:00–12:20 at 95 bpm with 100 steps a minute.
 * Planted (`tue`): Tuesdays 15:00–16:00 at 80 while still. `noise`: each day one random hour 20 still minutes at 80.
 */
function world(o: { tue?: boolean; noise?: number; walkOnly?: boolean } = {}) {
  const r = rng(o.noise ?? 1), hr: HrMinute[] = [], sleep: Pick<SleepSession, "start" | "end">[] = [], steps: StepBucket[] = [];
  for (let i = 35; i >= 1; i--) {
    const day = addDays(today, -i), wd = new Date(`${day}T12:00:00`).getDay(), noisy = o.noise ? 7 + Math.floor(r() * 16) : -1;
    sleep.push({ start: atMinute(addDays(day, -1), 23 * 60), end: atMinute(day, 7 * 60) });
    for (let m = 7 * 60; m < 23 * 60; m++) {
      const walk = m >= 12 * 60 && m < 12 * 60 + 20, tue = o.tue && wd === 2 && m >= 15 * 60 && m < 16 * 60, nz = m >= noisy * 60 && m < noisy * 60 + 20;
      const v = walk ? 95 : tue || nz ? 80 : 60 + ((m * 7) % 5) - 2;
      hr.push([atMinute(day, m), v, v - 1, v + 1]);
    }
    steps.push([atMinute(day, 12 * 60), 20, 2000], [atMinute(day, 18 * 60), 15, 30]);
  }
  hr.sort((a, b) => a[0] - b[0]);
  return { hr, sleep, steps, usual: usualByHour(hr, [], today, 14) };
}
const heat = (w: ReturnType<typeof world>) => woundHeat(w.hr, w.sleep, [], w.steps, w.usual, today);

describe("the nervous-system heatmap (PLAN 177)", () => {
  it("planted: Tuesdays 15:00–16:00, 20 above your usual while still — named, 4 of the last 4 Tuesdays; the cell's ~60 min/hour", () => {
    const h = heat(world({ tue: true }));
    expect(h.top).toMatchObject({ name: "Tuesday", h: 15, hot: 4, weeks: 4 });
    expect(h.top!.perHour).toBeGreaterThan(55);
    expect(h.days).toBe(28);
  });
  it("a walk (heart up, steps counted) is never wound up", () => {
    const h = heat(world());
    expect([h.minutes, h.top]).toEqual([0, null]);
    expect(h.cells.find((c) => c.wd === 2 && c.h === 12)!.perHour).toBe(0);
  });
  it("planted under daily noise: still found in 20 of 20; control (noise only): an hour named in at most 3 of 20", () => {
    const found = Array.from({ length: 20 }, (_, s) => heat(world({ tue: true, noise: s + 2 })).top).filter((t) => t?.name === "Tuesday" && t.h === 15).length;
    expect(found).toBe(20);
    const named = Array.from({ length: 20 }, (_, s) => heat(world({ noise: s + 2 })).top).filter(Boolean).length;
    expect(named).toBeLessThanOrEqual(3);
  });
  it("no steps from the band: nothing counted — walking can't be told from sitting", () => {
    const w = world({ tue: true });
    expect(woundHeat(w.hr, w.sleep, [], [], w.usual, today)).toMatchObject({ noSteps: true, top: null, minutes: 0 });
  });
  it("asleep and training are left out: a workout Tuesday 15:00 isn't wound up", () => {
    const w = world({ tue: true }), workouts = [0, 1, 2, 3].map((k) => { const d = addDays(today, -7 * (k + 1)); return { start: atMinute(d, 14 * 60 + 30), end: atMinute(d, 15 * 60) }; });
    expect(woundHeat(w.hr, w.sleep, workouts, w.steps, w.usual, today).top).toBeNull();
  });
});
