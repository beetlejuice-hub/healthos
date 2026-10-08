import { describe, expect, it } from "vitest";
import type { HrMinute, SleepSession } from "./band";
import { clockH, evenings, facts, goesWith, lowestHr, nights, regularity, usual, usualNightHr, weekendShift, type Evening, type Night } from "./sleep";
import { rng } from "./bench";
import { atMinute, addDays, MIN, HOUR } from "./time";

const EVE0 = "2026-09-08";
/** A night from `bedH` to `upH` (hours on the evening's clock: 23.5 = 23:30, 31 = 07:00): asleep 15 min after bed, light/deep/light/REM cycles, a waking at 03:00. */
function session(eve: string, bedH: number, upH: number, id = eve, extra: Partial<SleepSession> = {}): SleepSession {
  const T = (h: number) => atMinute(eve, 0) + h * HOUR, bed = T(bedH), up = T(upH), onset = bed + 15 * MIN, wake = up - 5 * MIN;
  const stages: SleepSession["stages"] = [{ type: "awake", start: bed, end: onset }];
  for (let t = onset; t < wake;) {
    const e = Math.min(wake, t + 90 * MIN), L = e - t;
    stages.push({ type: "light", start: t, end: t + L * 0.4 }, { type: "deep", start: t + L * 0.4, end: t + L * 0.65 }, { type: "rem", start: t + L * 0.65, end: e });
    t = e;
  }
  stages.push({ type: "awake", start: wake, end: up });
  // A 10-minute waking at 03:00 cut into whatever stage was there.
  const w0 = T(27), w1 = T(27) + 10 * MIN, cut: SleepSession["stages"] = [];
  for (const s of stages) { if (s.end <= w0 || s.start >= w1) cut.push(s); else { if (s.start < w0) cut.push({ ...s, end: w0 }); if (s.end > w1) cut.push({ ...s, start: w1 }); } }
  cut.push({ type: "awake", start: w0, end: w1 });
  return { id, start: bed, end: up, asleepMin: null, awakeMin: null, toFallAsleepMin: 15, nap: false, stageMin: {}, stages: cut.sort((a, b) => a.start - b.start), ...extra };
}
/** Heart rate every minute through a night: 62 at bed, down to `low` at `lowH`, back to 58 by `upH`. */
function hrNight(eve: string, bedH: number, upH: number, low: number, lowH: number, noise = () => 0): HrMinute[] {
  const out: HrMinute[] = [];
  for (let h = bedH; h <= upH; h += 1 / 60) {
    const v = h < lowH ? low + (62 - low) * (lowH - h) / (lowH - bedH) : low + (58 - low) * (h - lowH) / (upH - lowH), t = atMinute(eve, 0) + h * HOUR, a = v + noise();
    out.push([Math.round(t), a, a - 2, a + 2]);
  }
  return out;
}

describe("a night from the band", () => {
  it("bed, asleep, stages, the waking at 03:00, the morning it belongs to", () => {
    const s = session(EVE0, 23.5, 31);
    const [n] = nights([s], [], { "2026-09-09": 55 }, { "2026-09-09": 47 });
    expect(n.eve).toBe(EVE0); expect(n.day).toBe("2026-09-09");
    expect(n.latency).toBe(15);
    expect(n.awake).toBeCloseTo(10, 5); expect(n.wakes).toBe(1);
    expect(n.asleep).toBeCloseTo((7.5 * 60) - 15 - 5 - 10, 5);
    expect(n.deep! + n.rem! + n.light!).toBeCloseTo(n.asleep, 5);
    expect(n.deep!).toBeGreaterThan(80); expect(n.rhr).toBe(55); expect(n.hrv).toBe(47);
  });
  it("bed after midnight still belongs to the evening before; the longest main sleep wins; a daytime nap joins that day's night", () => {
    const late = session(EVE0, 24.6, 32), short = session(addDays(EVE0, 1), 6, 7, "short");
    const nap = { ...session(EVE0, 14, 15.1, "nap"), nap: true };
    const ns = nights([late, short, nap], [], {}, {});
    expect(ns).toHaveLength(1); expect(ns[0].eve).toBe(EVE0); expect(ns[0].id).toBe(EVE0);
    expect(ns[0].nap!.min).toBeCloseTo(66, 0);
  });
  it("the lowest heart rate is a 5-minute average: one odd minute doesn't count", () => {
    const hr = hrNight(EVE0, 23.5, 31, 50, 27.5);
    const odd = hr.findIndex((m) => m[0] >= atMinute(EVE0, 0) + 25 * HOUR); hr[odd] = [hr[odd][0], 30, 28, 32];
    const lo = lowestHr(hr, hr[0][0], hr.at(-1)![0])!;
    expect(lo.low).toBeGreaterThan(49.5); expect(lo.low).toBeLessThan(51);
    expect(Math.abs(clockH(lo.at, EVE0) - 27.5)).toBeLessThan(0.1);
  });
  it("…and works when the band only reads every 15 minutes", () => {
    const hr = hrNight(EVE0, 23.5, 31, 50, 27.5).filter((_, i) => i % 15 === 0);
    const lo = lowestHr(hr, hr[0][0], hr.at(-1)![0])!;
    expect(lo.low).toBeLessThan(51); expect(Math.abs(clockH(lo.at, EVE0) - 27.5)).toBeLessThan(0.3);
  });
});

