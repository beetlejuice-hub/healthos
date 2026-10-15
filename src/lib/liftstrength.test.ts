import { describe, expect, it } from "vitest";
import { HOLDING, liftTrend, mainLifts, muscleStrength, sessions, setsPerMuscleWeek, thisWeek, weekStart } from "./liftstrength";
import { rng } from "./bench";
import type { LoggedSet } from "./training";

const D = 86_400_000;
/**
 * 12 weeks from Mon 20 Jul 2026, Mon/Wed/Fri at 18:00: bench, squat, row, 3 working sets each plus a warm-up.
 * Planted: +0.6 % a week on every lift; Fridays +3.5 % above the trend (the "good day" a session's % should find).
 */
function world(seed = 5) {
  const { g } = rng(seed), sets: LoggedSet[] = [], workouts: { id: string; template: string; startedAt: number; endedAt: number }[] = [];
  const base: Record<string, number> = { "Bench press": 100, Squat: 130, "Barbell row": 85 };
  const t0 = new Date(2026, 6, 20, 18).getTime();
  for (let w = 0; w < 12; w++) for (const dow of [0, 2, 4]) {
    const at = t0 + (w * 7 + dow) * D, id = `w${w}-${dow}`, fri = dow === 4;
    workouts.push({ id, template: "Full", startedAt: at, endedAt: at + 3_600_000 });
    for (const [ex, b] of Object.entries(base)) {
      const target = b * (1 + 0.006 * (w + dow / 7)) * (1 + ((fri ? 3.5 : 0) + g() * 0.6) / 100), kg = target / (1 + 5 / 30);
      sets.push({ at: at + 60_000, workoutId: id, exercise: ex, kg: Math.round(kg * 0.5), reps: 10, warmup: true });
      for (let k = 0; k < 3; k++) sets.push({ at: at + (k + 2) * 60_000, workoutId: id, exercise: ex, kg: k ? kg * 0.95 : kg, reps: 5 });
    }
  }
  return { sets, workouts, t0 };
}

describe("Training A · your lifts (PLAN 64)", () => {
  it("each lift against its own line: the planted +0.6 % a week comes out as the line's gain", () => {
    const w = world(), t = liftTrend(w.sets, "Bench press")!;
    expect(t.pts).toHaveLength(36);
    expect(t.gain / t.v0 * 100).toBeGreaterThan(5.5); expect(t.gain / t.v0 * 100).toBeLessThan(8.5); // 0.6 % × ~11.6 weeks ≈ 7 %
  });
  it("a session's strength against the trends finds the planted Fridays (+3.5 % vs the other days)", () => {
    const w = world(), ss = sessions(w.workouts, w.sets);
    const m = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const fri = m(ss.filter((s) => new Date(s.startedAt).getDay() === 5).map((s) => s.pct!)), rest = m(ss.filter((s) => new Date(s.startedAt).getDay() !== 5).map((s) => s.pct!));
    expect(fri - rest).toBeGreaterThan(2.8); expect(fri - rest).toBeLessThan(4.2);
    expect(ss.every((s) => s.lifts.length === 3 && s.workingSets === 9)); // warm-ups never count
    expect(ss[0].volume).toBeGreaterThan(0);
  });
  it("a lift with under 3 sessions has no line, and doesn't count in a session's %", () => {
    const w = world(), one: LoggedSet = { at: w.t0 + 2 * D, workoutId: "w0-2", exercise: "Curl", kg: 20, reps: 10 };
    expect(liftTrend([...w.sets, one], "Curl")).toBeNull();
    expect(sessions(w.workouts, [...w.sets, one]).find((s) => s.id === "w0-2")!.lifts.map((l) => l.exercise)).not.toContain("Curl");
  });
  it("the main lifts: most-trained first, only ones with a line", () => {
    const w = world();
    expect(mainLifts(w.sets).map((t) => t.exercise).sort()).toEqual(["Barbell row", "Bench press", "Squat"]);
  });
  it("this week starts Monday 00:00: Sunday 23:59 is last week's; usual from the 4 weeks before", () => {
    const sun = new Date(2026, 9, 11, 23, 59).getTime(), mon = new Date(2026, 9, 12, 0, 0).getTime();
    expect(weekStart(sun)).toBe(new Date(2026, 9, 5).getTime()); expect(weekStart(mon)).toBe(mon);
    const w = world(), ss = sessions(w.workouts, w.sets), now = w.t0 + (11 * 7 + 2) * D + 2 * 3_600_000; // Wed of week 12, after the session
    const tw = thisWeek(ss, now);
    expect(tw.sessions).toBe(2); expect(tw.workingSets).toBe(18); expect(tw.usualSessions).toBe(3); expect(tw.usualSets).toBe(27);
    expect(thisWeek(ss, w.t0 + 9 * D).usualSessions).toBeNull(); // week 2: no 4 weeks behind it yet
  });
  it("working sets per muscle: secondary muscles count half; usual = the 4 weeks before, a week", () => {
    const w = world(), now = w.t0 + (11 * 7 + 2) * D + 2 * 3_600_000, per = setsPerMuscleWeek(w.sets, now);
    const of = (m: string) => per.find((x) => x.muscle === m)!;
    expect(of("Chest").usual).toBe(9); expect(of("Triceps").usual).toBe(4.5); // bench 3 sets × 3 days; half for triceps
    expect(of("Chest").now).toBe(6);
  });
});

