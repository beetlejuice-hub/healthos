// "A pattern, with today on it" (owner, 28 Oct: "I liked charts and connecting dots, trying to find patterns in a lot
// of data points"). Known answers: 60 planted days where caffeine after 14:00 costs 0.01 h of sleep per mg the next day;
// the points are paired the way the scout pairs them (the next day, only days that are over); the line's slope comes
// out at the planted −0.01; today's 80 mg lands on the line at the planted value; today without a value has no dot.
import { describe, expect, it } from "vitest";
import { patternCard, patternCards, todayWords } from "./todaypattern";
import type { Pattern, Signal } from "./scout";
import type { DayFacts } from "./insights";

const day = (k: number) => { const d = new Date(2026, 8, 1 + k, 12); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const TODAY = day(60);
// caffeine after 14:00: 0–200 mg; the next night's sleep: 7.5 h − 0.01 h per mg, ± a little
const facts = (todayMg: number | null): DayFacts[] => Array.from({ length: 61 }, (_, k) => {
  const mg = k === 60 ? todayMg : (k * 37) % 200, prev = k === 0 ? 0 : (((k - 1) * 37) % 200);
  return { day: day(k), lateCaffeineMg: mg, asleepMin: k === 60 ? null : (7.5 - 0.01 * prev + ((k % 3) - 1) * 0.05) * 60 } as unknown as DayFacts;
});
const sig = (id: string, name: string, unit: string, get: (d: DayFacts) => number | null, yes?: string): Signal => ({ id, family: id, name, unit, get, ...(yes ? { yes } : {}) }) as Signal;
const LATE = sig("lateCaf", "caffeine after 14:00", "mg", (d) => (d as unknown as { lateCaffeineMg: number | null }).lateCaffeineMg);
const SLEEP = sig("asleep", "sleep", "h", (d) => { const m = (d as unknown as { asleepMin: number | null }).asleepMin; return m == null ? null : m / 60; });
const P = (over: Partial<Pattern> = {}): Pattern => ({ id: "caf~sleep", a: LATE, b: SLEEP, lag: 1, r: -0.8, p: 1e-6, q: 1e-5, n: 59, sign: -1, held: 18, of: 20, days: [], text: "With more caffeine after 14:00, sleep the next day tends to be lower", ...over }) as Pattern;

describe("one link, as a card", () => {
  it("planted: 59 next-day pairs over days that are over; the slope comes out at −0.01 h per mg", () => {
    const c = patternCard(P(), facts(80), TODAY);
    expect(c.pts).toHaveLength(59);
    expect(c.fit!.slope).toBeCloseTo(-0.01, 3);
    expect(c.title).toBe("Caffeine after 14:00 → sleep the next day");
    expect(c.grade).toBe("strong");
  });
  it("today's 80 mg sits on the line at the planted 7.5 − 0.8 h", () => {
    const c = patternCard(P(), facts(80), TODAY);
    expect(c.today).toBe(80);
    expect(c.onLine!).toBeCloseTo(6.7, 1);
    expect(todayWords(c)).toBe("Today: 80 mg so far — on the line, that goes with sleep 6.7 h the next day.");
  });
  it("past the days it has seen, the line is held at what it has seen (no 2 h night from 900 mg)", () => {
    const c = patternCard(P(), facts(900), TODAY);
    expect(c.onLine).toBe(Math.min(...c.pts.map((q) => q[1])));
  });
  it("controls: nothing today → no dot, says so; an early link says it's early", () => {
    const c = patternCard(P(), facts(null), TODAY);
    expect([c.today, c.onLine, todayWords(c)]).toEqual([null, null, "Today: no caffeine after 14:00 logged yet."]);
    expect(patternCard(P({ p: 0.003, q: 0.004 }), facts(80), TODAY).grade).toBe("early");
  });
});

describe("Today's cards", () => {
  it("strongest first, but the ones with today on them before the rest; too few days left out; three at most", () => {
    const noToday = P({ id: "x~sleep", r: -0.95, a: sig("x", "x", "", (d) => (d.day === TODAY ? null : (d as unknown as { lateCaffeineMg: number }).lateCaffeineMg)) });
    const few = P({ id: "few", r: -0.99, a: sig("f", "f", "", (d) => (d.day > day(52) ? 1 : null)) });
    const weak = P({ id: "weak", r: -0.4 }), strong = P({ id: "strong", r: -0.9 }), fourth = P({ id: "fourth", r: -0.5 });
    expect(patternCards([weak, noToday, few, strong, fourth], facts(80), TODAY).map((c) => c.id)).toEqual(["strong", "fourth", "weak"]);
    expect(patternCards([noToday], facts(80), TODAY).map((c) => c.id)).toEqual(["x~sleep"]);
    expect(patternCards([], facts(80), TODAY)).toEqual([]);
  });
  it("a yes/no first thing: today's yes, in words", () => {
    const GYM = sig("gym", "gym", "", (d) => ((d as unknown as { lateCaffeineMg: number }).lateCaffeineMg > 100 ? 1 : 0), "a gym day");
    const c = patternCard(P({ a: GYM, lag: 0 }), facts(150), TODAY);
    expect([c.yes, c.today, todayWords(c).startsWith("Today: a gym day so far")]).toEqual([true, 1, true]);
  });
});
