import { describe, expect, it } from "vitest";
import type { HrMinute, SleepSession } from "./band";
import { bars, clockH, eli5, evenings, FACTORS, facts, fellAsleep, goesWith, lowestHr, nights, regularity, suppFactors, usual, usualNightHr, weekendShift, type Evening, type Night } from "./sleep";
import { rng } from "./bench";
import { tagFactors } from "./lastnight";
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

/** 30 nights; the band off on 5 of the days (no steps for them). Planted: a day with more steps than usual, `extraMin` more sleep that night. */
function stepWorld(seed: number, extraMin: number) {
  const { r, g } = rng(seed), ns: Night[] = [], steps = new Map<string, number>(), dayOf: number[] = [];
  for (let k = 0; k < 30; k++) { const eve = addDays(EVE0, k); dayOf.push(Math.round(7000 + g() * 2500)); if (k % 6 !== 5) steps.set(eve, dayOf[k]); }
  const mid = [...steps.values()].sort((a, b) => a - b)[12];
  for (let k = 0; k < 30; k++) {
    const eve = addDays(EVE0, k), [n] = nights([session(eve, 23.3 + g() * 0.2, 31 + g() * 0.2)], [], {}, {});
    // the planted effect follows the real day, worn or not; days off are a sixth, picked without regard to it
    n.asleep += g() * 20 + (dayOf[k] > mid ? extraMin : 0); n.low = 50 + g(); n.hrv = 45 + g() * 4; ns.push(n); r();
  }
  const evs = evenings(ns, { drinks: [], caffeineAt: () => 0, workouts: [], meals: [], ratings: [], steps });
  return { ns, evs, steps };
}

