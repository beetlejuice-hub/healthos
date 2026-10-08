import { describe, expect, it } from "vitest";
import { hrWorld } from "./bench";
import { afterCoffee, afterWorkouts, coffeeWindows, everydayRange, minuteMap, usualAt, usualByHour, usualReady, workoutWindows, USUAL_MIN_DAYS } from "./hrusual";
import { addDays, atMinute } from "./time";

const LAST = "2026-10-28";
const at = (day: string, hh: number, mm = 0) => atMinute(day, hh * 60 + mm);

describe("your usual for the hour", () => {
  const w = hrWorld({ seed: 1, days: 15, lastDay: LAST, coffeeRate: 0, coffeeBpm: 0, workoutRate: 0.5 });
  const u = usualByHour(w.hr, w.workouts, LAST);
  it("asleep ~56, daytime ~70, from the days before today only", () => {
    expect(usualAt(u, at(LAST, 3))!.mid).toBeGreaterThan(53); expect(usualAt(u, at(LAST, 3))!.mid).toBeLessThan(59);
    expect(usualAt(u, at(LAST, 13))!.mid).toBeGreaterThan(67); expect(usualAt(u, at(LAST, 13))!.mid).toBeLessThan(75);
    expect(u.days).toBe(14);
  });
  it("the band is at least ±3 bpm and holds most days", () => {
    const b = usualAt(u, at(LAST, 13))!;
    expect(b.hi - b.mid).toBeGreaterThanOrEqual(3); expect(b.mid - b.lo).toBeGreaterThanOrEqual(3);
  });
  it("workouts (and the hour after) don't make 17:30 'usual'", () => {
    // Half the days train 17:00–18:00 at ~135 bpm; the usual there stays everyday.
    expect(usualAt(u, at(LAST, 17, 30))!.mid).toBeLessThan(78);
  });
  it(`fewer than ${USUAL_MIN_DAYS} earlier days: no usual yet`, () => {
    const few = hrWorld({ seed: 2, days: USUAL_MIN_DAYS, lastDay: LAST, coffeeRate: 0, coffeeBpm: 0 });
    const u2 = usualByHour(few.hr, [], LAST);
    expect(usualReady(u2)).toBe(false);
    expect(u2.days).toBe(USUAL_MIN_DAYS - 1);
    expect(usualAt(u2, at(LAST, 12))).toBeNull();
  });
});

describe("windows after a coffee (B)", () => {
  it("+N vs usual in the 30–90 min after, peak ~45 min; two coffees within 2 h share a window", () => {
    const w = hrWorld({ seed: 3, days: 15, lastDay: LAST, coffeeRate: 0, coffeeBpm: 0 });
    const u = usualByHour(w.hr, [], LAST);
    // Plant 8 bpm after a 10:00 coffee today.
    const c = at(LAST, 10);
    const hr = w.hr.map((m) => { if (m[0] <= c) return m; const x = (m[0] - c) / 60_000, v = Math.round(m[1] + 8 * (x / 45) * Math.exp(1 - x / 45)); return [m[0], v, v - 3, v + 3] as [number, number, number, number]; });
    const [win] = coffeeWindows([{ at: c, mg: 95 }, { at: c + 50 * 60_000, mg: 60 }], minuteMap(hr), u);
    expect(win.count).toBe(2); expect(win.mg).toBe(155);
    expect(win.end).toBe(c + 50 * 60_000 + 2 * 3600_000);
    expect(win.vs).toBe("usual");
    expect(win.delta!).toBeGreaterThan(4); expect(win.delta!).toBeLessThan(11);
    expect(Math.abs((win.peakAt! - c) / 60_000 - 45)).toBeLessThan(25);
  });
  it("no usual yet: against the half hour before; band off: no number", () => {
    const w = hrWorld({ seed: 4, days: 1, lastDay: LAST, coffeeRate: 0, coffeeBpm: 0 });
    const c = at(LAST, 13);
    const [a] = coffeeWindows([{ at: c, mg: 95 }], minuteMap(w.hr), null);
    // One window is just a description: the half hour before vs after wanders a few bpm on its own.
    expect(a.vs).toBe("before"); expect(Math.abs(a.delta!)).toBeLessThan(9);
    const off = w.hr.filter((m) => m[0] < c - 40 * 60_000 || m[0] > c + 3 * 3600_000);
    const [b] = coffeeWindows([{ at: c, mg: 95 }], minuteMap(off), null);
    expect(b.delta).toBeNull(); expect(b.peakAt).toBeNull(); expect(b.vs).toBeNull();
  });
});

