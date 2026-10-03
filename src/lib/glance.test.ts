import { describe, expect, it } from "vitest";
import { glance, glanceDays, dayTone, weekDays, type GlanceDay } from "./glance";
import { DEFAULT_SETTINGS } from "./store";
import { addDays } from "./time";
import type { Entry } from "./types";

const TODAY = "2026-10-03";
const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

/** 84 days ending today; `stress(i, r)` per day, everything else empty. */
function days(stress: (i: number, r: () => number) => number | null, seed = 7, n = 84, extra: (i: number, r: () => number) => Partial<GlanceDay> = () => ({})): GlanceDay[] {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => ({
    day: addDays(TODAY, i - (n - 1)), mood: null, energy: null, focus: null, stress: stress(i, r), sleep: null,
    kcal: null, protein: null, cafBed: null, drinks: null, weight: null, trained: false, lateCaffeine: false, note: false, checkins: 1, ...extra(i, r),
  }));
}
const get = (ds: GlanceDay[], k: string) => glance(ds, TODAY).find((m) => m.k === k)!;

describe("glance: a week against your usual week", () => {
  it("finds a planted rough week that the spread of single days would call typical", () => {
    // Stress around 4 with a day-to-day spread of 1; the last 7 days +1 higher.
    const ds = days((i, r) => 4 + gauss(r) + (i >= 77 ? 1 : 0));
    const s = get(ds, "stress");
    expect(s.state).toBe("hi");
    expect(s.better).toBe(false);
    // The old way — the week's average against a usual *day* — misses it: that's the bug this fixes.
    expect(s.week!).toBeLessThan(s.day!.p90);
    expect(s.week!).toBeGreaterThan(s.usualWeek!.p90);
  });

  it("doesn't find an effect that isn't there: an ordinary week is typical about 4 times in 5", () => {
    let flagged = 0; const N = 200;
    for (let seed = 1; seed <= N; seed++) if (get(days((_, r) => 4 + gauss(r), seed), "stress").state !== "ok") flagged++;
    // p10–p90 of usual weeks: ~20% of ordinary weeks land outside by design. The day-band rule
    // would flag ~0%; a broken band (e.g. comparing with nothing) would flag far more.
    expect(flagged / N).toBeGreaterThan(0.08);
    expect(flagged / N).toBeLessThan(0.4);
  });

  it("says 'building' until there are enough usual weeks, and 'none' without this week's data", () => {
    expect(get(days((_, r) => 4 + gauss(r), 3, 20), "stress").state).toBe("building");
    expect(get(days((i, r) => (i < 79 ? 4 + gauss(r) : null)), "stress").state).toBe("none"); // 2 of 7 days: too few
  });

  it("totals drinks per week and calls more of them worse", () => {
    // ~2 drinks on Fridays and Saturdays; this week 4 nights out.
    const ds = days(() => null, 5, 84, (i) => { const dow = new Date(2026, 9, 3 - 83 + i).getDay(); const thisWeek = i >= 77; return { drinks: thisWeek ? ([0, 4, 5, 6].includes(dow) ? 2 : 0) : dow === 5 || dow === 6 ? (i % 3 ? 1 : 2) : 0 }; });
    const d = get(ds, "drinks");
    // Today (Saturday) is left out as unfinished: 6 drinks over 6 days → 7 a week.
    expect(d.week).toBeCloseTo(7, 6);
    expect(d.state).toBe("hi");
    expect(d.better).toBe(false);
  });

  it("leaves today's calories out of the week (the day isn't over)", () => {
    const ds = days(() => null, 2, 84, (i) => ({ kcal: i === 83 ? 300 : 2300 }));
    const k = get(ds, "kcal");
    expect(k.week).toBe(2300);
    expect(k.weekDays).toBe(6);
    expect(k.trend[k.trend.length - 1]).toBeNull();
  });

  it("marks single days outside a usual day, the good or the bad way", () => {
    const ds = days((_, r) => 4 + gauss(r) * 0.5);
    const s = get(ds, "stress");
    expect(dayTone(s, 9)).toBe("worse");
    expect(dayTone(s, 1)).toBe("better");
    expect(dayTone(s, s.day!.p50)).toBeNull();
    expect(weekDays(ds, TODAY).map((d) => d.day)).toEqual(Array.from({ length: 7 }, (_, k) => addDays(TODAY, k - 6)));
  });
});

describe("glanceDays", () => {
  const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
  const entries: Entry[] = [
    { id: "1", kind: "sleep", at: at(2, 7, 40), rating: 6 },
    { id: "2", kind: "weight", at: at(2, 7, 0), kg: 73.4 },
    { id: "3", kind: "weight", at: at(2, 21, 0), kg: 74.0 },
    { id: "4", kind: "feel", at: at(2, 14), mood: 7, stress: 3, note: "long meeting" },
    { id: "5", kind: "drink", at: at(2, 16), name: "Coffee", ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 },
    { id: "6", kind: "drink", at: at(2, 20), name: "Beer", ml: 500, caffeineMg: 0, alcoholG: 21, kcal: 215 },
  ];
  const ds = glanceDays(entries, [], DEFAULT_SETTINGS, "2026-10-01", "2026-10-02");
  it("reads a day the way the strip shows it", () => {
    const d = ds[1];
    expect(d.sleep).toBe(6);
    expect(d.weight).toBe(74.0);
    expect(d.note).toBe(true);
    expect(d.lateCaffeine).toBe(true);
    expect(d.drinks).toBeCloseTo(1.5, 6);
    expect(d.cafBed!).toBeGreaterThan(20);
  });
  it("keeps caffeine and drinks unknown on a day with nothing logged, not zero", () => {
    expect(ds[0].cafBed).toBeNull();
    expect(ds[0].drinks).toBeNull();
  });
});
