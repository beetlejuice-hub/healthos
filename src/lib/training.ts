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
  "Lateral raise": { Shoulders: 1 },
};

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
