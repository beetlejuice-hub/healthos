/**
 * Strength numbers from logged sets.
 *
 * - **e1RM** (estimated one-rep max) by Epley: `kg × (1 + reps / 30)`. Reliable-ish up to ~10
 *   reps; past 12 it overestimates, so those sets are left out of "best".
 * - **Next weight**: double progression. If every set of the last session hit the target reps,
 *   add one increment; otherwise repeat the weight. Simple, explainable, and what most people
 *   already do in their head.
 */

export type LoggedSet = { at: number; workoutId: string; exercise: string; kg: number; reps: number };

export const e1rm = (kg: number, reps: number) => (reps <= 1 ? kg : kg * (1 + reps / 30));

/** Best e1RM per workout for one exercise, oldest first. Sets over 12 reps don't count. */
export function e1rmHistory(sets: LoggedSet[], exercise: string): { at: number; workoutId: string; e1rm: number; kg: number; reps: number }[] {
  const byWorkout = new Map<string, { at: number; workoutId: string; e1rm: number; kg: number; reps: number }>();
  for (const s of sets) {
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
  "Hammer curl": { Biceps: 1 },
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
};

/** Every exercise the app knows (for suggestions while typing); your own names work too. */
export const EXERCISES = Object.keys(MUSCLES).sort();

/** Hard sets per muscle in the given sets. Unknown exercises are counted under their own name. */
export function setsPerMuscle(sets: { exercise: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sets) {
    const map = MUSCLES[s.exercise] ?? { [s.exercise]: 1 };
    for (const [m, f] of Object.entries(map)) out[m] = (out[m] ?? 0) + f;
  }
  return out;
}

export const volume = (sets: { kg: number; reps: number }[]) => sets.reduce((a, s) => a + s.kg * s.reps, 0);

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
  for (const s of sets) if (s.exercise === exercise) by.set(s.workoutId, [...(by.get(s.workoutId) ?? []), s]);
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
  if (!counts(set)) return false;
  const before = sets.filter((s) => s.exercise === set.exercise && s.at < set.at && counts(s));
  return before.length > 0 && e1rm(set.kg, set.reps) > Math.max(...before.map((s) => e1rm(s.kg, s.reps))) + 1e-9;
}

export type Summary = { minutes: number; sets: number; volume: number; vsLast: number | null; bests: { exercise: string; kg: number; reps: number; e1rm: number }[] };

/** The finish screen: how long, how much, against the last session of the same day, and new bests. */
export function sessionSummary(w: { id: string; template: string; startedAt: number }, sets: LoggedSet[], workouts: { id: string; template: string; startedAt: number; endedAt: number | null }[], now: number): Summary {
  const mine = sets.filter((s) => s.workoutId === w.id);
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

export const MUSCLE_GROUPS = ["Chest", "Shoulders", "Biceps", "Triceps", "Back", "Core", "Quads", "Hamstrings", "Glutes", "Calves"] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
/**
 * Hard sets per muscle per week where most of the growth is (Schoenfeld et al. 2017 dose–response:
 * more weekly sets → more growth, 10+ clearly better than under 5). The map is fully coloured at `full`.
 */
export const WEEKLY_SETS = { low: 5, good: 10, full: 12, high: 20 };

/** Hard sets per muscle group, per week, over the last `weeks` weeks before `now` (secondary muscles count half). */
export function muscleWeek(sets: { at: number; exercise: string }[], now: number, weeks = 1): Record<MuscleGroup, number> {
  const recent = sets.filter((s) => s.at <= now && s.at > now - weeks * 7 * 86_400_000);
  const per = setsPerMuscle(recent);
  return Object.fromEntries(MUSCLE_GROUPS.map((m) => [m, Math.round(((per[m] ?? 0) / weeks) * 10) / 10])) as Record<MuscleGroup, number>;
}
