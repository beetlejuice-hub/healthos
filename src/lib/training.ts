/**
 * Strength numbers from logged sets.
 *
 * - **e1RM** (estimated one-rep max) by Epley: `kg × (1 + reps / 30)`. Reliable-ish up to ~10
 *   reps; past 12 it overestimates, so those sets are left out of "best".
 * - **Next weight**: double progression. If every set of the last session hit the target reps,
 *   add one increment; otherwise repeat the weight. Simple, explainable, and what most people
 *   already do in their head.
 */

export type LoggedSet = { at: number; workoutId: string; exercise: string; kg: number; reps: number; warmup?: boolean };
/**
 * Working sets only. A warm-up is logged and shown, but never counts toward a set count, strength, a best, kg lifted or
 * sets per muscle (PLAN 80; owner, 13 Oct: "warm up plus 2-3 sets").
 */
export const working = <T extends { warmup?: boolean }>(sets: T[]): T[] => sets.filter((s) => !s.warmup);

export const e1rm = (kg: number, reps: number) => (reps <= 1 ? kg : kg * (1 + reps / 30));

/** Best e1RM per workout for one exercise, oldest first. Sets over 12 reps don't count. */
export function e1rmHistory(sets: LoggedSet[], exercise: string): { at: number; workoutId: string; e1rm: number; kg: number; reps: number }[] {
  const byWorkout = new Map<string, { at: number; workoutId: string; e1rm: number; kg: number; reps: number }>();
  for (const s of working(sets)) {
    if (s.exercise !== exercise || s.reps > 12 || s.reps < 1 || s.kg <= 0) continue;
    const v = e1rm(s.kg, s.reps);
    const cur = byWorkout.get(s.workoutId);
    if (!cur || v > cur.e1rm) byWorkout.set(s.workoutId, { at: cur ? Math.min(cur.at, s.at) : s.at, workoutId: s.workoutId, e1rm: v, kg: s.kg, reps: s.reps });
  }
  return [...byWorkout.values()].sort((a, b) => a.at - b.at);
}

export type Suggestion = { kg: number; reps: number; reason: string };

/** What to lift next time, from the last session's sets of this exercise. */
export function suggestNext(last: { kg: number; reps: number }[], targetReps: number, incrementKg = 2.5): Suggestion | null {
  if (!last.length) return null;
  const top = Math.max(...last.map((s) => s.kg));
  const work = last.filter((s) => s.kg === top);
  const reps = work.map((s) => s.reps).join("/");
  if (work.every((s) => s.reps >= targetReps)) {
    return { kg: top + incrementKg, reps: targetReps, reason: `all sets hit ${targetReps} last time (${reps}), so +${incrementKg} kg` };
  }
  return { kg: top, reps: targetReps, reason: `last time ${reps}, so repeat ${top} kg until every set hits ${targetReps}` };
}

