// PLAN 209 — two things together, and what's new each week. Planted worlds with known answers.
// Combos: late to bed and drinks each cost next-day focus 0.5, and together 1.5 more than that (worse together); late
// caffeine costs 0.5 and just adds up with drinks. Controls: focus at random — no pair clear across five worlds.
// New this week: nights out lower the next morning's HRV 10 ms; a week ago there were only 3 (too few to say), now 5 —
// "New" ripple. Control: the same nights with no HRV effect — nothing new about it.
import { describe, expect, it } from "vitest";
import { combos, standPairs } from "./combos";
import { dayTable } from "./daytable";
import type { DayFacts } from "./insights";
import { newThisWeek } from "./newfindings";
import { addDays } from "./time";

const TODAY = "2026-11-11";
function rng(seed: number) { let s = seed; return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r: () => number) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const fact = (day: string, f: Partial<DayFacts>) => ({ day, logged: true, alcoholG: 0, lateCaffeineMg: 0, proteinG: 130, steps: 9000, trained: false, volumeKg: 0, bedLateH: 0, asleepMin: 450, focus: null, mood: null, energy: null, sleep: null, ...f }) as unknown as DayFacts;

function pairWorld(seed: number, random = false, N = 200) {
  const r = rng(seed), days: DayFacts[] = [];
  let late = 0, drinks = 0, caf = 0;
  for (let i = 0; i < N; i++) {
    const day = addDays(TODAY, -(N - 1 - i));
    const focus = random ? 6 + gauss(r) : 7.5 - 0.5 * late - 0.5 * drinks - 1.5 * late * drinks - 0.5 * caf + gauss(r) * 0.6;
    late = r() < 0.4 ? 1 : 0; drinks = r() < 0.4 ? 1 : 0; caf = r() < 0.35 ? 1 : 0;
    days.push(fact(day, { bedLateH: late ? 0.8 + r() * 0.6 : (r() - 0.6) * 0.4, alcoholG: drinks ? 14 * (1 + Math.floor(r() * 3)) : 0, lateCaffeineMg: caf ? 120 : 0,
      focus: Math.max(1, Math.min(10, focus)), proteinG: 100 + r() * 60, steps: 5000 + r() * 8000, trained: r() < 0.4 }));
  }
  return days;
}

describe("two things together (PLAN 209)", () => {
  it("late to bed × drinks: clearly worse together, about 1.5 below what the two add up to", () => {
    const c = combos(dayTable(pairWorld(1), null), "focus")!, p = c.find((x) => x.a === "late" && x.b === "drinks")!;
    expect(p.clear).toBe(true);
    expect(p.verdict).toBe("worse together");
    expect(p.inter).toBeLessThan(-0.9); expect(p.inter).toBeGreaterThan(-2.1);
    expect(c[0].a + c[0].b).toBe("latedrinks");
    expect(p.say).toMatch(/^Late to bed and drinks together: focus \d\.\d — 1\.\d lower than the two alone would add up to \(\d\.\d\)\.$/);
  });
  it("late caffeine × drinks just adds up", () => {
    const p = combos(dayTable(pairWorld(1), null), "focus")!.find((x) => x.a === "drinks" && x.b === "lateCaf")!;
    expect(p.clear).toBe(false); expect(p.verdict).toBe("adds up");
  });
  it("control: focus at random — no pair clear (five worlds, 28 pairs each, after the false-discovery correction)", () => {
    const clear = [11, 12, 13, 14, 15].flatMap((s) => combos(dayTable(pairWorld(s, true), null), "focus")!.filter((x) => x.clear));
    expect(clear.length).toBeLessThanOrEqual(1);
  });
  it("a pair that's only another pair showing through is left out: low HRV fell mostly on drink days you weren't late to bed", () => {
    // focus: late to bed × drinks as above; HRV has nothing to do with focus, but on drink days it ran low mostly when
    // you weren't late — so "drinks and a low-HRV morning" looks better together until bedtime is held still (the e2e
    // world had this by chance, with late coffee)
    const r = rng(3), days = pairWorld(2), hrv: Record<string, number> = {};
    const rows0 = dayTable(days, null);
    for (const row of rows0) { const d = (row.drinks ?? 0) >= 0.75, c = (row.bed ?? 0) >= 0.5; hrv[row.day] = d && !c ? (r() < 0.75 ? 50 : 62) : d && c ? (r() < 0.1 ? 50 : 62) : r() < 0.5 ? 50 : 62; }
    const cs = combos(dayTable(days, { hrv, rhr: {} }), "focus")!, p = cs.find((x) => x.a === "drinks" && x.b === "lowHrv")!;
    expect(cs.find((x) => x.a === "late" && x.b === "drinks")!.clear).toBe(true);
    expect(p.clear).toBe(false);
    expect(p.explainedBy).toBe("late:drinks");
    expect(p.say).toMatch(/^Drinks and a low-HRV morning: about what the two add up to, once late to bed is held still\.$/);
  });
  it("too few days: nothing", () => expect(combos(dayTable(pairWorld(1, false, 25), null), "focus")).toBeNull());
});