describe("one clock for every night", () => {
  it("the night the clocks go back: 07:00 is still 07:00 on the evening's clock", () => {
    const tz = process.env.TZ; process.env.TZ = "Europe/Budapest";
    try {
      expect(clockH(new Date(2026, 9, 24, 23, 30).getTime(), "2026-10-24")).toBe(23.5);
      expect(clockH(new Date(2026, 9, 25, 7, 0).getTime(), "2026-10-24")).toBe(31); // 32 hours have passed since midnight
      expect((new Date(2026, 9, 25, 7, 0).getTime() - new Date(2026, 9, 24).getTime()) / HOUR).toBe(32);
    } finally { process.env.TZ = tz; if (tz === undefined) delete process.env.TZ; }
  });
});

describe("regularity", () => {
  const run = (bed: (k: number) => number, days = 10) => nights(Array.from({ length: days }, (_, k) => { const e = addDays(EVE0, k); return { ...session(e, bed(k), bed(k) + 8, e), stages: [] }; }), [], {}, {});
  it("the same hours every day: 100", () => { expect(regularity(run(() => 23))!.score).toBeCloseTo(100, 5); });
  it("23:00–07:00 and 01:00–09:00 on alternate days: 4 of 24 hours differ each pair, so 66.7", () => {
    expect(regularity(run((k) => (k % 2 ? 25 : 23)))!.score).toBeCloseTo(200 * 20 / 24 - 100, 1);
  });
  it("only pairs of days that both have a night; under 5 pairs: no score", () => {
    const ns = run(() => 23, 10).filter((_, k) => k % 2 === 0); // every other day: no pairs at all
    expect(regularity(ns)).toBeNull();
    expect(regularity(run(() => 23, 5))).toBeNull(); // 4 pairs
  });
  it("weekend shift: Friday and Saturday an hour later", () => {
    const ns = run((k) => ([5, 6].includes(new Date(atMinute(addDays(EVE0, k), 720)).getDay()) ? 24 : 23), 21);
    expect(weekendShift(ns)).toBeCloseTo(60, 5);
  });
});

/** 30 nights with noise; drink nights (about a third) get `drinkBpm` higher lowest heart rate. Nothing else planted. */
function world(seed: number, drinkBpm: number) {
  const { r, g } = rng(seed), ns: Night[] = [], evs: Evening[] = [];
  for (let k = 0; k < 30; k++) {
    const eve = addDays(EVE0, k), drinks = r() < 0.35, bedH = 23.3 + g() * 0.4;
    const [n] = nights([session(eve, bedH, 31 + g() * 0.3)], [], {}, {});
    n.low = 50 + g() * 1.5 + (drinks ? drinkBpm : 0); n.lowAt = atMinute(eve, 0) + (27 + g() * 0.5) * HOUR; n.hrv = 45 + g() * 5; n.asleep += g() * 25; n.deep! += g() * 10; n.rem! += g() * 12;
    ns.push(n); evs.push({ drinks: drinks ? [atMinute(eve, 21 * 60)] : [], caffeineAtBed: r() < 0.3 ? 40 : 10, trained: r() < 0.45, ateLate: r() < 0.25, rating: r() < 0.8 ? Math.round(6 + g()) : null });
  }
  return { ns, evs };
}