/** Which muscles an exercise trains: 1 = primary, 0.5 = secondary. */
export const MUSCLES: Record<string, Record<string, number>> = {
  "Bench press": { Chest: 1, Triceps: 0.5, Shoulders: 0.5 },
  "Incline DB press": { Chest: 1, Shoulders: 0.5, Triceps: 0.5 },
  "Overhead press": { Shoulders: 1, Triceps: 0.5 },
  "Barbell row": { Back: 1, Biceps: 0.5 },
  "Lat pulldown": { Back: 1, Biceps: 0.5 },
  "Pull-ups": { Back: 1, Biceps: 0.5 },
  "Dips": { Chest: 1, Triceps: 1 },
  "Squat": { Quads: 1, Glutes: 0.5 },
  "Front squat": { Quads: 1, Glutes: 0.5 },
  "Leg press": { Quads: 1, Glutes: 0.5 },
  "Romanian deadlift": { Hamstrings: 1, Glutes: 0.5 },
  "Deadlift": { Glutes: 1, Hamstrings: 0.5, Back: 0.5 },
  "Leg curl": { Hamstrings: 1 },
  "Calf raise": { Calves: 1 },
  "Bicep curl": { Biceps: 1 },
  "Tricep pushdown": { Triceps: 1 },
  "Rope pushdown": { Triceps: 1 },
  "Lateral raise": { Shoulders: 1 },
  "DB bench press": { Chest: 1, Triceps: 0.5, Shoulders: 0.5 },
  "Incline bench press": { Chest: 1, Shoulders: 0.5, Triceps: 0.5 },
  "Chest fly": { Chest: 1 },
  "Pec deck": { Chest: 1 },
  "Push-ups": { Chest: 1, Triceps: 0.5 },
  "DB shoulder press": { Shoulders: 1, Triceps: 0.5 },
  "Face pull": { Shoulders: 1, Back: 0.5 },
  "Rear delt fly": { Shoulders: 1 },
  "Seated cable row": { Back: 1, Biceps: 0.5 },
  "DB row": { Back: 1, Biceps: 0.5 },
  "Chin-ups": { Back: 1, Biceps: 1 },
  "T-bar row": { Back: 1, Biceps: 0.5 },
  "Chest-supported row": { Back: 1, Biceps: 0.5 },
  "Hammer curl": { Biceps: 1, Forearms: 0.5 },
  "Preacher curl": { Biceps: 1 },
  "Incline DB curl": { Biceps: 1 },
  "Skull crusher": { Triceps: 1 },
  "Overhead tricep extension": { Triceps: 1 },
  "Hack squat": { Quads: 1, Glutes: 0.5 },
  "Bulgarian split squat": { Quads: 1, Glutes: 1 },
  "Lunges": { Quads: 1, Glutes: 1 },
  "Leg extension": { Quads: 1 },
  "Hip thrust": { Glutes: 1, Hamstrings: 0.5 },
  "Seated leg curl": { Hamstrings: 1 },
  "Seated calf raise": { Calves: 1 },
  "Plank": { Core: 1 },
  "Hanging leg raise": { Core: 1 },
  "Cable crunch": { Core: 1 },
  // 14 Oct (owner: "Add more exercise options so i can change if i dont wanna do an exericse or machine is used"):
  // the machine and cable versions, so a taken machine has a neighbour, and the forearms ("csuklya and forearm").
  "Chest press machine": { Chest: 1, Triceps: 0.5, Shoulders: 0.5 },
  "Incline chest press machine": { Chest: 1, Shoulders: 0.5, Triceps: 0.5 },
  "Smith machine bench press": { Chest: 1, Triceps: 0.5, Shoulders: 0.5 },
  "Decline bench press": { Chest: 1, Triceps: 0.5 },
  "Cable fly": { Chest: 1 },
  "Shoulder press machine": { Shoulders: 1, Triceps: 0.5 },
  "Arnold press": { Shoulders: 1, Triceps: 0.5 },
  "Cable lateral raise": { Shoulders: 1 },
  "Machine lateral raise": { Shoulders: 1 },
  "Front raise": { Shoulders: 1 },
  "Reverse pec deck": { Shoulders: 1, Back: 0.5 },
  "Upright row": { Shoulders: 1, Back: 0.5 },
  "Machine row": { Back: 1, Biceps: 0.5 },
  "Close-grip lat pulldown": { Back: 1, Biceps: 0.5 },
  "Straight-arm pulldown": { Back: 1 },
  "Assisted pull-up machine": { Back: 1, Biceps: 0.5 },
  "Pendlay row": { Back: 1, Biceps: 0.5 },
  "Shrugs": { Back: 1, Forearms: 0.5 },
  "Back extension": { Back: 1, Glutes: 0.5, Hamstrings: 0.5 },
  "Rack pull": { Back: 1, Glutes: 0.5, Forearms: 0.5 },
  "Cable curl": { Biceps: 1 },
  "EZ-bar curl": { Biceps: 1 },
  "Concentration curl": { Biceps: 1 },
  "Machine curl": { Biceps: 1 },
  "Close-grip bench press": { Triceps: 1, Chest: 0.5 },
  "Tricep dip machine": { Triceps: 1, Chest: 0.5 },
  "Cable overhead extension": { Triceps: 1 },
  "Tricep kickback": { Triceps: 1 },
  "Wrist curl": { Forearms: 1 },
  "Reverse wrist curl": { Forearms: 1 },
  "Reverse curl": { Forearms: 1, Biceps: 0.5 },
  "Wrist roller": { Forearms: 1 },
  "Farmer's carry": { Forearms: 1, Back: 0.5, Core: 0.5 },
  "Dead hang": { Forearms: 1, Back: 0.5 },
  "Plate pinch": { Forearms: 1 },
  "Single-leg leg press": { Quads: 1, Glutes: 0.5 },
  "Smith machine squat": { Quads: 1, Glutes: 0.5 },
  "Goblet squat": { Quads: 1, Glutes: 0.5 },
  "Pendulum squat": { Quads: 1, Glutes: 0.5 },
  "Belt squat": { Quads: 1, Glutes: 0.5 },
  "Lying leg curl": { Hamstrings: 1 },
  "Nordic curl": { Hamstrings: 1 },
  "Good morning": { Hamstrings: 1, Back: 0.5 },
  "Glute bridge": { Glutes: 1, Hamstrings: 0.5 },
  "Hip abduction machine": { Glutes: 1 },
  "Leg press calf raise": { Calves: 1 },
  "Ab crunch machine": { Core: 1 },
  "Ab wheel": { Core: 1 },
  "Russian twist": { Core: 1 },
  "Side plank": { Core: 1 },
  "Pallof press": { Core: 1 },
};

