import { describe, expect, it } from "vitest";
import { cadencePairs, mergePairs, recoveryOf, type CadPair } from "./cadence";
import { FIT, firstWeek, laneLine, laneTrend, laneWindows, recoveryTrend, weekly, type Win } from "./cardiofit";
import type { HrMinute, StepBucket } from "./band";
import type { Workout } from "./types";

// PLAN 218 (owner, 13 Nov: "seeing how my cardio and fitness changes on steps, running"; typing a level: "scrap this idea
// if thats the only way"). Heart rate at the same step rate, from the band alone; recovery after cardio.
const M = 60_000, D = 86_400_000;
const NOW = new Date("2026-11-13T18:00:00").getTime();
const mins = (from: number, bpms: number[]): HrMinute[] => bpms.map((v, i) => [from + i * M, v, v - 2, v + 3]);

describe("pairs: 5 minutes of steps and the heart rate in them", () => {
  const t0 = new Date("2026-11-10T10:00:00").getTime();
  it("averages the heart-rate minutes inside each window, steps a minute from the count", () => {
    const hr = mins(t0, [100, 102, 104, 106, 108, 120, 120, 120, 120, 120]);
    const steps: StepBucket[] = [[t0, 5, 560], [t0 + 5 * M, 5, 600]];
    expect(cadencePairs(hr, steps)).toEqual([[t0, 112, 104], [t0 + 5 * M, 120, 120]]);
  });
  it("leaves out slow windows (under 40 a minute), hourly ones, and ones with under 3 heart-rate minutes", () => {
    const hr = mins(t0, [90, 90, 90, 90, 90]).concat(mins(t0 + 10 * M, [95, 95]));
    expect(cadencePairs(hr, [[t0, 5, 150], [t0 + 5 * M, 5, 500], [t0 + 10 * M, 5, 500], [t0, 60, 6000]])).toEqual([]);
  });
  it("a window worked out again replaces the old one", () => {
    expect(mergePairs([[1, 100, 100], [2, 100, 100]], [[2, 110, 105], [3, 90, 90]])).toEqual([[1, 100, 100], [2, 110, 105], [3, 90, 90]]);
  });
});

describe("recovery: the drop in the 2 minutes after the effort", () => {
  const s = new Date("2026-11-12T17:00:00").getTime();
  // 30 minutes at 150, then 150 → 135 → 122 → 112 → walking over at ~105
  const session = (): HrMinute[] => [...mins(s - 5 * M, [70, 72, 75, 80, 85]), ...mins(s, Array(30).fill(150)), ...mins(s + 30 * M, [135, 122, 112, 106, 105, 104, 105, 106, 104, 103, 104, 105, 104, 103, 102, 101, 100, 99, 98, 97])];
  it("reads it from where the heart rate came off the effort, at the saved end", () => {
    expect(recoveryOf(session(), s, s + 30 * M)).toEqual({ at: s + 29 * M, peak: 150, then: 135 - 13, drop: 28 });
  });
  it("the same with the end saved 20 minutes late (the heart-rate finish, a forgotten Stop): the walk over isn't the effort", () => {
    expect(recoveryOf(session(), s, s + 50 * M)?.drop).toBe(28);
  });
  it("and with Stop tapped 4 minutes early: the effort runs on past it", () => {
    expect(recoveryOf(session(), s, s + 26 * M)?.at).toBe(s + 29 * M);
  });
  it("nothing when a minute is missing, the band wasn't on (never above 100), or it's still going at the end of the slack", () => {
    const gap = session().filter((m) => m[0] !== s + 31 * M);
    expect(recoveryOf(gap, s, s + 30 * M)).toBeNull();
    expect(recoveryOf(mins(s, Array(40).fill(85)), s, s + 30 * M)).toBeNull();
    expect(recoveryOf(mins(s, Array(60).fill(150)), s, s + 30 * M)).toBeNull();
  });
});

// ---- lanes ----
const own = (id: string, what: string, start: number, min: number, more: Partial<Workout> = {}): Workout => ({ id, template: "Cardio", kind: "cardio", startedAt: start, endedAt: start + min * M, cardio: { what, startedAt: start }, ...more });
const bout = (start: number, n: number, spm: number, bpm: number): CadPair[] => Array.from({ length: n }, (_, i) => [start + i * 5 * M, spm, bpm]);

