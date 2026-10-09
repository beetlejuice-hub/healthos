import { describe, expect, it } from "vitest";
import type { HrMinute } from "./band";
import { rng } from "./bench";
import type { Check } from "./feelgraph";
import { aroundChecks, awakeByDay, dayNumbers, heartOutcomes, raisedStretches, roll, whyRaised, type AwakeDay } from "./heart";
import { usualByHour } from "./hrusual";
import { FACTORS, goesWith, type Evening, type Night } from "./sleep";
import { addDays, atMinute, HOUR, MIN } from "./time";

const D0 = "2026-09-01";
/** Every minute of `day` from hour `a` to hour `b`, at v(hour). */
const minutes = (day: string, a: number, b: number, v: (h: number) => number): HrMinute[] => {
  const out: HrMinute[] = [];
  for (let m = a * 60; m < b * 60; m++) { const x = v(m / 60); out.push([atMinute(day, m), x, x - 2, x + 2]); }
  return out;
};
const T = (day: string, h: number) => atMinute(day, Math.round(h * 60));

describe("awake average", () => {
  it("leaves out sleep, workouts and the hour after: a flat 60 day with a gym session is still 60", () => {
    const hr = minutes(D0, 0, 24, (h) => (h < 7 || h >= 23 ? 50 : h >= 17 && h < 18 ? 140 : h >= 18 && h < 19 ? 100 : 60));
    const sleep = [{ start: T(D0, 0), end: T(D0, 7) }, { start: T(D0, 23), end: T(D0, 24) }];
    const a = awakeByDay(hr, sleep, [{ start: T(D0, 17), end: T(D0, 18) }]).get(D0)!;
    expect(a.avg).toBeCloseTo(60, 6);
    // 07:00–23:00 is 960 minutes; 16:55–19:00 (5 min before, the hour after) leaves 835.
    expect(a.min).toBe(835);
  });
  it("a day with under 8 hours of awake minutes has no awake average", () => {
    const hr = minutes(D0, 7, 14.9, () => 60);
    expect(awakeByDay(hr, [], []).has(D0)).toBe(false);
    expect(awakeByDay(minutes(D0, 7, 15, () => 60), [], []).has(D0)).toBe(true);
  });
});

describe("one day against your usual", () => {
  it("above / below is judged on 5-minute averages, like the chart: minutes jumping ±5 around your usual aren't above or below", () => {
    const hr: HrMinute[] = [];
    for (let i = 1; i <= 10; i++) hr.push(...minutes(addDays(D0, -i), 7, 23, () => 60));
    const usual = usualByHour(hr, [], D0);
    hr.push(...minutes(D0, 8, 12, (h) => (Math.round(h * 60) % 2 ? 65 : 55)));
    const n = dayNumbers(hr, [], [], usual, D0);
    expect(n.minutes).toBe(240);
    expect(n.above).toBe(0);
    expect(n.below).toBe(0);
  });
  it("average, your usual over the same minutes, and minutes above / below the band — a morning only", () => {
    const hr: HrMinute[] = [];
    for (let i = 1; i <= 10; i++) hr.push(...minutes(addDays(D0, -i), 7, 23, () => 60));
    const usual = usualByHour(hr, [], D0);
    hr.push(...minutes(D0, 0, 12, (h) => (h < 7 ? 50 : h >= 8 && h < 10 ? 70 : h >= 10 && h < 11 ? 50 : 60)));
    const n = dayNumbers(hr, [{ start: T(D0, 0), end: T(D0, 7) }], [], usual, D0);
    expect(n.minutes).toBe(300);
    expect(n.avg).toBeCloseTo((60 * 60 + 120 * 70 + 60 * 50 + 60 * 60) / 300, 6);
    expect(n.usualAvg).toBeCloseTo(60, 6);
    expect(n.above).toBe(120);
    expect(n.below).toBe(60);
  });
});

