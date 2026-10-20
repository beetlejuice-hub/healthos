/**
 * Smarter next weights (PLAN 143; owner, 20 Oct: "Can we make it so workouts are smart, rep and kg tracking is smart …
 * Make it smart"). On top of the double progression (lib/training suggestNext: every set hit the target → one step up,
 * else repeat):
 *   - reps to spare: every set 3+ over the target last time → two steps up;
 *   - stuck: the same weight missed two sessions running, with no more reps than the time before → about 10 % down, to
 *     build back up with good reps;
 *   - inside a session: a set 3+ reps over the target → the next set one step up; 3+ under → one step down;
 *   - a plateau note when a lift's last 3 sessions all fell short of the best before them.
 * Weights stay on the exercise's own step grid (lib/training kgStep). Pure.
 */

import { e1rm, stepKg, suggestNext, type Suggestion } from "./training";

type S = { kg: number; reps: number };
export const SMART = { spare: 3, off: 3, deload: 0.9, plateau: 3 };

/**
 * The reps an exercise aims for: one number (8) or a range (8–12; PLAN 144). In a range the weight stays while the reps
 * climb, and goes up once every set reaches the top — back to the bottom of the range at the new weight.
 */
export type Reps = { lo: number; hi: number };
export const repsOf = (e: { reps: number; repsMax?: number }): Reps => ({ lo: e.reps, hi: Math.max(e.reps, e.repsMax ?? e.reps) });
export const repsLabel = (e: { reps: number; repsMax?: number }) => (e.repsMax && e.repsMax > e.reps ? `${e.reps}–${e.repsMax}` : String(e.reps));
/** "8-12", "8–12", "8 to 12" → 8–12; "10" → 10; null while it isn't one yet. */
export function parseReps(t: string): { reps: number; repsMax?: number } | null {
  const m = t.trim().match(/^(\d{1,2})\s*(?:[-–—]|to)?\s*(\d{1,2})?$/);
  if (!m) return null;
  const lo = Number(m[1]), hi = m[2] ? Number(m[2]) : undefined;
  return hi != null && hi > lo ? { reps: lo, repsMax: hi } : { reps: lo };
}
const asReps = (r: number | Reps): Reps => (typeof r === "number" ? { lo: r, hi: r } : r);

const sum = (ss: S[]) => ss.reduce((a, s) => a + s.reps, 0);
const atTop = (ss: S[]) => { const top = Math.max(...ss.map((s) => s.kg)); return { top, work: ss.filter((s) => s.kg === top) }; };

/** What to lift today, from this exercise's past sessions (working sets, newest session first). */
export function smartNext(history: S[][], target: number | Reps, step: number): Suggestion | null {
  const { lo, hi } = asReps(target), ranged = hi > lo, label = ranged ? `${lo}–${hi}` : String(lo);
  const sessions = history.filter((h) => h.length);
  if (!sessions.length) return null;
  const { top, work } = atTop(sessions[0]), reps = work.map((s) => s.reps).join("/");
  if (work.every((s) => s.reps >= hi + SMART.spare)) {
    const kg = stepKg(stepKg(top, step, 1), step, 1);
    return { kg, reps: lo, reason: `reps to spare last time (${reps} against ${label}), so +${+(kg - top).toFixed(2)} kg` };
  }
  const prev = sessions[1] && atTop(sessions[1]);
  const missed = (w: S[]) => w.some((s) => s.reps < lo);
  if (prev && prev.top === top && missed(work) && missed(prev.work) && sum(work) <= sum(prev.work)) {
    const kg = Math.max(step, Math.floor((top * SMART.deload) / step + 1e-9) * step);
    return { kg: +kg.toFixed(2), reps: lo, reason: `${top} kg fell short two sessions running (${prev.work.map((s) => s.reps).join("/")}, then ${reps}), so ${+kg.toFixed(2)} kg to build back up with full sets` };
  }
  if (!ranged) return suggestNext(sessions[0], lo, step);
  // a range: every set at the top → up a step, back to the bottom; else the same weight, one rep more than the weakest set
  if (work.every((s) => s.reps >= hi)) {
    const kg = stepKg(top, step, 1);
    return { kg, reps: lo, reason: `every set reached ${hi}, the top of ${label} (${reps}), so +${+(kg - top).toFixed(2)} kg and back to ${lo}` };
  }
  const aim = Math.min(hi, Math.max(lo, Math.min(...work.map((s) => s.reps)) + 1));
  return { kg: top, reps: aim, reason: `${reps} last time, inside ${label}: same ${top} kg, aim for ${aim} a set` };
}

/** The next set inside today's session, from the last one: null when it should stay as it is. */
export function adaptNext(today: S[], target: number | Reps, step: number): { kg: number; reason: string } | null {
  const { lo, hi } = asReps(target), last = today[today.length - 1];
  if (!last || last.kg <= 0) return null;
  if (last.reps >= hi + SMART.spare) return { kg: stepKg(last.kg, step, 1), reason: `${last.reps} reps at ${last.kg} kg — that was light, so a step up` };
  if (last.reps <= lo - SMART.off && last.kg > step) return { kg: stepKg(last.kg, step, -1), reason: `${last.reps} of ${hi > lo ? `${lo}–${hi}` : lo} reps at ${last.kg} kg — a step down to keep the reps` };
  return null;
}

/** "3 sessions without beating 76 kg" — when a lift's last 3 sessions all fell short of its best before them. */
export function plateau(history: S[][]): string | null {
  const best = history.filter((h) => h.length).map((h) => Math.max(...h.map((s) => e1rm(s.kg, s.reps))));
  if (best.length < SMART.plateau + 1) return null;
  const recent = best.slice(0, SMART.plateau), before = Math.max(...best.slice(SMART.plateau));
  if (recent.some((v) => v > before * 1.005)) return null;
  return `${SMART.plateau} sessions without beating your best (≈ ${Math.round(before)} kg 1-rep max) — try one more rep per set before adding weight, or a lighter week`;
}

/** This exercise's past sessions, newest first: working sets, each session in the order done; not `notWorkout` (today's). */
export function historyOf<T extends S & { at: number; workoutId: string; exercise: string; warmup?: boolean }>(sets: T[], exercise: string, notWorkout?: string): T[][] {
  const by = new Map<string, T[]>();
  for (const s of [...sets].sort((a, b) => a.at - b.at)) if (s.exercise === exercise && !s.warmup && s.workoutId !== notWorkout) by.set(s.workoutId, [...(by.get(s.workoutId) ?? []), s]);
  return [...by.values()].sort((a, b) => b[0].at - a[0].at);
}