describe("steps in the sleep grid (PLAN 66)", () => {
  it("finds a planted +50 min asleep after days with more steps than usual — counting only the days the band was on", () => {
    const w = stepWorld(5, 50), c = goesWith(w.ns, w.evs).find((x) => x.factor === "steps" && x.outcome === "asleep")!;
    expect(c.nWith + c.nWithout).toBe(25); // 5 days the band was off: left out, not "fewer steps"
    expect(c.sure).toBe("clear"); expect(c.toward).toBe("better"); expect(c.diff!).toBeGreaterThan(30); expect(c.diff!).toBeLessThan(70);
    expect(w.evs.filter((e) => e.moreSteps == null)).toHaveLength(5);
    expect(w.evs.filter((e) => e.moreSteps === true).length).toBeGreaterThanOrEqual(11);
  });
  it("nothing planted: the steps row stays quiet across 20 worlds", () => {
    let loud = 0;
    for (let s = 200; s < 220; s++) { const w = stepWorld(s, 0); loud += goesWith(w.ns, w.evs, { perms: 1000, seed: s }).filter((c) => c.factor === "steps" && c.sure === "clear").length; }
    expect(loud).toBeLessThanOrEqual(1);
  }, 30_000);
  it("no steps at all (no band data yet): the row says too few, it doesn't count every day as a day without", () => {
    const w = world(2, 0);
    expect(goesWith(w.ns, w.evs, { perms: 100 }).filter((c) => c.factor === "steps").every((c) => c.sure === "too few" && c.nWith + c.nWithout === 0)).toBe(true);
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

describe("fell asleep, from the band (PLAN 77)", () => {
  it("last night's minutes to fall asleep against the middle of the other nights; null without a night", () => {
    const ss = Array.from({ length: 7 }, (_, k) => session(addDays(EVE0, k), 23.5, 31, `n${k}`)); // asleep 15 min after bed
    const now = atMinute(addDays(EVE0, 7), 9 * 60);
    expect(fellAsleep(ss, now)).toEqual({ min: 15, usual: 15 });
    const late = [...ss.slice(0, 6), session(addDays(EVE0, 6), 23.5, 31, "late", { stages: session(addDays(EVE0, 6), 23.5, 31).stages.map((s, i) => (i === 0 ? { ...s, end: s.start + 50 * MIN } : i === 1 ? { ...s, start: s.start + 35 * MIN } : s)) })];
    expect(fellAsleep(late, now)!.min).toBe(50);
    expect(fellAsleep(ss.slice(0, 3), now)).toBeNull(); // the latest ended over 36 h ago
    expect(fellAsleep(ss.slice(3), now)!.usual).toBeNull(); // 3 other nights: too few for a usual
  });
});

describe("a night in plain words (PLAN 79)", () => {
  const base = (k: number, o: Partial<Night>): Night => ({ ...nights([session(addDays(EVE0, k), 23.5, 31)], [], {}, {})[0], id: `n${k}`, ...o });
  const ns = Array.from({ length: 8 }, (_, k) => base(k, { asleep: 420 + (k % 3) * 5, deep: 75 + (k % 2), rem: 95 + (k % 3), awake: 10 + (k % 2), low: 50, hrv: 55 + (k % 3) }));
  it("each measure against your usual, with what it is", () => {
    const n = base(9, { asleep: 362, deep: 77, rem: 69, awake: 69, low: 50, hrv: 65 });
    const by = Object.fromEntries(eli5(n, [...ns, n]).map((r) => [r.key, r]));
    expect(by.asleep).toMatchObject({ value: "6 h 02", side: "less" });
    expect(by.asleep.vs).toBe("less than your usual 7 h 00–7 h 05");
    expect(by.deep.side).toBe("usual");
    expect(by.rem).toMatchObject({ side: "less", value: "69 min" });
    expect(by.awake).toMatchObject({ side: "more", value: "69 min" });
    expect(by.hrv.side).toBe("more");
    expect(by.deep.what).toMatch(/repairs/);
    expect(by.rem.vs).toMatch(/^less than your usual 9\d–9\d min$/); // the unit once
  });
  it("under 5 other nights: no comparison, only what it is", () => {
    const n = base(9, { asleep: 362 });
    expect(eli5(n, [n, ...ns.slice(0, 3)]).every((r) => r.side === null && /after 5 nights/.test(r.vs))).toBe(true);
  });
});

/**
 * 40 nights; from night 6 on, every morning has a sleep entry with last night's tags (PLAN 90). Planted: nights "with gf"
 * (about a third) have `gfMin` more asleep. "worked late" is ticked at random and does nothing — it must stay quiet.
 */
function tagWorld(seed: number, gfMin: number) {
  const { r, g } = rng(seed), ns: Night[] = [], sleeps: { at: number; tags?: string[] }[] = [];
  for (let k = 0; k < 40; k++) {
    const eve = addDays(EVE0, k), [n] = nights([session(eve, 23.3 + g() * 0.2, 31 + g() * 0.2)], [], {}, {});
    const gf = r() < 0.35, late = r() < 0.4;
    n.asleep += g() * 20 + (gf ? gfMin : 0); n.low = 50 + g(); n.hrv = 45 + g() * 4; ns.push(n);
    if (k >= 6) sleeps.push({ at: atMinute(n.day, 8 * 60), tags: [...(gf ? ["gf"] : []), ...(late ? ["worklate"] : [])] });
  }
  return { ns, evs: evenings(ns, { drinks: [], caffeineAt: () => 0, workouts: [], meals: [], ratings: [], sleeps }), sleeps };
}

describe("last-night tags in the grid (PLAN 90)", () => {
  it("finds a planted −40 min asleep on nights with gf, and leaves out the nights nobody asked about", () => {
    const w = tagWorld(3, -40), rows = tagFactors(w.evs), gf = rows.find((f) => f.id === "tag:gf")!;
    expect(gf.name).toBe("With gf");
    const c = goesWith(w.ns, w.evs, { factors: rows }).find((x) => x.factor === "tag:gf" && x.outcome === "asleep")!;
    // the first 6 nights had no morning entry, and mornings before the first tag weren't asked: unknown, not "without"
    expect(c.nWith + c.nWithout).toBe(34 - w.sleeps.findIndex((s) => s.tags!.length > 0));
    expect(c.nWith + c.nWithout).toBeLessThan(40);
    expect(c.sure).toBe("clear"); expect(c.toward).toBe("worse"); expect(c.diff!).toBeLessThan(-25); expect(c.diff!).toBeGreaterThan(-55);
    expect(goesWith(w.ns, w.evs, { factors: rows }).filter((x) => x.factor === "tag:worklate" && x.sure === "clear")).toHaveLength(0);
  });
  it("nothing planted: tag rows stay quiet across 20 worlds", () => {
    let loud = 0;
    for (let s = 300; s < 320; s++) { const w = tagWorld(s, 0); loud += goesWith(w.ns, w.evs, { perms: 1000, seed: s, factors: tagFactors(w.evs) }).filter((c) => c.sure === "clear").length; }
    expect(loud).toBeLessThanOrEqual(2);
  }, 30_000);
  it("which morning is whose: 04:00–14:00 that day; 00:30 is still last night, 15:00 isn't a morning", () => {
    const ns = [0, 1, 2, 3].map((k) => nights([session(addDays(EVE0, k), 23.5, 31)], [], {}, {})[0]);
    const at = (k: number, h: number) => atMinute(ns[k].day, h * 60);
    const evs = evenings(ns, { drinks: [], caffeineAt: () => 0, workouts: [], meals: [], ratings: [],
      sleeps: [{ at: at(0, 7), tags: ["out"] }, { at: at(1, 0.5), tags: ["gf"] }, { at: at(2, 9) }, { at: at(3, 15), tags: ["gf"] }] });
    expect(evs.map((e) => e.tags)).toEqual([["out"], null, [], null]);
  });
  it("before the first tagged morning nobody was asking: an old rating without tags isn't a night without", () => {
    const ns = [0, 1, 2].map((k) => nights([session(addDays(EVE0, k), 23.5, 31)], [], {}, {})[0]);
    const evs = evenings(ns, { drinks: [], caffeineAt: () => 0, workouts: [], meals: [], ratings: [],
      sleeps: [{ at: atMinute(ns[0].day, 8 * 60) }, { at: atMinute(ns[1].day, 8 * 60), tags: ["gf"] }, { at: atMinute(ns[2].day, 8 * 60) }] });
    expect(evs.map((e) => e.tags)).toEqual([null, ["gf"], []]);
  });
  it("without sleep entries passed, evenings stay as they were (no tags key)", () => {
    const [n] = nights([session(EVE0, 23.5, 31)], [], {}, {});
    expect("tags" in evenings([n], { drinks: [], caffeineAt: () => 0, workouts: [], meals: [], ratings: [] })[0]).toBe(false);
  });
});

/**
 * 40 nights with food, workouts, evening check-ins and magnesium answers (PLAN 88). Planted when `plant`: the last meal
 * within 2 h of bed → 18 min longer to fall asleep and 15 min less deep; magnesium taken that day → 14 min more deep.
 * Nothing for: more food or carbs than usual (sizes drawn apart from timing), a late workout, evening stress.
 */
function foodWorld(seed: number, plant: boolean) {
  const { r, g } = rng(seed), ns: Night[] = [];
  const foods: { at: number; kcal: number; c: number }[] = [], sessions: { start: number; end: number }[] = [], checks: { at: number; stress?: number }[] = [];
  const supps: { at: number; suppId: string; status: "taken" | "skipped" }[] = [];
  for (let k = 0; k < 40; k++) {
    const eve = addDays(EVE0, k), [n] = nights([session(eve, 23.3 + g() * 0.15, 31 + g() * 0.2)], [], {}, {});
    const logged = r() > 0.15, mealH = 18 + r() * 5, late = logged && n.bed - atMinute(eve, mealH * 60) < 2 * HOUR;
    if (logged) { foods.push({ at: atMinute(eve, 13 * 60), kcal: 700, c: 80 }, { at: atMinute(eve, mealH * 60), kcal: Math.round(600 + r() * 700), c: Math.round(40 + r() * 120) }); }
    if (r() < 0.3) { const st = atMinute(eve, (r() < 0.5 ? 18 : 21.5) * 60); sessions.push({ start: st, end: st + HOUR }); }
    if (r() < 0.8) checks.push({ at: atMinute(eve, 20 * 60), stress: Math.round(3 + r() * 6) });
    const ans = r(), mag = ans < 0.45;
    if (ans < 0.45) supps.push({ at: atMinute(eve, 21 * 60), suppId: "mag", status: "taken" });
    else if (ans < 0.8) supps.push({ at: atMinute(eve, 21 * 60), suppId: "mag", status: "skipped" });
    n.latency = 12 + Math.abs(g() * 5) + (plant && late ? 18 : 0);
    n.deep = 75 + g() * 7 - (plant && late ? 15 : 0) + (plant && mag ? 14 : 0);
    n.asleep += g() * 15; n.low = 50 + g(); n.hrv = 45 + g() * 4; ns.push(n);
  }
  const evs = evenings(ns, { drinks: [], caffeineAt: () => 0, workouts: [], meals: foods, ratings: [], foods, sessions, checks, supps });
  return { ns, evs, factors: [...FACTORS, ...suppFactors([{ id: "mag", name: "Magnesium" }], evs)] };
}

describe("food and activities against sleep (PLAN 88)", () => {
  it("finds the planted late meal (fell asleep, deep) and magnesium (deep) — and nothing on the rows with nothing planted", () => {
    const w = foodWorld(11, true), cells = goesWith(w.ns, w.evs, { factors: w.factors });
    const c = (f: string, o: string) => cells.find((x) => x.factor === f && x.outcome === o)!;
    for (const [f, o, toward] of [["meal2h", "latency", "worse"], ["meal2h", "deep", "worse"], ["supp:mag", "deep", "better"]] as const) {
      expect(["clear", "likely"]).toContain(c(f, o).sure); expect(c(f, o).toward).toBe(toward);
    }
    expect(c("meal2h", "latency").diff!).toBeGreaterThan(10); expect(c("meal2h", "latency").diff!).toBeLessThan(26);
    // magnesium: only answered days count (taken or "didn't take")
    expect(c("supp:mag", "deep").nWith + c("supp:mag", "deep").nWithout).toBe(w.evs.filter((e) => e.supps?.mag != null).length);
    expect(w.evs.filter((e) => e.supps?.mag == null).length).toBeGreaterThan(3);
    for (const f of ["bigeve", "carbeve", "latetrain", "stress"]) expect(cells.filter((x) => x.factor === f && x.sure === "clear")).toHaveLength(0);
  });
  it("an evening with no food logged is unknown, not 'ate nothing'; a median needs 8 evenings", () => {
    const w = foodWorld(11, true), unknown = w.evs.filter((e) => e.eveKcal == null);
    expect(unknown.length).toBeGreaterThan(2);
    expect(unknown.every((e) => e.lastMealMin == null && e.moreEveKcal == null)).toBe(true);
    const few = evenings(w.ns.slice(0, 5), { drinks: [], caffeineAt: () => 0, workouts: [], meals: [], ratings: [], foods: [{ at: atMinute(w.ns[0].eve, 19 * 60), kcal: 900, c: 100 }] });
    expect(few[0].eveKcal).toBe(900); expect(few[0].moreEveKcal).toBeNull();
  });
  it("nothing planted: the whole bigger grid stays quiet across 20 worlds (about one clear cell in ten grids)", () => {
    let clear = 0, likely = 0;
    for (let s = 400; s < 420; s++) { const w = foodWorld(s, false), cells = goesWith(w.ns, w.evs, { factors: w.factors, seed: s }); clear += cells.filter((c) => c.sure === "clear").length; likely += cells.filter((c) => c.sure === "likely").length; }
    expect(clear).toBeLessThanOrEqual(3);
    expect(likely).toBeLessThanOrEqual(30);
  }, 60_000);
  it("the bar gets stricter with more cells tried, never looser than for ~48", () => {
    expect(bars(48).clear).toBeCloseTo(0.002, 6); expect(bars(48).likely).toBeCloseTo(0.02, 6);
    expect(bars(10)).toEqual({ clear: 0.002, likely: 0.02 });
    expect(bars(125).clear).toBeCloseTo(0.0008, 6); expect(bars(125).likely).toBeCloseTo(0.008, 6);
  });
});