/** A night that only the grid looks at: evening `i` days after D0, bed 23:00. */
function night(i: number, o: Partial<Night>): Night {
  const eve = addDays(D0, i), day = addDays(D0, i + 1), bed = T(eve, 23), up = T(day, 7);
  return { id: eve, day, eve, bed, up, onset: bed, wake: up, asleep: 450, deep: 80, rem: 90, light: 280, awake: 20, wakes: 2, latency: 10, stages: [], low: 50, lowAt: null, hrv: 45, rhr: 52, nap: null, ...o };
}
const evening = (o: Partial<Evening>): Evening => ({ drinks: [], caffeineAtBed: 0, trained: false, ateLate: false, rating: null, ...o });

describe("what goes with the next morning", () => {
  it("finds planted drink mornings (+4 bpm resting, −10 ms HRV), clear and toward worse; nothing else clear", () => {
    const { r, g } = rng(5);
    const ns: Night[] = [], evs: Evening[] = [], awake = new Map<string, AwakeDay>();
    for (let i = 0; i < 30; i++) {
      const drinks = i % 3 === 0;
      ns.push(night(i, { rhr: 52 + g() + (drinks ? 4 : 0), hrv: 45 + g() * 3 - (drinks ? 10 : 0) }));
      evs.push(evening({ drinks: drinks ? [T(addDays(D0, i), 21)] : [], caffeineAtBed: r() < 0.3 ? 60 : 0, trained: r() < 0.45, ateLate: r() < 0.25 }));
      awake.set(addDays(D0, i + 1), { avg: 66 + g() * 1.5, min: 900 });
    }
    const cells = goesWith(ns, evs, { factors: FACTORS, outcomes: heartOutcomes(awake), perms: 2000 });
    const cell = (f: string, o: string) => cells.find((c) => c.factor === f && c.outcome === o)!;
    expect(cell("drinks", "rhr")).toMatchObject({ sure: "clear", toward: "worse", nWith: 10, nWithout: 20 });
    expect(cell("drinks", "rhr").diff!).toBeGreaterThan(3);
    expect(cell("drinks", "hrv")).toMatchObject({ sure: "clear", toward: "worse" });
    expect(cell("drinks", "hrv").diff!).toBeLessThan(-7);
    expect(cells.filter((c) => c.sure === "clear").map((c) => `${c.factor}×${c.outcome}`).sort()).toEqual(["drinks×hrv", "drinks×rhr"]);
  });
  it("the awake column is the day after the evening — the morning's own day", () => {
    const awake = new Map<string, AwakeDay>([[addDays(D0, 1), { avg: 71, min: 900 }], [D0, { avg: 60, min: 900 }]]);
    expect(heartOutcomes(awake).find((o) => o.id === "awake")!.of(night(0, {}), evening({}))).toBe(71);
  });
});

/**
 * 30 days, 07:00–23:00: heart rate higher in the afternoon every day (the trap), a different level each day, minute
 * noise; check-ins at about 10:00, 15:00 and 20:00, with more stress given at 15:00. `k` bpm per point of stress is
 * planted in the hour around each check-in.
 */
function checkWorld(seed: number, k: number) {
  const { r, g } = rng(seed);
  const hr: HrMinute[] = [], checks: Check[] = [];
  for (let i = 0; i < 30; i++) {
    const day = addDays(D0, i), off = g() * 2;
    const cs = [10, 15, 20].map((h) => ({ at: T(day, h + r() * 0.5), stress: Math.max(1, Math.min(9, Math.round((h === 15 ? 6.5 : 3.5) + g() * 1.5))) }));
    checks.push(...cs);
    hr.push(...minutes(day, 7, 23, (h) => {
      const t = T(day, h), near = cs.find((c) => Math.abs(c.at - t) <= 60 * MIN);
      return 62 + 8 * Math.sin(((h - 9) / 14) * Math.PI) + off + (near ? k * (near.stress - 5) : 0) + g() * 2;
    }));
  }
  return { hr, checks, usual: usualByHour(hr, [], addDays(D0, 30), 31) };
}