describe("a workout's window (B)", () => {
  it("peak, average, and back to usual in about tau × ln(excess / 3) minutes", () => {
    const w = hrWorld({ seed: 5, days: 15, lastDay: LAST, coffeeRate: 0, coffeeBpm: 0, workoutRate: 1, tauMin: 12 });
    const u = usualByHour(w.hr, w.workouts, LAST);
    const today = w.workouts.at(-1)!;
    const [win] = workoutWindows([today], w.hr, u);
    expect(win.peak!).toBeGreaterThan(138); expect(win.avg!).toBeGreaterThan(130); expect(win.avg!).toBeLessThan(140);
    // excess ≈ 130 − 71 ≈ 59 bpm → 12 × ln(59 / 3) ≈ 36 min (noise ± a few)
    expect(win.backMin!).toBeGreaterThan(24); expect(win.backMin!).toBeLessThan(48);
    expect(win.vs).toBe("usual");
  });
  it("after-workout card: average time back across workouts", () => {
    const w = hrWorld({ seed: 6, days: 15, lastDay: LAST, coffeeRate: 0, coffeeBpm: 0, workoutRate: 0.6, tauMin: 15 });
    const u = usualByHour(w.hr, w.workouts, LAST);
    const a = afterWorkouts(w.workouts, w.hr, u);
    expect(a.n).toBe(w.workouts.length);
    expect(a.backMin!).toBeGreaterThan(32); expect(a.backMin!).toBeLessThan(58); // 15 × ln(59/3) ≈ 45
    expect(a.curve[0][1]).toBeGreaterThan(40); expect(a.curve.at(-1)![1]).toBeLessThan(5);
  });
});

describe("after every coffee (C) — planted effects", () => {
  it("finds a planted +6 bpm, at about the right size, peaking ~45 min", () => {
    const w = hrWorld({ seed: 7, days: 28, lastDay: LAST, coffeeRate: 0.6, coffeeBpm: 6 });
    const a = afterCoffee(w.doses, w.hr, w.workouts);
    expect(a.n).toBeGreaterThanOrEqual(12);
    // 30–90 min after a bump peaking at 6 averages ≈ 5.5
    expect(a.effect!).toBeGreaterThan(3.5); expect(a.effect!).toBeLessThan(7.5);
    expect(a.sure).toBe("clear");
    expect(Math.abs(a.peakMin! - 45)).toBeLessThanOrEqual(25);
    expect(a.curve.find((p) => p[0] === -30)![1]).toBeLessThan(2); // lined up: ~0 before the coffee
  });
  it("finds nothing when nothing was planted — even though coffee comes during the morning climb", () => {
    let clear = 0, likely = 0;
    for (let seed = 100; seed < 112; seed++) {
      const w = hrWorld({ seed, days: 28, lastDay: LAST, coffeeRate: 0.6, coffeeBpm: 0 });
      const a = afterCoffee(w.doses, w.hr, w.workouts);
      expect(Math.abs(a.effect!)).toBeLessThan(2.5);
      if (a.sure === "clear") clear++; if (a.sure === "likely") likely++;
    }
    // Calibrated over 120 worlds (8 Oct): "likely" 1 in 120, "clear" never; a planted +6 is "clear" 30 of 30.
    expect(clear).toBe(0); expect(likely).toBeLessThanOrEqual(1);
  });
  it("too few coffees: says so instead of a verdict", () => {
    const w = hrWorld({ seed: 8, days: 8, lastDay: LAST, coffeeRate: 0.5, coffeeBpm: 6 });
    const a = afterCoffee(w.doses, w.hr, w.workouts);
    expect(a.n).toBeLessThan(8); expect(a.sure).toBe("too few");
  });
  it("leaves out a coffee right after another and one with a workout in its window", () => {
    const w = hrWorld({ seed: 9, days: 10, lastDay: LAST, coffeeRate: 0, coffeeBpm: 0 });
    const d = addDays(LAST, -2);
    const doses = [{ at: at(d, 9), mg: 95 }, { at: at(d, 10), mg: 95 }, { at: at(LAST, 16), mg: 95 }];
    const a = afterCoffee(doses, w.hr, [{ start: at(LAST, 17), end: at(LAST, 18) }]);
    expect(a.n).toBe(1); // only the 09:00 one
  });
});

describe("the lane's scale", () => {
  it("everyday range leaves workouts out", () => {
    const w = hrWorld({ seed: 10, days: 5, lastDay: LAST, coffeeRate: 0, coffeeBpm: 0, workoutRate: 1 });
    const [lo, hi] = everydayRange(w.hr, w.workouts)!;
    expect(lo).toBeGreaterThan(45); expect(hi).toBeLessThan(110);
    expect(everydayRange(w.hr.slice(0, 10), [])).toBeNull();
  });
});