/** Every exercise the app knows (for suggestions while typing); your own names work too. */
export const EXERCISES = Object.keys(MUSCLES).sort();

/** An exercise's main muscle: the one it works most (the first, on a tie — Dips → Chest). */
export const mainMuscle = (exercise: string): string | null => {
  const m = MUSCLES[exercise]; if (!m) return null;
  return Object.entries(m).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
};

/**
 * A split day at a glance: exercises, sets, about how long the lifting takes (each set ~40 s plus its
 * rest, rounded to 5 min), the cardio's minutes when it says them, and the main muscles in order.
 */
export function dayStats(t: { exercises: { name: string; sets: number; restSec: number }[]; cardio?: string }) {
  const sets = t.exercises.reduce((a, e) => a + e.sets, 0);
  const sec = t.exercises.reduce((a, e) => a + e.sets * (40 + e.restSec), 0);
  const cardioMin = Number(t.cardio?.match(/(\d+)\s*min/)?.[1] ?? 0) || null;
  const muscles = [...new Set(t.exercises.map((e) => mainMuscle(e.name)).filter((m): m is string => !!m))];
  return { exercises: t.exercises.length, sets, liftMin: Math.max(5, Math.round(sec / 300) * 5), cardioMin, muscles };
}

/**
 * Same muscle, different exercise (owner, 6 Oct: "choose like same muscle, diff exercise"): other
 * exercises with the same main muscle, in the list's order (compound lifts first), leaving out `skip`
 * (today's plan). For a machine that's taken, or a change.
 */
export function sameMuscle(exercise: string, skip: string[] = [], max = 6): string[] {
  const main = mainMuscle(exercise); if (!main) return [];
  return Object.keys(MUSCLES).filter((n) => n !== exercise && !skip.includes(n) && mainMuscle(n) === main).slice(0, max);
}

/** Hard sets per muscle in the given sets. Unknown exercises are counted under their own name. */
export function setsPerMuscle(sets: { exercise: string; warmup?: boolean }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of working(sets)) {
    const map = MUSCLES[s.exercise] ?? { [s.exercise]: 1 };
    for (const [m, f] of Object.entries(map)) out[m] = (out[m] ?? 0) + f;
  }
  return out;
}

/**
 * Dumbbell exercises are logged per dumbbell — the number printed on it (PLAN 76; owner, 13 Oct: "not sure if for exp on db
 * press its one hand kg or both hand kg in total"). Their kg lifted counts both hands.
 */
export const isDumbbell = (exercise: string) => /\b(db|dumbbells?)\b/i.test(exercise);
export const volume = (sets: { kg: number; reps: number; exercise?: string; warmup?: boolean }[]) => working(sets).reduce((a, s) => a + s.kg * s.reps * (s.exercise && isDumbbell(s.exercise) ? 2 : 1), 0);

/**
 * Workouts that end themselves (owner: "sessions could easily get forgotten to end"). An open
 * workout with no set for an hour ends at its last set (+2 min), so its duration stays true; one
 * that never got a set is dropped after 30 minutes. `force` closes every open one now (starting a
 * new workout closes the old one the same way).
 */
