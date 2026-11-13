import { describe, expect, it } from "vitest";
import { lately, linkMap, lookAt, lookWords, outcomeBars } from "./linkmap";
import type { Link, Thing } from "./connect";
import { addDays } from "./time";

// Renovation part 3 (owner, 13 Nov, on the map canvas: "i like A, b is okay but i want these things listed not me picking ·
// c is hard to read"): the two columns, what to look at, and every outcome's bars listed.
const today = "2026-11-13";
const series = (f: (i: number) => number | null, n = 90): Record<string, number> => { const o: Record<string, number> = {}; for (let i = 0; i < n; i++) { const v = f(i); if (v != null) o[addDays(today, -(n - 1 - i))] = v; } return o; };
let seed = 3; const g = () => { let s = 0; for (let k = 0; k < 6; k++) { seed = (seed * 16807) % 2147483647; s += seed / 2147483647; } return (s - 3) * 1.41; };
const things: Thing[] = [
  { key: "drinks", name: "Drinks", unit: "", per: "each drink", role: "input", series: series((i) => (i > 60 ? 2 : 0.5) + Math.abs(g())) },
  { key: "bedLate", name: "Bedtime", unit: "", role: "input", series: series(() => g()) },
  { key: "asleep", name: "Sleep", unit: "h", role: "both", series: series(() => 7 + g() * 0.5) },
  { key: "steps", name: "Steps", unit: "", role: "input", series: series(() => 8 + g()) },
  // HRV planted falling 52 → 46 over the 90 days
  { key: "hrv", name: "HRV", unit: "ms", role: "outcome", better: 1, series: series((i) => 52 - (6 * i) / 89 + g() * 1.5) },
  { key: "mood", name: "Mood", unit: "", role: "outcome", better: 1, series: series(() => 6 + g() * 0.5) },
  { key: "rhr", name: "Resting heart rate", unit: "bpm", role: "outcome", better: -1, series: series(() => 58 + g()) },
];
const link = (from: string, to: string, lag: 0 | 1 | 2, rho: number, slope: number): Link => ({ from, to, lag, rho, n: 90, nEff: 60, p: 0.001, q: 0.01, slope, lo: slope * 0.6, hi: slope * 1.4 });
const links = [link("drinks", "hrv", 1, -0.42, -3.4), link("bedLate", "hrv", 1, -0.22, -2.1), link("asleep", "rhr", 1, -0.24, -1.1), link("steps", "mood", 0, 0.2, 0.1), link("drinks", "mood", 1, -0.25, -0.4)];

describe("the two columns", () => {
  const m = linkMap(links, things, today);
  it("good when it goes with the better side: less resting heart rate with more sleep is good, lower HRV with drinks is bad", () => {
    expect(m.edges.find((e) => e.from === "asleep")!.good).toBe(true);
    expect(m.edges.find((e) => e.from === "drinks" && e.to === "hrv")!.good).toBe(false);
    expect(m.edges.find((e) => e.from === "steps")!.good).toBe(true);
  });
  it("outcomes most linked first, inputs at the middle of theirs (fewer crossings), each outcome with its trend", () => {
    expect(m.outcomes.map((o) => o.key)).toEqual(["hrv", "mood", "rhr"]);
    expect(m.inputs.map((i) => i.key)).toEqual(["bedLate", "drinks", "steps", "asleep"]);
    expect(m.outcomes[0].trend!.tone).toBe("worse");
  });
});

describe("what to look at", () => {
  it("the slipping outcome, what goes with it slipping, and more of it lately", () => {
    const a = lookAt(linkMap(links, things, today), things, today)!;
    expect(a.outcome.key).toBe("hrv");
    expect(a.inputs.map((i) => [i.key, i.against])).toEqual([["drinks", true], ["bedLate", false]]);
    expect(lookWords(a)).toMatch(/^HRV is slipping \(5\d → 4\d ms over 90 days\)\. Two things you do go with lower HRV: drinks and bedtime, the next day\. Lately: more drinks, the last 30 days against the 30 before\.$/);
  });
  it("nothing slipping: nothing to look at", () => {
    const flat = things.map((t) => (t.key === "hrv" ? { ...t, series: series(() => 50 + g()) } : t));
    expect(lookAt(linkMap(links, flat, today), flat, today)).toBeNull();
  });
  it("lately: a planted step up is 'more', noise is neither, too few days is unclear", () => {
    expect(lately(series((i) => (i >= 60 ? 3 : 1) + g() * 0.3), today)).toBe("more");
    expect(lately(series(() => 1 + g() * 0.3), today)).toBeNull();
    expect(lately(series((i) => (i > 80 ? 1 : null)), today)).toBeNull();
  });
});

describe("every outcome's bars, listed", () => {
  it("each outcome with its links as effects in its own spread, worst first, ranges kept", () => {
    const bars = outcomeBars(linkMap(links, things, today), things);
    expect(bars.map((b) => b.key)).toEqual(["hrv", "mood", "rhr"]);
    const hrv = bars[0].rows;
    expect(hrv.map((r) => r.key)).toEqual(["drinks", "bedLate"]);
    expect(hrv[0].eff).toBeLessThan(0); expect(hrv[0].lo).toBeLessThan(hrv[0].eff); expect(hrv[0].hi).toBeGreaterThan(hrv[0].eff);
    // resting heart rate: lower is better, so more sleep → lower → drawn on the better side
    expect(bars[2].rows[0]).toMatchObject({ key: "asleep", good: true });
    expect(bars[2].rows[0].eff).toBeGreaterThan(0);
  });
});

describe("lately: noise isn't called a change", () => {
  it("in at most 4 of 40 noise series", () => {
    let said = 0;
    for (let k = 0; k < 40; k++) if (lately(series(() => 1 + g()), today) != null) said++;
    expect(said).toBeLessThanOrEqual(4);
  });
});
