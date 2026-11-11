// PLAN 207 — every trend. Known answers: a measure planted to fall 2.4 kg over 90 days reads "down", better (less is
// better for weight), by about 2.4; HRV planted to rise reads better; resting heart rising reads worse. Controls: noise
// around a flat level is "steady"; a measure where neither way is better is steady even when it moves; too few days, none.
import { describe, expect, it } from "vitest";
import { tally, trendOf, TRENDS, type Measure } from "./trends";
import { addDays } from "./time";

const TODAY = "2026-11-11";
function rng(seed: number) { let s = seed; return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const series = (n: number, f: (i: number) => number | null) => { const s: Record<string, number> = {}; for (let i = 0; i < n; i++) { const v = f(i); if (v != null) s[addDays(TODAY, -(n - 1 - i))] = v; } return s; };
const m = (key: string, better: Measure["better"], s: Record<string, number>): Measure => ({ key, name: key, unit: "", better, series: s });

describe("every trend", () => {
  it("weight planted to fall 2.4 kg over 90 days (noise ±0.3): down, better, about −2.4; 90 dots, the average from day one", () => {
    const r = rng(1), t = trendOf(m("weight", -1, series(90, (i) => 80 - (2.4 * i) / 89 + (r() - 0.5) * 0.6)), TODAY, 90)!;
    expect([t.way, t.tone]).toEqual(["down", "better"]);
    expect(t.delta).toBeGreaterThan(-2.6); expect(t.delta).toBeLessThan(-1.9);
    expect(t.days.length).toBe(90);
    expect(t.avg[0].i).toBe(0);
  });
  it("HRV rising is better; resting heart rising is worse", () => {
    const r = rng(2);
    expect(trendOf(m("hrv", 1, series(90, (i) => 55 + i / 10 + (r() - 0.5) * 8)), TODAY, 90)!.tone).toBe("better");
    expect(trendOf(m("rhr", -1, series(90, (i) => 54 + i / 25 + (r() - 0.5) * 2)), TODAY, 90)!.tone).toBe("worse");
  });
  it("the range: 30 days sees only the last 30", () => {
    const t = trendOf(m("x", 1, series(365, (i) => i)), TODAY, 30)!;
    expect([t.days.length, t.days[0].v, t.days.at(-1)!.v]).toEqual([30, 335, 364]);
  });
  it("gaps: days without a value are left out, the average uses what's there", () => {
    const t = trendOf(m("w", -1, series(30, (i) => (i % 3 ? null : 70))), TODAY, 30)!;
    expect(t.days.length).toBe(10);
    expect(t.avg.every((a) => a.v === 70)).toBe(true);
  });
  it("controls: noise around a flat level is steady; neither-way measures are steady even moving; too few days, none", () => {
    let steady = 0;
    for (let s = 0; s < 20; s++) { const r = rng(10 + s); if (trendOf(m("flat", 1, series(90, () => 60 + (r() - 0.5) * 10)), TODAY, 90)!.tone === "steady") steady++; }
    expect(steady).toBeGreaterThanOrEqual(17);
    expect(trendOf(m("caffeine", 0, series(90, (i) => 200 + i)), TODAY, 90)!.tone).toBe("steady");
    expect(trendOf(m("x", 1, series(TRENDS.minDays - 1, () => 1)), TODAY, 90)).toBeNull();
  });
  it("the tally", () => {
    const r = rng(4), ts = [trendOf(m("a", 1, series(90, (i) => i)), TODAY, 90)!, trendOf(m("b", 1, series(90, (i) => -i)), TODAY, 90)!, trendOf(m("c", 1, series(90, () => 5 + r() * 0.1)), TODAY, 90)!];
    expect(tally(ts)).toEqual({ better: 1, worse: 1, steady: 1 });
  });
});