export const AUTO_END = { afterLastSetMin: 60, emptyAfterMin: 30, coolDownMin: 2 };
export type Tidy = { end: { id: string; at: number }[]; drop: string[] };

export function tidyWorkouts(workouts: { id: string; startedAt: number; endedAt: number | null }[], sets: { workoutId: string; at: number }[], now: number, force = false): Tidy {
  const out: Tidy = { end: [], drop: [] };
  const open = workouts.filter((w) => w.endedAt === null).sort((a, b) => a.startedAt - b.startedAt);
  open.forEach((w, i) => {
    const newest = i === open.length - 1;
    const last = sets.filter((s) => s.workoutId === w.id).reduce((m, s) => Math.max(m, s.at), -Infinity);
    const closeAll = force || !newest; // only one workout can be open
    if (Number.isFinite(last)) {
      if (closeAll || now - last > AUTO_END.afterLastSetMin * 60_000) out.end.push({ id: w.id, at: Math.min(now, last + AUTO_END.coolDownMin * 60_000) });
    } else if (closeAll || now - w.startedAt > AUTO_END.emptyAfterMin * 60_000) out.drop.push(w.id);
  });
  return out;
}

type Ex = { name: string; sets: number; reps: number; restSec: number };

/** The day that's due: the one after the last day you finished, in your split's order. */
export function nextTemplate<T extends { name: string }>(templates: T[], workouts: { template: string; startedAt: number; endedAt: number | null }[]): T | undefined {
  const done = workouts.filter((w) => w.endedAt !== null).sort((a, b) => a.startedAt - b.startedAt);
  for (let k = done.length - 1; k >= 0; k--) {
    const i = templates.findIndex((t) => t.name === done[k].template);
    if (i >= 0) return templates[(i + 1) % templates.length];
  }
  return templates[0];
}

/** A session's exercises: its own copy when it has one, else the template's (older sessions). */
export const sessionPlan = (w: { template: string; plan?: Ex[] }, templates: { name: string; exercises: Ex[] }[]): Ex[] =>
  w.plan ?? templates.find((t) => t.name === w.template)?.exercises ?? [];

/** What's wrong with a split day before saving it, in plain words; empty when it's fine. */
export function templateProblems(t: { name: string; exercises: Ex[] }, others: { name: string }[]): string[] {
  const out: string[] = [];
  if (!t.name.trim()) out.push("Give the day a name.");
  else if (others.some((o) => o.name.trim().toLowerCase() === t.name.trim().toLowerCase())) out.push(`There's already a day called ${t.name.trim()}.`);
  if (!t.exercises.length) out.push("Add at least one exercise.");
  t.exercises.forEach((e, i) => {
    if (!e.name.trim()) out.push(`Exercise ${i + 1} needs a name.`);
    if (!(e.sets >= 1 && e.sets <= 10)) out.push(`${e.name || `Exercise ${i + 1}`}: sets must be 1–10.`);
    if (!(e.reps >= 1 && e.reps <= 50)) out.push(`${e.name || `Exercise ${i + 1}`}: reps must be 1–50.`);
  });
  return out;
}

/** The last `n` sessions of one exercise, newest first: the sets, and the best estimated 1RM. */
export function exerciseHistory(sets: LoggedSet[], exercise: string, n = 5): { workoutId: string; at: number; sets: { kg: number; reps: number }[]; best: number }[] {
  const by = new Map<string, LoggedSet[]>();
  for (const s of working(sets)) if (s.exercise === exercise) by.set(s.workoutId, [...(by.get(s.workoutId) ?? []), s]);
  return [...by.entries()]
    .map(([workoutId, ss]) => ({ workoutId, at: Math.min(...ss.map((s) => s.at)), sets: ss.sort((a, b) => a.at - b.at).map((s) => ({ kg: s.kg, reps: s.reps })), best: Math.max(0, ...ss.filter((s) => s.reps <= 12 && s.kg > 0).map((s) => e1rm(s.kg, s.reps))) }))
    .sort((a, b) => b.at - a.at).slice(0, n);
}

/* ------------------------------------------------------------------ during and after a session */

/** Seconds of rest left. Rest ends at a saved time, so it keeps running while the app is closed. */
export const restLeft = (restUntil: number | null | undefined, now: number) => (restUntil ? Math.max(0, Math.ceil((restUntil - now) / 1000)) : 0);

