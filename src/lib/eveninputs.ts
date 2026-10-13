/**
 * What `evenings()` (lib/sleep) needs, from the log: drinks, caffeine, workouts, food, check-ins, supplement answers and the
 * morning sleep entries. One place, so the AI's nights (lib/ai/nights) and Today's "Tonight" (lib/tonight) read the same
 * evening the Sleep grid does. Pure.
 */

import { caffeineAt } from "./caffeine";
import { alcoholDoses, caffeineDoses } from "./insights";
import type { evenings } from "./sleep";
import type { Entry, Workout } from "./types";

export function eveningInputs(entries: Entry[], workouts: Workout[], halfLifeMin: number): Parameters<typeof evenings>[1] {
  const doses = caffeineDoses(entries);
  return {
    drinks: alcoholDoses(entries), caffeineAt: (t) => caffeineAt(doses, t, halfLifeMin), workouts: workouts.map((w) => ({ start: w.startedAt })),
    meals: entries.filter((e) => e.kind === "food"), ratings: entries.flatMap((e) => (e.kind === "sleep" ? [{ at: e.at, rating: e.rating }] : [])),
    sleeps: entries.filter((e) => e.kind === "sleep"),
    foods: entries.flatMap((e) => (e.kind === "food" ? [{ at: e.at, kcal: e.macros.kcal, c: e.macros.c }] : [])),
    sessions: workouts.map((w) => ({ start: w.startedAt, end: w.endedAt ?? w.startedAt + 3_600_000 })),
    checks: entries.flatMap((e) => (e.kind === "feel" && e.stress != null ? [{ at: e.at, stress: e.stress }] : [])),
    supps: entries.flatMap((e) => (e.kind === "supp" ? [{ at: e.at, suppId: e.suppId, status: e.status }] : [])),
  };
}
