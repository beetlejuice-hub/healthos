/** Head-to-head on the bench: tdee.ts vs Balance, same fake people. Used by the tests and the prototype. */
import { bodyDays, realBurn } from "../tdee";
import { addDays } from "../time";
import { balance } from "./engine";
import { SCENARIOS, world, type ScenarioId } from "./world";

export const LAST = "2026-09-30";

export function daysFor(id: ScenarioId, seed: number, from?: number) {
  const s = SCENARIOS[id].w;
  const { entries, truth } = world({ ...s, seed, lastDay: LAST });
  const span = from ?? s.days;
  const days = bodyDays(entries, addDays(LAST, -(span - 1)), LAST);
  days[days.length - 1] = { ...days[days.length - 1], kcal: null };
  return { days, truth, entries };
}

export type Score = { answered: number; mae: number; covered: number; n: number };

/** Both engines on `seeds` fake people: how often they answer, how far off, how often the 90% range holds the truth. */
export function race(id: ScenarioId, seeds: number) {
  const app: Score = { answered: 0, mae: 0, covered: 0, n: seeds }, bal: Score = { answered: 0, mae: 0, covered: 0, n: seeds };
  for (let seed = 1; seed <= seeds; seed++) {
    const all = daysFor(id, seed), truth = all.truth.burn[all.truth.burn.length - 1];
    const a = realBurn(daysFor(id, seed, Math.min(28, SCENARIOS[id].w.days)).days);
    if (a) { app.answered++; app.mae += Math.abs(a.kcal - truth); if (a.lo <= truth && truth <= a.hi) app.covered++; }
    const b = balance(all.days);
    if (b) { bal.answered++; bal.mae += Math.abs(b.burn - truth); if (b.lo <= truth && truth <= b.hi) bal.covered++; }
  }
  for (const s of [app, bal]) { if (s.answered) { s.mae /= s.answered; s.covered /= s.answered; } }
  return { app, bal };
}