function weekWorld(effect: boolean) {
  const r = rng(7), days: DayFacts[] = [], hrv: Record<string, number> = {}, N = 60;
  const outs = new Set([N - 40, N - 30, N - 20, N - 7, N - 5]); // three before a week ago, two in the last week
  for (let i = 0; i < N; i++) {
    const day = addDays(TODAY, -(N - 1 - i));
    hrv[day] = 60 + gauss(r) * 2 - (effect && outs.has(i - 1) ? 10 : 0);
    days.push(fact(day, { alcoholG: outs.has(i) ? 56 : 0, focus: 6 + gauss(r) }));
  }
  return { days, band: { hrv, rhr: {} } };
}

describe("your worst pair and your best (PLAN 211)", () => {
  it("late to bed + drinks is the worst; which half costs more, and the fix names it", () => {
    const { worst } = standPairs(combos(dayTable(pairWorld(1), null), "focus")!);
    expect(worst!.c.a + ":" + worst!.c.b).toBe("late:drinks");
    expect(worst!.d).toBeLessThan(-1.5);
    expect(worst!.say).toMatch(/^Late to bed \+ drinks: focus −\d\.\d against a day with neither \(\d+ days\)\. Alone, late to bed −0\.\d and drinks −0\.\d — together far more than the two\.$/);
    expect(worst!.fix).toBe("On a day with one, skip the other — they cost far more together than apart.");
  });
  it("control: nothing planted and little noise — no worst, no best", () => {
    const flat = pairWorld(3, true).map((d) => ({ ...d, focus: 6 }));
    expect(standPairs(combos(dayTable(flat, null), "focus")!)).toEqual({ worst: null, best: null });
  });
});

describe("new in your data this week (PLAN 209)", () => {
  it("a best-against-worst row near a cut doesn't flicker: two good-focus nights out this week aren't 'Faded'", () => {
    // focus 0.5 lower after a drink (mostly one); this week two 4-drink nights land on good days — the drinks row's
    // "how far apart" slips a little across the cut, but it plainly still sets the days apart
    const r = rng(21), days: DayFacts[] = [], N = 90, outs = new Set([N - 6, N - 4]);
    let prev = 0;
    for (let i = 0; i < N; i++) {
      const day = addDays(TODAY, -(N - 1 - i)), drinks = outs.has(i) ? 4 : r() < 0.4 ? 1 : 0;
      days.push(fact(day, { alcoholG: drinks * 14, focus: outs.has(i - 1) ? 8 : Math.round(Math.max(1, Math.min(10, 7 - 0.5 * (prev > 0 ? 1 : 0) + gauss(r) * 0.6))) }));
      prev = drinks;
    }
    expect(newThisWeek(days, null, TODAY).filter((x) => x.key === "best:focus:drinks")).toEqual([]);
  });
  it("nights out: 3 a week ago (too few), 5 now — HRV's dip after them is new", () => {
    const w = weekWorld(true), items = newThisWeek(w.days, w.band, TODAY), it = items.find((x) => x.key === "ripple:out:hrv");
    expect(it?.kind).toBe("New");
    expect(it?.say).toMatch(/^After a night out, HRV −\d+(\.\d)? ms at \+1 \(from 5\) — clear now\.$/);
    expect(it?.where).toBe("Ripples");
  });
  it("control: the same nights, no dip — nothing new about HRV", () => {
    const w = weekWorld(false);
    expect(newThisWeek(w.days, w.band, TODAY).find((x) => x.key === "ripple:out:hrv")).toBeUndefined();
  });
});