describe("heart rate around a check-in, by the stress you gave", () => {
  it("finds a planted +0.8 bpm per point, clear", () => {
    const w = checkWorld(3, 0.8), a = aroundChecks(w.checks, w.hr, w.usual, []);
    expect(a.pts.length).toBe(90);
    expect(a.sure).toBe("clear");
    expect(a.slope!).toBeGreaterThan(0.5);
    expect(a.slope!).toBeLessThan(1.1);
  });
  it("doesn't take the afternoon's higher heart rate for stress: nothing planted, nothing found", () => {
    const w = checkWorld(3, 0), a = aroundChecks(w.checks, w.hr, w.usual, []);
    expect(a.sure).not.toBe("clear");
    expect(Math.abs(a.slope!)).toBeLessThan(0.3);
  });
  it("across 12 worlds with nothing planted, clear stays rare", () => {
    let clear = 0, likely = 0;
    for (let s = 1; s <= 12; s++) { const w = checkWorld(100 + s, 0), a = aroundChecks(w.checks, w.hr, w.usual, [], { perms: 400 }); if (a.sure === "clear") clear++; if (a.sure === "likely") likely++; }
    expect(clear).toBe(0);
    expect(likely).toBeLessThanOrEqual(2);
  });
  it("…nor the climb inside one window: 12:00 check-ins calm, 14:30 ones stressed, heart rate rising 12→15 every day", () => {
    const { g } = rng(9), hr: HrMinute[] = [], checks: Check[] = [];
    for (let i = 0; i < 30; i++) {
      const day = addDays(D0, i);
      hr.push(...minutes(day, 7, 23, (h) => 60 + (h >= 12 && h < 15 ? 4 * (h - 12) : h >= 15 ? 12 : 0) + g() * 2));
      checks.push({ at: T(day, 12), stress: Math.round(3 + g()) }, { at: T(day, 14.5), stress: Math.round(7 + g()) });
    }
    const a = aroundChecks(checks, hr, usualByHour(hr, [], addDays(D0, 30), 31), []);
    expect(a.pts.length).toBe(60);
    expect(a.sure).not.toBe("clear");
    expect(Math.abs(a.slope!)).toBeLessThan(0.4);
  });
  it("check-ins near a workout, or with the band off, are left out; under 12 it says too few", () => {
    const w = checkWorld(3, 0.8), first = w.checks[0];
    const a = aroundChecks(w.checks, w.hr, w.usual, [{ start: first.at + 10 * MIN, end: first.at + HOUR }]);
    expect(a.pts.length).toBe(89);
    const off = aroundChecks([{ at: T(addDays(D0, 40), 12), stress: 5 }], w.hr, w.usual, []);
    expect(off.pts.length).toBe(0);
    expect(aroundChecks(w.checks.slice(0, 11), w.hr, w.usual, []).sure).toBe("too few");
  });
});

describe("7-day average", () => {
  it("averages what's there in the last 7, when at least 4 are", () => {
    expect(roll([1, 2, 3, null, 5, 6, 7, 8])).toEqual([null, null, null, null, 11 / 4, 17 / 5, 24 / 6, 31 / 6]);
  });
});

