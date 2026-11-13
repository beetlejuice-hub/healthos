/**
 * The Workout home, renovated (owner, 13 Nov: "A A A … make theese better and smarter and start building them"; canvas
 * https://claude.ai/artifact/HLqpvYqyrUoW3hwV8n9cUC, Workout A "just today's session" with B's week as a thin row). What
 * the home needs that the old one didn't work out: the week as seven days (what was done each day), every lift's target
 * for the session up next with what changed since last time, and a line from this morning's readiness. Pure.
 */

import type { Template, Workout } from "./types";
import type { LoggedSet } from "./training";
import { kgStep } from "./training";
import { historyOf, repsLabel, repsOf, smartNext } from "./progress";
import { kindOf } from "./cardio";
import { equipOf } from "./exsearch";
import { weekStart } from "./liftstrength";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type StripDay = { dow: string; day: number; labels: string[]; today: boolean; past: boolean };
/** A short name for what a workout was: its template's first word ("Push + Quads" → "Push"), a cardio's kind ("Stair"). */
export function shortName(w: Workout): string {
  if (w.kind === "cardio") { const k = kindOf(w.cardio?.what ?? w.template)?.name ?? w.cardio?.what ?? "Cardio"; return k === "Stairmaster" ? "Stair" : k === "Incline walk" ? "Incline" : k.split(" ")[0]; }
  return (w.template.split(/[\s+/&,·-]+/).find(Boolean) ?? w.template).slice(0, 8);
}

/** This week, Monday to Sunday: what was done each day (finished workouts and the running one), which day is today. */
export function weekStrip(workouts: Workout[], now: number): StripDay[] {
  const mon = weekStart(now);
  return DOW.map((dow, i) => {
    // by the calendar (a day across a clock change is 23 or 25 hours)
    const d = new Date(mon); d.setDate(d.getDate() + i); const d0 = d.getTime(); d.setDate(d.getDate() + 1); const d1 = d.getTime();
    const ws = workouts.filter((w) => w.startedAt >= d0 && w.startedAt < d1 && w.startedAt <= now).sort((a, b) => a.startedAt - b.startedAt);
    return { dow, day: d0, labels: ws.map(shortName), today: now >= d0 && now < d1, past: d1 <= now };
  });
}

export type Target = { name: string; plan: string; kg: number | null; reps: number | null; change: string | null; reason: string | null };
/** Each exercise of a day: today's target (lib/progress smartNext — double progression from your own sets) and what moved
 * against last time's top set ("+2.5 kg", "+1 rep"); none for an exercise never done. */
export function targetsFor(t: Template, sets: LoggedSet[]): Target[] {
  return t.exercises.map((e) => {
    const plan = `${e.sets} × ${e.reps === 1 ? "hold" : repsLabel(e)}`, hist = historyOf(sets, e.name);
    const mine = sets.filter((s) => s.exercise === e.name && !s.warmup).map((s) => s.kg);
    const sug = hist.length ? smartNext(hist, repsOf(e), kgStep(e.name, mine, equipOf(e.name) === "dumbbell")) : null;
    if (!sug) return { name: e.name, plan, kg: null, reps: null, change: null, reason: null };
    const last = hist[0], topKg = Math.max(...last.map((s) => s.kg)), topReps = Math.max(...last.filter((s) => s.kg === topKg).map((s) => s.reps));
    const dk = Math.round((sug.kg - topKg) * 100) / 100;
    const change = dk > 0 ? `+${dk} kg` : dk < 0 ? `−${Math.abs(dk)} kg` : sug.reps > topReps ? `+${sug.reps - topReps} rep${sug.reps - topReps === 1 ? "" : "s"}` : null;
    return { name: e.name, plan, kg: sug.kg, reps: sug.reps, change, reason: sug.reason };
  });
}

/** The line under Start, from this morning's readiness (lib/readiness's words). Never "don't train"; nothing without it. */
export function readyLine(r: { score: number; word: string } | null): string | null {
  if (!r) return null;
  const s = Math.round(r.score);
  if (s >= 85) return `Readiness ${s}: a good day to push the first lift.`;
  if (s >= 70) return `Readiness ${s}: go as planned.`;
  if (s >= 60) return `Readiness ${s}: as planned; no need to chase a best today.`;
  return `Readiness ${s}: take it easier, last time's weights are enough today.`;
}
