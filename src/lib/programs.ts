/**
 * Premade workouts (owner, 2 Oct: "put some premade common ones"). Well-known, simple programs in the
 * app's own exercise names, so history, suggestions and the muscle map all understand them. Start a
 * day once, or make a whole program your split.
 */

import type { Template } from "./types";

type Ex = Template["exercises"][number];
const ex = (name: string, sets: number, reps: number, restSec: number): Ex => ({ name, sets, reps, restSec });

export type Program = { id: string; name: string; who: string; perWeek: string; days: Template[] };

const day = (pid: string, name: string, exercises: Ex[]): Template => ({ id: `${pid}:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name, exercises });

export const PROGRAMS: Program[] = [
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

/** A fresh copy of a program's days, to become your split (past workouts keep their own names). */
export function asSplit(p: Program): Template[] {
  return p.days.map((d) => ({ ...d, exercises: d.exercises.map((e) => ({ ...e })) }));
}