describe("raised stretches", () => {
  // ten flat days at 60 make a usual of 60 (band 57–63); today is flat 60 apart from what each test adds
  const base: HrMinute[] = []; for (let i = 1; i <= 10; i++) base.push(...minutes(addDays(D0, -i), 7, 23, () => 60));
  const usual = usualByHour(base, [], D0);
  const day = (v: (h: number) => number) => minutes(D0, 7, 23, v);
  const find = (hr: HrMinute[], workouts: { start: number; end: number }[] = [], sleep: { start: number; end: number }[] = []) => raisedStretches(hr, sleep, workouts, usual, T(D0, 0), T(D0, 24));
  it("40 minutes at +18: one stretch, very, where it was", () => {
    const r = find(day((h) => (h >= 14 && h < 14 + 40 / 60 ? 78 : 60)));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ start: T(D0, 14), end: T(D0, 14 + 40 / 60), level: "very" });
    expect(r[0].excess).toBeCloseTo(18, 6);
  });
  it("30 minutes at +7: slightly; 15 minutes at +8: too short to say", () => {
    expect(find(day((h) => (h >= 10 && h < 10.5 ? 67 : 60)))).toEqual([expect.objectContaining({ level: "slightly", start: T(D0, 10), end: T(D0, 10.5) })]);
    expect(find(day((h) => (h >= 10 && h < 10.25 ? 68 : 60)))).toEqual([]);
  });
  it("one 5-minute dip doesn't end a stretch; two do", () => {
    const one = find(day((h) => (h >= 15 && h < 15 + 50 / 60 && !(h >= 15 + 20 / 60 && h < 15 + 25 / 60) ? 72 : 60)));
    expect(one).toHaveLength(1);
    expect(one[0].end - one[0].start).toBe(50 * MIN);
    const two = find(day((h) => (h >= 15 && h < 15 + 50 / 60 && !(h >= 15 + 20 / 60 && h < 15 + 30 / 60) ? 72 : 60)));
    expect(two.map((r) => (r.end - r.start) / MIN)).toEqual([20, 20]);
  });
  it("training, the hour after, and sleep are left out — they're known", () => {
    const hr = day((h) => (h >= 17 && h < 19.5 ? 110 : 60));
    expect(find(hr, [{ start: T(D0, 17), end: T(D0, 18.5) }])).toEqual([]);
    expect(find(day((h) => (h < 7.5 ? 75 : 60)), [], [{ start: T(D0, 0), end: T(D0, 7.5) }])).toEqual([]);
  });
  it("what's logged around it: coffee before, what you said, a stressful check-in; nothing → nothing", () => {
    const r = { start: T(D0, 14), end: T(D0, 14.75) };
    const es = [
      { kind: "drink", at: T(D0, 13), name: "Coffee", caffeineMg: 95, alcoholG: 0 },
      { kind: "drink", at: T(D0, 9), name: "Coffee", caffeineMg: 95, alcoholG: 0 }, // too early
      { kind: "feel", at: T(D0, 14.5), doing: ["outside"], stress: 8 },
      { kind: "food", at: T(D0, 13.5), macros: { kcal: 650 } },
    ];
    expect(whyRaised(r, es).map((w) => w.kind)).toEqual(["coffee", "meal", "said"]);
    expect(whyRaised(r, [{ kind: "feel", at: T(D0, 14.2), stress: 8 }])).toEqual([{ kind: "stress", at: T(D0, 14.2), level: 8 }]);
    expect(whyRaised(r, [])).toEqual([]);
  });
  it("walking during it (PLAN 66): explained by the band's steps — no need to ask; pottering about isn't walking", () => {
    const r = { start: T(D0, 14), end: T(D0, 14.75) };
    const walk = [0, 1, 2, 3].map((i) => [T(D0, 14) + i * 5 * 60_000, 5, 480] as [number, number, number]);
    expect(whyRaised(r, [], walk)).toEqual([{ kind: "moving", at: r.start, steps: 1920 }]);
    expect(whyRaised(r, [{ kind: "drink", at: T(D0, 13), caffeineMg: 95, alcoholG: 0 }], walk).map((w) => w.kind)).toEqual(["coffee", "moving"]); // in time order, like the rest
    const potter = Array.from({ length: 9 }, (_, i) => [T(D0, 14) + i * 5 * 60_000, 5, 40] as [number, number, number]);
    expect(whyRaised(r, [], potter)).toEqual([]);
    expect(whyRaised(r, [], walk.map(([t, m, n]) => [t + 3 * 3600_000, m, n]))).toEqual([]); // a walk later that day
  });
});
