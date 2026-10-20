/**
 * The day's workout, for the night read-back (PLAN 129; owner, 20 Oct: "Can we have ai look at the workout at eod and make
 * a summary, suggestions, compare how i am improving etc? Like at midnight when doing the digest, at days when i log a
 * workout..like a health couach but it should not fire often, it costs api credits"). No call of its own: on a day with a
 * workout, the read-back that already runs gets these lines and answers a workout part too.
 *
 * Each session: its time, working sets and kg lifted against the last session of the same day (template); each lift: its
 * working sets, today's best set as a 1-rep max estimate against the last time that lift was done, and a new best when it
 * beats every time before. Warm-ups are never counted (PLAN 80). Pure.
 */

import { e1rm, type LoggedSet } from "./training";
import { clock, dayLabel } from "./time";

type W = { id: string; template: string; startedAt: number; endedAt: number | null };
const pct = (now: number, then: number) => { const p = (100 * (now - then)) / then; return `${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(1)} %`; };
const kgs = (v: number) => `${Math.round(v).toLocaleString("en-GB")} kg`;
const best = (sets: LoggedSet[]) => sets.reduce((b, s) => (e1rm(s.kg, s.reps) > e1rm(b.kg, b.reps) ? s : b));

/** Lines for each workout started in `window`, each lift against the last time before it. */
export function workoutLines(workouts: W[], sets: LoggedSet[], window: [number, number]): string[] {
  const work = sets.filter((s) => !s.warmup);
  const out: string[] = [];
  for (const w of [...workouts].filter((x) => x.startedAt >= window[0] && x.startedAt < window[1]).sort((a, b) => a.startedAt - b.startedAt)) {
    const mine = work.filter((s) => s.workoutId === w.id).sort((a, b) => a.at - b.at);
    if (!mine.length) continue;
    const vol = mine.reduce((a, s) => a + s.kg * s.reps, 0);
    const prev = workouts.filter((x) => x.template === w.template && x.startedAt < w.startedAt && work.some((s) => s.workoutId === x.id)).sort((a, b) => b.startedAt - a.startedAt)[0];
    const prevVol = prev ? work.filter((s) => s.workoutId === prev.id).reduce((a, s) => a + s.kg * s.reps, 0) : null;
    const end = w.endedAt ?? mine[mine.length - 1].at;
    out.push(`${w.template} ${clock(w.startedAt)}–${clock(end)} (${Math.round((end - w.startedAt) / 60_000)} min): ${mine.length} working set${mine.length === 1 ? "" : "s"}, ${kgs(vol)}${prev && prevVol ? ` (last ${w.template}, ${dayLabel(prev.startedAt)}: ${kgs(prevVol)}, ${pct(vol, prevVol)})` : ` (your first ${w.template})`}`);
    for (const ex of [...new Set(mine.map((s) => s.exercise))]) {
      const today = mine.filter((s) => s.exercise === ex), b = best(today), e = e1rm(b.kg, b.reps);
      const before = work.filter((s) => s.exercise === ex && s.at < w.startedAt);
      const lastId = before.length ? before.reduce((a, s) => (s.at > a.at ? s : a)).workoutId : null;
      const last = lastId ? best(before.filter((s) => s.workoutId === lastId)) : null;
      const top = before.length ? Math.max(...before.map((s) => e1rm(s.kg, s.reps))) : null;
      const vs = last ? `; last time ${dayLabel(last.at)} ${last.kg} × ${last.reps} ≈ ${Math.round(e1rm(last.kg, last.reps))} kg, ${pct(e, e1rm(last.kg, last.reps))}` : "; first time";
      out.push(`- ${ex}: ${today.map((s) => `${s.kg} × ${s.reps}`).join(", ")} — best ${b.kg} × ${b.reps} ≈ ${Math.round(e)} kg 1-rep max${vs}${top != null && e > top + 1e-9 ? " — new best" : ""}`);
    }
  }
  return out;
}