/** Sets that count for a best: some weight, 12 reps or fewer (beyond that the 1RM estimate is poor). */
const counts = (s: { kg: number; reps: number }) => s.kg > 0 && s.reps > 0 && s.reps <= 12;

/**
 * A new best: this set's estimated 1RM beats every earlier set of the same exercise. Never on the
 * first time you do an exercise (nothing to beat), and never twice for the same number.
 */
export function isBest(sets: LoggedSet[], set: LoggedSet): boolean {
  if (!counts(set) || set.warmup) return false;
  const before = working(sets).filter((s) => s.exercise === set.exercise && s.at < set.at && counts(s));
  return before.length > 0 && e1rm(set.kg, set.reps) > Math.max(...before.map((s) => e1rm(s.kg, s.reps))) + 1e-9;
}

export type Summary = { minutes: number; sets: number; volume: number; vsLast: number | null; bests: { exercise: string; kg: number; reps: number; e1rm: number }[] };

/** The finish screen: how long, how much, against the last session of the same day, and new bests. */
export function sessionSummary(w: { id: string; template: string; startedAt: number }, sets: LoggedSet[], workouts: { id: string; template: string; startedAt: number; endedAt: number | null }[], now: number): Summary {
  const mine = working(sets).filter((s) => s.workoutId === w.id);
  const prev = [...workouts].filter((x) => x.template === w.template && x.id !== w.id && x.endedAt && x.startedAt < w.startedAt).sort((a, b) => a.startedAt - b.startedAt).pop();
  const prevVol = prev ? volume(sets.filter((s) => s.workoutId === prev.id)) : 0;
  const vol = volume(mine);
  const best = new Map<string, LoggedSet>();
  for (const s of mine) if (isBest(sets, s) && (!best.has(s.exercise) || e1rm(s.kg, s.reps) > e1rm(best.get(s.exercise)!.kg, best.get(s.exercise)!.reps))) best.set(s.exercise, s);
  return {
    minutes: Math.max(0, Math.round((now - w.startedAt) / 60_000)), sets: mine.length, volume: vol,
    vsLast: prevVol > 0 ? vol / prevVol : null,
    bests: [...best.values()].map((s) => ({ exercise: s.exercise, kg: s.kg, reps: s.reps, e1rm: Math.round(e1rm(s.kg, s.reps) * 10) / 10 })),
  };
}

/* ------------------------------------------------------------------ the muscle map */

export const MUSCLE_GROUPS = ["Chest", "Shoulders", "Biceps", "Triceps", "Forearms", "Back", "Core", "Quads", "Hamstrings", "Glutes", "Calves"] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
/**
 * Hard sets per muscle per week where most of the growth is (Schoenfeld et al. 2017 dose–response:
 * more weekly sets → more growth, 10+ clearly better than under 5). The map is fully coloured at `full`.
 */
export const WEEKLY_SETS = { low: 5, good: 10, full: 12, high: 20 };

/** Hard sets per muscle group, per week, over the last `weeks` weeks before `now` (secondary muscles count half). */
export function muscleWeek(sets: { at: number; exercise: string }[], now: number, weeks = 1): Record<MuscleGroup, number> {
  const recent = working(sets as { at: number; exercise: string; warmup?: boolean }[]).filter((s) => s.at <= now && s.at > now - weeks * 7 * 86_400_000);
  const per = setsPerMuscle(recent);
  return Object.fromEntries(MUSCLE_GROUPS.map((m) => [m, Math.round(((per[m] ?? 0) / weeks) * 10) / 10])) as Record<MuscleGroup, number>;
}

/**
 * The figure's muscles (PLAN 94, phase 2; owner, 14 Oct: "a bit more complex muscle character"): the shoulders as front,
 * side and rear delts, the back as lats, upper back and lower back, the core as abs and obliques — so the figure can say
 * "side delts 3 sets" while pressing covers the front ones. Counting, swaps and the Training page keep MUSCLE_GROUPS.
 */
