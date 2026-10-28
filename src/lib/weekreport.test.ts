// The week in training, one report (owner, 28 Oct: "a weekly overview of strength and cardio and gym performance, mostly
// graphics of how much i improved or not"). Known answers from planted weeks: lifts that grow and one that doesn't, sets
// counted by hand, cardio zones from heart rate we set, the week's edges, and an empty week as the control.
import { describe, expect, it } from "vitest";
import { weekAiLines, weekFrom, weekLine, weekReport, WEEK, type WeekInput } from "./weekreport";
import type { LoggedSet } from "./training";
import type { HrMinute } from "./band";
import type { Template, Workout } from "./types";
import { addDays, localDay } from "./time";

const NOW = new Date("2026-10-28T12:00:00").getTime(); // a Wednesday
const MIN = 60_000, DAY = 86_400_000;
const at = (day: string, h: number, m = 0) => new Date(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`).getTime();
const SPLIT: Template[] = [
  { id: "a", name: "Push + Quads", exercises: [{ name: "Squat", sets: 3, reps: 6, restSec: 150 }, { name: "Bench press", sets: 3, reps: 8, restSec: 120 }, { name: "Overhead press", sets: 3, reps: 8, restSec: 120 }] },
  { id: "b", name: "Pull + Hamstrings", exercises: [{ name: "Barbell row", sets: 3, reps: 8, restSec: 120 }, { name: "Leg curl", sets: 3, reps: 10, restSec: 90 }] },
];

/** 9 weeks of Mondays (Push + Quads) and Thursdays (Pull, no leg curls done); squat +2.5 kg a week, OHP flat at 60. */
function history(weeks = 9) {
  const sets: LoggedSet[] = [], workouts: Workout[] = [];
  const mon0 = localDay(weekFrom(NOW, weeks));
  for (let w = 1; w <= weeks; w++) {
    const mon = addDays(mon0, 7 * w), thu = addDays(mon, 3);
    if (at(mon, 18) < NOW) {
      const id = `p${w}`; workouts.push({ id, template: "Push + Quads", startedAt: at(mon, 18), endedAt: at(mon, 19) });
      for (let k = 0; k < 3; k++) {
        sets.push({ at: at(mon, 18, 5 + k), workoutId: id, exercise: "Squat", kg: 90 + 2.5 * w, reps: 6 });
        sets.push({ at: at(mon, 18, 20 + k), workoutId: id, exercise: "Bench press", kg: 80 + (w % 2 ? 0 : 2.5), reps: 8 });
        sets.push({ at: at(mon, 18, 40 + k), workoutId: id, exercise: "Overhead press", kg: 60, reps: 6 });
      }
    }
    if (at(thu, 18) < NOW) {
      const id = `q${w}`; workouts.push({ id, template: "Pull + Hamstrings", startedAt: at(thu, 18), endedAt: at(thu, 19) });
      for (let k = 0; k < 3; k++) sets.push({ at: at(thu, 18, 5 + k), workoutId: id, exercise: "Barbell row", kg: 70 + w, reps: 8 });
    }
  }
  return { sets, workouts };
}
const input = (over: Partial<WeekInput> = {}): WeekInput => ({ ...history(), templates: SPLIT, hr: [], rhr: {}, vo2: {}, maxHr: null, ...over });

describe("which week", () => {
  it("Monday 00:00 to Monday; back 1 is last week; a set at Sunday 23:30 is last week's, Monday 00:10 this week's", () => {
    expect(new Date(weekFrom(NOW)).toString()).toMatch(/^Mon Oct 26 2026 00:00/);
    expect(new Date(weekFrom(NOW, 1)).toString()).toMatch(/^Mon Oct 19 2026 00:00/);
    const edge = { ...input(), sets: [{ at: at("2026-10-25", 23, 30), workoutId: "x", exercise: "Leg curl", kg: 40, reps: 10 }, { at: at("2026-10-26", 0, 10), workoutId: "y", exercise: "Leg curl", kg: 40, reps: 10 }] };
    expect(weekReport(edge, NOW, 1).muscles.find((m) => m.muscle === "Hamstrings")!.sets).toBe(1);
    expect(weekReport(edge, NOW, 0).muscles.find((m) => m.muscle === "Hamstrings")!.sets).toBe(1);
  });
});

describe("last week, finished", () => {
  const r = weekReport(input(), NOW, 1);
  it("the lifts done most, 8 weeks of bests; the squat climbed and set a PB, the press didn't", () => {
    expect(r.complete).toBe(true);
    expect(r.lifts.map((l) => l.exercise).sort()).toEqual(["Barbell row", "Bench press", "Overhead press", "Squat"]);
    const sq = r.lifts.find((l) => l.exercise === "Squat")!, ohp = r.lifts.find((l) => l.exercise === "Overhead press")!;
    expect(sq.weeks).toHaveLength(WEEK.liftWeeks);
    // week 8 of 9 (last week): 90 + 20 = 110 kg × 6 → 110 × 1.2 = 132; the week before 107.5 × 1.2 = 129
    expect([sq.best, sq.prev, sq.pb]).toEqual([132, 129, true]);
    expect([ohp.best, ohp.prev, ohp.pb]).toEqual([72, 72, false]);
    expect(r.pbs).toBe(2); // the squat, and the row (70 + 8) climbing a kilo a week
    expect(r.title).toBe("A stronger week");
    expect(weekReport(input(), new Date("2026-10-25T20:00:00").getTime(), 0).title).toBe("Stronger this week"); // the same week, seen on its Sunday
  });
  it("sets per muscle, counted by hand: 3 squat → quads 3, glutes 1.5; bench + OHP → chest 3, shoulders 3 + 1.5; hamstrings in the split but 0", () => {
    const by = Object.fromEntries(r.muscles.map((m) => [m.muscle, m.sets]));
    expect(by).toMatchObject({ Quads: 3, Glutes: 1.5, Chest: 3, Shoulders: 4.5, Triceps: 3, Back: 3, Biceps: 1.5, Hamstrings: 0 });
    expect(r.muscles.find((m) => m.muscle === "Hamstrings")!.inPlan).toBe(true);
  });
  it("sessions against the split, kilos against the 4 weeks before", () => {
    expect(r.sessions.map((s) => s.name)).toEqual(["Push + Quads", "Pull + Hamstrings"]);
    expect(r.planned).toBe(2);
    expect(r.kg).toBe(3 * 110 * 6 + 3 * 82.5 * 8 + 3 * 60 * 6 + 3 * 78 * 8);
    expect(r.usualKg).not.toBeNull();
  });
  it("one thing for next week: how many are under 10, hamstrings least, and 2 more sets of the leg curl already in your split", () => {
    expect(r.next).toEqual({ text: "5 muscles in your split got under 10 sets — hamstrings least (0). Add 2 sets of Leg curl to Pull + Hamstrings?", add: { template: "Pull + Hamstrings", exercise: "Leg curl", sets: 5 } });
  });
  it("…and with two under, both named; nothing in the split for it → says so instead of adding", () => {
    const two = input(); two.templates = [{ id: "b", name: "Legs", exercises: [{ name: "Squat", sets: 3, reps: 6, restSec: 150 }, { name: "Romanian deadlift", sets: 3, reps: 8, restSec: 120 }] }];
    const n = weekReport(two, NOW, 1).next!;
    expect(n.text).toMatch(/^[A-Z][a-z]+ and [a-z]+ got under 10 sets\./);
    const full = input(); full.templates = [{ id: "c", name: "Upper", exercises: [{ name: "Bench press", sets: 6, reps: 8, restSec: 120 }] }];
    expect(weekReport(full, NOW, 1).next).toEqual({ text: "Chest got under 10 sets. Bench press is already at 6 sets on Upper — a second chest lift would do more (Edit day)." });
    // trained but not in the split any more (the split changed): nothing to add sets to
    const gone = input(); gone.templates = [{ id: "d", name: "Arms", exercises: [{ name: "Leg curl", sets: 3, reps: 10, restSec: 90 }] }];
    expect(weekReport(gone, NOW, 1).next!.text).toMatch(/^Hamstrings got under 10 sets\. Add 2 sets of Leg curl to Arms\?$/);
  });
});

describe("cardio and fitness", () => {
  it("minutes, and zones from the band's minutes with a max heart rate of 190: 20 min at 120 bpm (Z2), 10 at 160 (Z4)", () => {
    const day = "2026-10-21", s = at(day, 7), hr: HrMinute[] = [];
    for (let m = 0; m < 30; m++) hr.push([s + m * MIN, m < 20 ? 120 : 160, 0, 0]);
    const cardio: Workout = { id: "c1", template: "Stairmaster", kind: "cardio", startedAt: s, endedAt: s + 30 * MIN, cardio: { what: "Stairmaster" } };
    const base = input();
    const r = weekReport({ ...base, workouts: [...base.workouts, cardio], hr, maxHr: 190 }, NOW, 1);
    expect(r.cardio.min).toBe(30);
    expect(r.cardio.zones).toEqual([0, 20, 0, 10, 0]);
    expect(r.cardio.before).toBe(0);
    // no max heart rate: minutes only, zones left out rather than guessed
    expect(weekReport({ ...base, workouts: [...base.workouts, cardio], hr }, NOW, 1).cardio.zones).toBeNull();
  });
  it("VO2 max and resting heart rate a week, 12 weeks, the week's median; weeks without data are gaps", () => {
    const rhr: Record<string, number> = {}, vo2: Record<string, { v: number }> = {};
    for (let k = 0; k < 40; k++) { const d = addDays("2026-10-25", -k); rhr[d] = k < 7 ? 53 : 55; if (k < 21) vo2[d] = { v: k < 7 ? 45.6 : 45.0 }; }
    const r = weekReport(input({ rhr, vo2 }), NOW, 1);
    expect(r.rhr).toHaveLength(12);
    expect(r.rhr.slice(-2)).toEqual([55, 53]);
    expect(r.rhr[0]).toBeNull();
    expect(r.vo2.slice(-3)).toEqual([45, 45, 45.6]);
  });
});

describe("controls", () => {
  it("this week so far: not finished, no suggestion yet", () => {
    const r = weekReport(input(), NOW, 0);
    expect(r.complete).toBe(false);
    expect(r.next).toBeNull();
  });
  it("an empty account: nothing to say, no lifts, no muscles outside the split, no suggestion", () => {
    const r = weekReport({ sets: [], workouts: [], templates: [], hr: [], rhr: {}, vo2: undefined, maxHr: null }, NOW, 1);
    expect([r.title, r.lifts.length, r.muscles.length, r.next, r.planned, r.usualKg]).toEqual(["No training that week", 0, 0, null, null, null]);
  });
  it("a week with nothing new: no PB, a steady week", () => {
    const flat = input(); flat.sets = flat.sets.map((s) => ({ ...s, kg: 60 }));
    expect(weekReport(flat, NOW, 1).title).toBe("A steady week");
  });
  it("the headline in a line", () => {
    const rhr: Record<string, number> = {};
    for (let k = 0; k < 14; k++) rhr[addDays("2026-10-25", -k)] = k < 7 ? 53 : 55;
    expect(weekLine(weekReport(input({ rhr }), NOW, 1))).toBe("2 of 2 sessions · Squat +3 kg, barbell row +1.3 kg · 2 PBs · resting HR 53 (−2)");
    expect(DAY).toBe(86_400_000);
  });
  it("…and for the AI, with the suggestion; a week without training says nothing", () => {
    expect(weekAiLines(input(), NOW)).toEqual(["Last week (2026-10-19 to 2026-10-25, as the app's weekly report shows it): a stronger week — 2 of 2 sessions · Squat +3 kg, barbell row +1.3 kg · 2 PBs. Its one suggestion for this week: 5 muscles in your split got under 10 sets — hamstrings least (0). Add 2 sets of Leg curl to Pull + Hamstrings?"]);
    expect(weekAiLines({ ...input(), sets: [], workouts: [] }, NOW)).toEqual([]);
  });
});
