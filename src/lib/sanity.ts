/**
 * A typo guard (PLAN 145; owner, 20 Oct: "do these" — #137's first part: "anomalies, maybe things like i lifted 315 kg per
 * hand - possible misstype from 31,5"). Before a set or a weigh-in is kept, a number far outside his own history asks once:
 * "315 kg — far above your best on this (34 kg). Did you mean 31.5?". Never blocks: he can keep what he typed. Judged only
 * against his own numbers, with room for real jumps (a new best, a lighter week). Pure.
 */

import { median } from "./stats";

export type Guard = { msg: string; fix?: { kg?: number; reps?: number; label: string } };
export const SANE = { up: 1.5, down: 0.45, minSets: 3, maxKg: 400, repsHigh: 30, weighIn: 0.1 };

const near = (v: number, to: number) => v >= to * 0.6 && v <= to * 1.4;
const fmt = (v: number) => String(+v.toFixed(2));

/** A working set against that exercise's past working sets, oldest first. `pair`: two dumbbells, logged as the total in his hands. */
export function checkSet(kg: number, reps: number, past: { kg: number; reps: number }[], pair = false): Guard | null {
  if (reps > SANE.repsHigh) {
    const usual = past.length ? median(past.map((s) => s.reps)) : 10, tenth = Math.round(reps / 10);
    if (!past.length || reps > 2 * Math.max(...past.map((s) => s.reps)))
      return { msg: `${reps} reps — far more than usual (${Math.round(usual)}).`, ...(tenth >= 1 && near(tenth, usual) ? { fix: { reps: tenth, label: `${tenth} reps` } } : {}) };
  }
  if (kg > SANE.maxKg) return { msg: `${fmt(kg)} kg is more than anyone's set.`, ...(past.length && near(kg / 10, median(past.map((s) => s.kg))) ? { fix: { kg: kg / 10, label: `${fmt(kg / 10)} kg` } } : {}) };
  if (past.length < SANE.minSets || kg <= 0) return null;
  const kgs = past.map((s) => s.kg), best = Math.max(...kgs), usual = median(kgs.slice(-10));
  if (kg > Math.max(best * SANE.up, usual * 1.6)) {
    const t = [kg / 10, kg / 100].find((v) => near(v, usual));
    return { msg: `${fmt(kg)} kg — far above your best on this (${fmt(best)} kg).`, ...(t ? { fix: { kg: t, label: `${fmt(t)} kg` } } : {}) };
  }
  // the usual mix-up with dumbbells: one in hand typed, when he logs both together — about half his usual
  if (pair && kg <= usual * 0.55 && Math.abs(kg * 2 - usual) <= usual * 0.2) return { msg: `${fmt(kg)} kg — you log both dumbbells together, usually about ${fmt(usual)}.`, fix: { kg: kg * 2, label: `${fmt(kg * 2)} kg (both)` } };
  if (kg < usual * SANE.down) {
    const t = [kg * 10].find((v) => near(v, usual));
    if (t) return { msg: `${fmt(kg)} kg — far below your usual ${fmt(usual)} kg.`, fix: { kg: t, label: `${fmt(t)} kg` } };
  }
  return null;
}

/** A weigh-in against the last one: more than 10 % off is asked about, with the decimal moved when that fits. */
export function checkWeight(kg: number, last: number | null): Guard | null {
  if (last == null || last <= 0 || Math.abs(kg - last) / last <= SANE.weighIn) return null;
  const t = [kg / 10, kg * 10, kg / 100].find((v) => Math.abs(v - last) / last <= SANE.weighIn);
  return { msg: `${fmt(kg)} kg — ${kg > last ? "up" : "down"} ${Math.round((Math.abs(kg - last) / last) * 100)} % from your last weigh-in (${fmt(last)} kg).`, ...(t ? { fix: { kg: +t.toFixed(2), label: `${fmt(t)} kg` } } : {}) };
}