export const FINE = ["Chest", "Front delts", "Side delts", "Rear delts", "Biceps", "Triceps", "Forearms", "Upper back", "Lats", "Lower back", "Abs", "Obliques", "Quads", "Hamstrings", "Glutes", "Calves"] as const;
export type Fine = (typeof FINE)[number];
const SIDE_DELTS = new Set(["Lateral raise", "Cable lateral raise", "Machine lateral raise", "Upright row"]);
const REAR_DELTS = new Set(["Face pull", "Rear delt fly", "Reverse pec deck"]);
const OVERHEAD = new Set(["Overhead press", "DB shoulder press", "Shoulder press machine", "Arnold press"]);
const ROWS = new Set(["Barbell row", "DB row", "Seated cable row", "T-bar row", "Chest-supported row", "Machine row", "Pendlay row"]);
const UPPER_BACK = new Set(["Shrugs", "Rack pull", "Upright row", "Face pull", "Reverse pec deck", "Farmer's carry"]);
const LOWER_BACK = new Set(["Back extension", "Deadlift", "Good morning"]);
const OBLIQUES = new Set(["Russian twist", "Side plank", "Pallof press", "Farmer's carry"]);

/** An exercise's figure muscles, from its groups: which delts, which part of the back, abs or obliques. */
export function fineOf(exercise: string): Partial<Record<Fine, number>> {
  const out: Partial<Record<Fine, number>> = {};
  const add = (m: Fine, f: number) => { out[m] = Math.max(out[m] ?? 0, f); };
  for (const [g, f] of Object.entries(MUSCLES[exercise] ?? {})) {
    if (g === "Shoulders") {
      if (SIDE_DELTS.has(exercise)) add("Side delts", f);
      else if (REAR_DELTS.has(exercise)) add("Rear delts", f);
      else { add("Front delts", f); if (OVERHEAD.has(exercise)) add("Side delts", 0.5); }
    } else if (g === "Back") {
      if (ROWS.has(exercise)) { add("Upper back", f); add("Lats", f / 2); }
      else if (UPPER_BACK.has(exercise)) add("Upper back", f);
      else if (LOWER_BACK.has(exercise)) add("Lower back", f);
      else add("Lats", f);
    } else if (g === "Core") add(OBLIQUES.has(exercise) ? "Obliques" : "Abs", f);
    else add(g as Fine, f);
  }
  return out;
}

/** Hard sets per figure muscle, per week, over the last `weeks` weeks before `now` (secondary muscles count half). */
export function fineWeek(sets: { at: number; exercise: string }[], now: number, weeks = 1): Record<Fine, number> {
  const per: Partial<Record<Fine, number>> = {};
  for (const s of working(sets as { at: number; exercise: string; warmup?: boolean }[])) {
    if (s.at > now || s.at <= now - weeks * 7 * 86_400_000) continue;
    for (const [m, f] of Object.entries(fineOf(s.exercise)) as [Fine, number][]) per[m] = (per[m] ?? 0) + f;
  }
  return Object.fromEntries(FINE.map((m) => [m, Math.round(((per[m] ?? 0) / weeks) * 10) / 10])) as Record<Fine, number>;
}

/**
 * Does this exercise usually start with a warm-up? (PLAN 80; owner, 13 Oct: "1 warmup 3 w normal weight but sometimes just
 * 3"). Yes when at least half of its last 3 sessions before this workout had one; never done before: no — the first set
 * offers "Warm-up first" instead, and the habit is learned from there.
 */
export function warmsUp(sets: LoggedSet[], exercise: string, notWorkout: string): boolean {
  const by = new Map<string, { at: number; warm: boolean }>();
  for (const s of sets) {
    if (s.exercise !== exercise || s.workoutId === notWorkout) continue;
    const cur = by.get(s.workoutId) ?? { at: s.at, warm: false };
    by.set(s.workoutId, { at: Math.min(cur.at, s.at), warm: cur.warm || !!s.warmup });
  }
  const last = [...by.values()].sort((a, b) => b.at - a.at).slice(0, 3);
  return last.length > 0 && last.filter((x) => x.warm).length * 2 >= last.length;
}

/** A warm-up's weight: about half the working weight, to the 2.5 kg (1 kg for dumbbells), never below one step. */
export const warmKg = (workKg: number, exercise: string) => { const step = isDumbbell(exercise) ? 1 : 2.5; return Math.max(step, Math.round((workKg * 0.5) / step) * step); };