describe("lanes: which windows say what", () => {
  const day = new Date("2026-11-11T00:00:00").getTime();
  it("walking outside workouts at 100–130, its first window left out (the heart still catching up)", () => {
    const w = laneWindows(bout(day + 9 * 3600e3, 4, 115, 105), [], NOW);
    expect(w.map((x) => x.lane)).toEqual(["walk", "walk", "walk"]);
    expect(w[0].t).toBe(day + 9 * 3600e3 + 5 * M);
  });
  it("140+ outside workouts is running; 130–140 is neither", () => {
    expect(laneWindows([...bout(day + 7 * 3600e3, 3, 160, 165), ...bout(day + 8 * 3600e3, 3, 135, 130)], [], NOW).map((x) => x.lane)).toEqual(["run", "run"]);
  });
  it("inside a Stairmaster session: the stairmaster, at its own step rate; inside a Run: running from 100 a minute", () => {
    const st = day + 17 * 3600e3, rn = day + 19 * 3600e3;
    const ws = [own("a", "Stairmaster", st, 30), own("b", "Run", rn, 30)];
    const got = laneWindows([...bout(st, 6, 80, 150), ...bout(rn, 6, 110, 140)], ws, NOW);
    expect(got.filter((x) => x.lane === "stair")).toHaveLength(5);
    expect(got.filter((x) => x.lane === "run")).toHaveLength(5);
  });
  it("a lifting session and the 10 minutes after it are left out; an incline-walk phase isn't a lane", () => {
    const lift: Workout = { id: "l", template: "Push", startedAt: day + 12 * 3600e3, endedAt: day + 13 * 3600e3 };
    const inc = own("c", "Incline walk", day + 15 * 3600e3, 30);
    expect(laneWindows([...bout(day + 12 * 3600e3, 14, 115, 120), ...bout(day + 15 * 3600e3, 6, 115, 140)], [lift, inc], NOW)).toEqual([]);
  });
  it("a Run session's incline-walk phase counts as neither, its run phase as running", () => {
    const s = day + 18 * 3600e3, w = own("d", "Incline walk", s, 40, { phases: [{ what: "Incline walk", start: s }, { what: "Run", start: s + 20 * M }] });
    const got = laneWindows(bout(s, 8, 120, 150), [w], NOW);
    expect(got.map((x) => [x.lane, (x.t - s) / M])).toEqual([["run", 25], ["run", 30], ["run", 35]]);
  });
});

// ---- the weekly line: a planted change found, none found where there's none ----
function rng(seed: number) { let s = seed >>> 0; const u = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; return { u, g: () => { let x = 0; for (let i = 0; i < 6; i++) x += u(); return (x - 3) * Math.SQRT2; } }; }
/** 12 weeks of walks, 2 a day of 5 windows: heart rate = base(day) + 0.6 × (steps − 115) + a day's own push + noise. */
function walks(seed: number, o: { drop: number; spm: (frac: number) => number; days?: number }): Win[] {
  const { u, g } = rng(seed), days = o.days ?? 84, pairs: CadPair[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(NOW - d * D); day.setHours(0, 0, 0, 0);
    const frac = 1 - d / days, base = 110 - o.drop * frac, dayPush = g() * 2;
    for (const h of [8, 18]) {
      const spm = o.spm(frac) + (u() - 0.5) * 16;
      for (let i = 0; i < 5; i++) pairs.push([day.getTime() + h * 3600e3 + i * 5 * M, Math.round(spm * 10) / 10, Math.round(base + dayPush + 0.6 * (spm - 115) + g() * 3 - (i === 0 ? 8 : 0))]);
    }
  }
  return laneWindows(pairs.filter((p) => p[0] <= NOW), [], NOW);
}