describe("strength per muscle (PLAN 82)", () => {
  /** 8 weeks, Mon/Thu: each lift's 5-rep best moving `rate` % a week from `base`, ±0.5 % noise. */
  function lifts(spec: Record<string, [number, number]>, seed = 3, weeks = 8) {
    const { g } = rng(seed), sets: LoggedSet[] = [], t0 = new Date(2026, 7, 17, 18).getTime();
    for (let w = 0; w < weeks; w++) for (const dow of [0, 3]) {
      const at = t0 + (w * 7 + dow) * D, id = `m${w}-${dow}`;
      for (const [ex, [base, rate]] of Object.entries(spec)) {
        const e1 = base * (1 + (rate / 100) * (w + dow / 7)) * (1 + (g() * 0.5) / 100);
        sets.push({ at, workoutId: id, exercise: ex, kg: e1 / (1 + 5 / 30), reps: 5 });
      }
    }
    return { sets, now: t0 + (weeks * 7 - 1) * D };
  }
  const by = (r: ReturnType<typeof muscleStrength>) => Object.fromEntries(r.map((x) => [x.muscle, x]));

  it("planted: bench +1 % a week and incline press +3 % → chest about +2 %, whatever their kilos", () => {
    const w = lifts({ "Bench press": [100, 1], "Incline DB press": [30, 3], Squat: [140, 0], "Romanian deadlift": [120, -1.5] });
    const m = by(muscleStrength(w.sets, w.now));
    expect(m.Chest.perWeek).toBeGreaterThan(1.7); expect(m.Chest.perWeek).toBeLessThan(2.3);
    expect(m.Chest.lifts.map((l) => l.exercise).sort()).toEqual(["Bench press", "Incline DB press"]);
    expect(m.Chest.state).toBe("stronger");
    expect(Math.abs(m.Quads.perWeek)).toBeLessThan(0.25); // flat squat, steady data: holding, not a trend
    expect(m.Quads.state).toBe("holding");
    expect(m.Hamstrings.perWeek).toBeLessThan(-1.2); expect(m.Hamstrings.perWeek).toBeGreaterThan(-1.8); // planted drop found
    expect(m.Hamstrings.state).toBe("dropping");
  });
  it("only a muscle's own lifts: bench's half credit to triceps and shoulders doesn't make them a trend", () => {
    const m = by(muscleStrength(lifts({ "Bench press": [100, 2] }).sets, lifts({ "Bench press": [100, 2] }).now));
    expect(Object.keys(m)).toEqual(["Chest"]);
  });
  it("the lift trained more counts more: 2 sessions a week against 1", () => {
    const a = lifts({ "Bench press": [100, 2] }), b = lifts({ Dips: [90, 0] });
    const once = b.sets.filter((s) => s.workoutId.endsWith("-0")); // dips only on Mondays
    const m = by(muscleStrength([...a.sets, ...once], a.now));
    expect(m.Chest.perWeek).toBeGreaterThan(1.1); expect(m.Chest.perWeek).toBeLessThan(1.6); // (2·16 + 0·8) / 24 ≈ 1.33
  });
  it("noisy data says so: a flat lift once a week with ±3 % days is 'not clear yet', not 'holding'", () => {
    const { g } = rng(9), sets: LoggedSet[] = [], t0 = new Date(2026, 7, 17, 18).getTime();
    for (let w = 0; w < 8; w++) sets.push({ at: t0 + w * 7 * D, workoutId: `q${w}`, exercise: "Squat", kg: (140 * (1 + (g() * 3) / 100)) / (1 + 5 / 30), reps: 5 });
    const [q] = muscleStrength(sets, t0 + 55 * D);
    expect(q.state).toBe("unclear");
    expect(q.lo).toBeLessThan(-HOLDING); expect(q.hi).toBeGreaterThan(HOLDING);
  });
  it("only the last 8 weeks, and a lift needs 3 sessions in them", () => {
    const w = lifts({ "Bench press": [100, 2] }, 3, 20);
    const m = by(muscleStrength(w.sets, w.now));
    expect(m.Chest.sessions).toBe(16);
    const two = lifts({ "Bench press": [100, 2] }, 3, 1); // 2 sessions
    expect(muscleStrength(two.sets, two.now)).toEqual([]);
  });
});