describe("what goes with your sleep", () => {
  it("finds a planted +4 bpm lowest heart rate on drink nights, clear, toward worse", () => {
    const w = world(1, 4);
    const c = goesWith(w.ns, w.evs).find((x) => x.factor === "drinks" && x.outcome === "low")!;
    expect(c.sure).toBe("clear"); expect(c.toward).toBe("worse"); expect(c.diff!).toBeGreaterThan(2.5); expect(c.diff!).toBeLessThan(5.5);
  });
  it("finds nothing when nothing is planted: across 20 grids of pure chance, clear cells stay rare", () => {
    let clear = 0, likely = 0, cells = 0;
    for (let s = 100; s < 120; s++) { const w = world(s, 0); for (const c of goesWith(w.ns, w.evs, { perms: 1000, seed: s })) { cells++; if (c.sure === "clear") clear++; if (c.sure === "likely") likely++; } }
    expect(clear).toBeLessThanOrEqual(4); // ~2 expected in ~900 cells at p < 0.002
    expect(likely).toBeLessThanOrEqual(cells * 0.035);
  }, 30_000);
  it("too few nights on one side: says so", () => {
    const w = world(2, 0); w.evs.forEach((e, i) => { e.ateLate = i < 3; });
    expect(goesWith(w.ns, w.evs, { perms: 100 }).filter((c) => c.factor === "late").every((c) => c.sure === "too few")).toBe(true);
  });
});

describe("evenings and facts", () => {
  it("an evening: drinks from noon to bed, caffeine at bed, the workout, food after 21:00, the next morning's rating", () => {
    const [n] = nights([session(EVE0, 23.5, 31)], [], {}, {});
    const [e] = evenings([n], {
      drinks: [{ at: atMinute(EVE0, 20 * 60), g: 20 }, { at: atMinute(EVE0, 11 * 60), g: 20 }], caffeineAt: () => 42,
      workouts: [{ start: atMinute(EVE0, 18 * 60) }], meals: [{ at: atMinute(EVE0, 21 * 60 + 30) }], ratings: [{ at: atMinute("2026-09-09", 8 * 60), rating: 7 }],
    });
    expect(e).toEqual({ drinks: [atMinute(EVE0, 20 * 60)], caffeineAtBed: 42, trained: true, ateLate: true, rating: 7 });
  });
  it("facts say what was different, in the right direction", () => {
    const w = world(3, 0), n = w.ns[29];
    n.lowAt = atMinute(n.eve, 0) + 29.5 * HOUR; n.low = 56; n.hrv = 20;
    const f = facts(n, { ...w.evs[29], drinks: [atMinute(n.eve, 21 * 60), atMinute(n.eve, 22 * 60)] }, w.ns, { clock: () => "05:30", dur: (m) => `${Math.round(m)} min` });
    expect(f.some((x) => /^2 drinks, the last \d+ min before bed\.$/.test(x))).toBe(true);
    expect(f.some((x) => /Lowest heart rate 56 at 05:30, \d+ min later than usual \(usually about 5\d\)\./.test(x))).toBe(true);
    expect(f.some((x) => /^HRV 20 ms — the lowest of 30 nights\.$/.test(x))).toBe(true);
  });
  it("usual heart rate asleep at each clock time needs 5 other nights there", () => {
    const ns: Night[] = [], hr: HrMinute[] = [];
    for (let k = 0; k < 6; k++) { const e = addDays(EVE0, k); ns.push(nights([session(e, 23.5, 31)], [], {}, {})[0]); hr.push(...hrNight(e, 23.5, 31, 50 + k, 27.5)); }
    const band = usualNightHr(ns, hr, ns[5].id), at = band.find((b) => Math.abs(b.h - 27.5) < 0.01)!;
    expect(at.mid).toBeGreaterThanOrEqual(51); expect(at.mid).toBeLessThanOrEqual(53);
    expect(usualNightHr(ns.slice(0, 5), hr, ns[4].id)).toEqual([]); // only 4 others
    expect(usual([1, 2, 3, 4])).toBeNull(); expect(usual([1, 2, 3, 4, 5])!.mid).toBe(3);
  });
});