describe("the weekly line at one step rate", () => {
  it("finds a planted 8 bpm drop over 12 weeks, at the walk's usual step rate", () => {
    const t = laneTrend(walks(1, { drop: 8, spm: () => 115 }), "walk", NOW)!;
    expect(t.ref).toBe(115);
    expect(t.pts).toHaveLength(12);
    expect(t.slope).toBeGreaterThan(0.4); expect(t.slope).toBeLessThan(0.8);
    expect(t.trend!.word).toBe("lower");
    expect(t.trend!.change).toBeGreaterThan(-10); expect(t.trend!.change).toBeLessThan(-6);
    expect(laneLine(t)).toMatch(/^Walking at 115 steps a minute: 1\d\d → 1\d\d bpm since \d+ Aug, lower, which goes with fitter\.$/);
  });
  it("finds it in nearly every seed", () => {
    const hits = Array.from({ length: 30 }, (_, k) => laneTrend(walks(100 + k, { drop: 8, spm: () => 115 }), "walk", NOW)!.trend!.word).filter((w) => w === "lower").length;
    expect(hits).toBeGreaterThanOrEqual(28);
  });
  it("no change planted: 'about the same' in nearly every seed (no false fitter)", () => {
    const said = Array.from({ length: 40 }, (_, k) => laneTrend(walks(500 + k, { drop: 0, spm: () => 115 }), "walk", NOW)!.trend!.word);
    expect(said.filter((w) => w !== "same").length).toBeLessThanOrEqual(4);
  });
  it("walking faster over the weeks isn't read as less fit: the heart rate rises with the pace, the line at 115 doesn't", () => {
    const ws = walks(7, { drop: 0, spm: (f) => 106 + 18 * f });
    const naive = (from: number, to: number) => { const x = ws.filter((w) => w.t >= NOW - from * D && w.t < NOW - to * D); return x.reduce((a, w) => a + w.bpm, 0) / x.length; };
    expect(naive(21, 0) - naive(84, 63)).toBeGreaterThan(5); // the plain average climbs
    const t = laneTrend(ws, "walk", NOW)!;
    expect(t.trend!.word).toBe("same");
    expect(Math.abs(t.trend!.change)).toBeLessThan(FIT.change);
  });
  it("under 4 weeks with enough windows: points, no line", () => {
    const t = laneTrend(walks(3, { drop: 8, spm: () => 115, days: 13 }), "walk", NOW)!;
    expect(t.pts.length).toBeLessThan(FIT.minWeeks);
    expect(t.trend).toBeNull();
    expect(laneLine(t)).toMatch(/of 4 weeks for a trend\.$/);
  });
  it("the cloud: the first 3 weeks against the last 3, each read at the step rate", () => {
    const t = laneTrend(walks(1, { drop: 8, spm: () => 115 }), "walk", NOW)!;
    expect(t.then.length).toBeGreaterThan(50); expect(t.now.length).toBeGreaterThan(50);
    expect(t.thenAt! - t.nowAt!).toBeGreaterThan(4);
  });
  it("nothing in the span: null", () => {
    expect(laneTrend([], "walk", NOW)).toBeNull();
  });
});

describe("recovery over sessions, resting heart rate and VO2 max by week", () => {
  const rec = (drop: number) => ({ at: 0, peak: 150, then: 150 - drop, drop });
  it("a faster drop over the weeks is 'higher' (fitter)", () => {
    const pts = Array.from({ length: 16 }, (_, i) => ({ start: NOW - (80 - i * 5) * D, what: "Stairmaster", rec: rec(26 + Math.round(i * 0.5) + (i % 3) - 1) }));
    const r = recoveryTrend(pts, NOW);
    expect(r.trend!.word).toBe("higher");
    expect(r.last!.rec.drop).toBe(pts.at(-1)!.rec.drop);
  });
  it("weekly averages inside the span only; VO2 days read by their value", () => {
    const from = firstWeek(NOW), day = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
    const w = weekly({ [day(from - D)]: 70, [day(from + D)]: 60, [day(from + 2 * D)]: 62, [day(NOW)]: 57 }, NOW);
    expect(w.map((x) => x.v)).toEqual([61, 57]);
    expect(weekly({ [day(NOW)]: { v: 43.5 } }, NOW)[0].v).toBe(43.5);
  });
});
