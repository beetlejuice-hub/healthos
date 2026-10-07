/**
 * Premade workouts (owner, 2 Oct: "put some premade common ones"). Well-known, simple programs in the
 * app's own exercise names, so history, suggestions and the muscle map all understand them. Start a
 * day once, or make a whole program your split.
 */

import type { Template } from "./types";

/** An exercise in a program; `or` names a swap the program allows ("Squat or hack squat"). */
type Ex = Template["exercises"][number] & { or?: string };
const ex = (name: string, sets: number, reps: number, restSec: number, or?: string): Ex => ({ name, sets, reps, restSec, ...(or ? { or } : {}) });

/** A lifting day; `after` is the cardio that follows it ("20 min stairmaster"). */
export type ProgramDay = { id: string; name: string; exercises: Ex[]; after?: string };

/**
 * `other`: days without lifting (a cardio day, rest days) — shown with the program, not part of the split.
 * `rules`: how to run it (sets, progression, deloads, what to track).
 */
export type Program = { id: string; name: string; who: string; perWeek: string; days: ProgramDay[]; other?: { name: string; what: string }[]; rules?: string[] };

const day = (pid: string, name: string, exercises: Ex[], after?: string): ProgramDay => ({ id: `${pid}:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name, exercises, ...(after ? { after } : {}) });

export const PROGRAMS: Program[] = [
  // Owner, 6 Oct: his plan, as written. Reps are the top of each range — the number that says "add weight".
  { id: "ppm", name: "Push · Pull · Mixed + cardio", who: "Lose fat, keep the muscle · 3 lifting days + 1 cardio day", perWeek: "4× a week, in order", days: [
    day("ppm", "Push + Quads", [ex("Squat", 3, 8, 150, "Hack squat"), ex("DB bench press", 3, 10, 120), ex("DB shoulder press", 3, 10, 90), ex("Leg extension", 3, 15, 60), ex("Lateral raise", 3, 15, 60), ex("Rope pushdown", 3, 12, 60)], "20 min stairmaster"),
    day("ppm", "Pull + Hamstrings", [ex("Romanian deadlift", 3, 10, 150), ex("Lat pulldown", 3, 10, 90), ex("Seated cable row", 3, 12, 90), ex("Leg curl", 3, 12, 60), ex("Face pull", 3, 15, 60), ex("Incline DB curl", 3, 12, 60)], "20 min incline walk"),
    day("ppm", "Mixed", [ex("Incline DB press", 3, 10, 120), ex("Chest-supported row", 3, 12, 90), ex("Bulgarian split squat", 3, 10, 90), ex("Pec deck", 3, 15, 60), ex("Lateral raise", 3, 15, 60), ex("Hammer curl", 3, 12, 60), ex("Overhead tricep extension", 3, 12, 60)], "20 min stairmaster"),
  ], other: [
    { name: "Cardio", what: "40–45 min stairmaster plus incline walk — or intervals, at most once a week" },
    { name: "Rest days", what: "Walking, abs" },
  ], rules: [
    "3 sets per exercise, each ending 1–2 reps short of failure.",
    "The reps shown are the top of the range: when every set reaches them, add weight next time.",
    "A lighter week every 6–8 weeks.",
    "Weigh in most mornings and go by the weekly average; measure your waist weekly; photos every 2 weeks.",
    "Every 2 weeks: losing under 0.3 kg a week → 150 kcal less. Over 0.7 kg a week, or lifts dropping → 150 kcal more.",
  ] },
  { id: "fullbody", name: "Full body A/B", who: "Beginner · simplest to stick to", perWeek: "3× a week, alternating", days: [
    day("fullbody", "Full body A", [ex("Squat", 3, 5, 180), ex("Bench press", 3, 5, 150), ex("Barbell row", 3, 8, 120), ex("Plank", 3, 1, 60)]),
    day("fullbody", "Full body B", [ex("Deadlift", 2, 5, 180), ex("Overhead press", 3, 6, 150), ex("Lat pulldown", 3, 10, 90), ex("Lunges", 3, 10, 90)]),
  ] },
  { id: "5x5", name: "5×5 strength", who: "Beginner–intermediate · strength first", perWeek: "3× a week, alternating", days: [
    day("5x5", "5×5 A", [ex("Squat", 5, 5, 180), ex("Bench press", 5, 5, 180), ex("Barbell row", 5, 5, 150)]),
    day("5x5", "5×5 B", [ex("Squat", 5, 5, 180), ex("Overhead press", 5, 5, 180), ex("Deadlift", 1, 5, 180)]),
  ] },
  { id: "ppl", name: "Push / Pull / Legs", who: "Intermediate · more volume per muscle", perWeek: "3–6× a week, in order", days: [
    day("ppl", "Push", [ex("Bench press", 4, 6, 150), ex("Overhead press", 3, 8, 120), ex("Incline DB press", 3, 10, 90), ex("Lateral raise", 3, 15, 60), ex("Tricep pushdown", 3, 12, 60)]),
    day("ppl", "Pull", [ex("Pull-ups", 4, 8, 120), ex("Barbell row", 3, 8, 120), ex("Face pull", 3, 15, 60), ex("Bicep curl", 3, 12, 60), ex("Hammer curl", 2, 12, 60)]),
    day("ppl", "Legs", [ex("Squat", 4, 6, 180), ex("Romanian deadlift", 3, 8, 150), ex("Leg press", 3, 12, 120), ex("Leg curl", 3, 12, 90), ex("Calf raise", 4, 12, 60)]),
  ] },
  { id: "ul", name: "Upper / Lower", who: "Intermediate · balanced, 4 days", perWeek: "4× a week", days: [
    day("ul", "Upper 1", [ex("Bench press", 4, 6, 150), ex("Barbell row", 4, 8, 120), ex("DB shoulder press", 3, 10, 90), ex("Lat pulldown", 3, 10, 90), ex("Bicep curl", 2, 12, 60)]),
    day("ul", "Lower 1", [ex("Squat", 4, 6, 180), ex("Romanian deadlift", 3, 8, 150), ex("Leg extension", 3, 12, 90), ex("Calf raise", 4, 12, 60)]),
    day("ul", "Upper 2", [ex("Overhead press", 4, 6, 150), ex("Chin-ups", 4, 8, 120), ex("Incline DB press", 3, 10, 90), ex("Seated cable row", 3, 10, 90), ex("Skull crusher", 2, 12, 60)]),
    day("ul", "Lower 2", [ex("Deadlift", 3, 5, 180), ex("Bulgarian split squat", 3, 10, 120), ex("Seated leg curl", 3, 12, 90), ex("Hanging leg raise", 3, 12, 60)]),
  ] },
  { id: "db", name: "Dumbbells only", who: "Home or a crowded gym", perWeek: "3× a week", days: [
    day("db", "Dumbbell full body", [ex("DB bench press", 3, 10, 90), ex("DB row", 3, 10, 90), ex("Bulgarian split squat", 3, 10, 90), ex("DB shoulder press", 3, 10, 90), ex("Hammer curl", 2, 12, 60)]),
  ] },
  { id: "bw", name: "Bodyweight", who: "No equipment · anywhere", perWeek: "3× a week", days: [
    day("bw", "Bodyweight circuit", [ex("Push-ups", 4, 15, 60), ex("Lunges", 3, 12, 60), ex("Pull-ups", 3, 6, 90), ex("Plank", 3, 1, 45), ex("Hanging leg raise", 3, 10, 60)]),
  ] },
  { id: "glutes", name: "Glutes & legs", who: "Lower-body focus", perWeek: "2× a week, plus upper days", days: [
    day("glutes", "Glutes & legs", [ex("Hip thrust", 4, 10, 120), ex("Romanian deadlift", 3, 10, 120), ex("Bulgarian split squat", 3, 10, 90), ex("Leg curl", 3, 12, 60), ex("Seated calf raise", 3, 15, 60)]),
  ] },
];

/** A program day as a split day: a fresh copy with its cardio, without the program's swap notes. */
export function asTemplate(d: ProgramDay): Template {
  return { id: d.id, name: d.name, exercises: d.exercises.map(({ name, sets, reps, restSec }) => ({ name, sets, reps, restSec })), ...(d.after ? { cardio: d.after } : {}) };
}

/** A fresh copy of a program's days, to become your split (past workouts keep their own names). */
export function asSplit(p: Program): Template[] {
  return p.days.map(asTemplate);
}

/**
 * The plan's rest day, for Today's evening card (owner, 7 Oct: "go" to "Rest day · walk, abs"). Only when your
 * split is still a program's days (by name) and that program says what rest days are; only from 19:00, when a
 * day without a workout is a rest day rather than one you haven't trained in yet. The program's own words.
 */
export function restDay(templates: { name: string }[], workouts: { startedAt: number }[], now: number, eveningFrom = 19): string | null {
  const d = new Date(now);
  if (d.getHours() < eveningFrom && d.getHours() >= 5) return null;
  // After midnight it is still the evening of the day that's ending.
  const start = new Date(now); if (start.getHours() < 5) start.setDate(start.getDate() - 1); start.setHours(5, 0, 0, 0);
  if (workouts.some((w) => w.startedAt >= start.getTime() && w.startedAt <= now)) return null;
  const names = templates.map((t) => t.name).join("|");
  const p = PROGRAMS.find((x) => x.days.map((day) => day.name).join("|") === names);
  return p?.other?.find((o) => /^rest/i.test(o.name))?.what ?? null;
}
