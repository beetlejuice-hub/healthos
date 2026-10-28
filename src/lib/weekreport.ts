/**
 * Your week in training, as one report (owner, 28 Oct: "We should get a weekly overview of strength and cardio and gym
 * performance, mostly graphics of how much i improved or not etc etc - health summary"; picked "one scrolling report" on
 * the canvas, then "like all, lets build it"). A week is Monday to Sunday. For it:
 *   - your main lifts (the 4 done most over 8 weeks): the best estimated 1-rep max each week (Epley, working sets of 1–12
 *     reps, lib/training), 8 weeks up to this one; a PB when this week's best beats every week before it;
 *   - working sets per muscle (a lift's other muscles count half, lib/training MUSCLES), against 10–20 a week — the range
 *     where most muscle-growth studies land (Schoenfeld et al. 2017, dose-response meta-analysis);
 *   - cardio minutes, and in heart-rate zones when the band has the minutes and a max heart rate is known (lib/cardio);
 *   - VO2 max and resting heart rate, a value a week for 12 weeks;
 *   - the sessions done, against the days in your split, and the kilos lifted against your usual (the 4 weeks before);
 *   - one thing for next week: the muscle in your program furthest under 10 sets, and 2 more sets of a lift in your split
 *     that works it — only for a finished week.
 * Pure.
 */

import { cardioSpans, minutesOf, zoneMinutes } from "./cardio";
import type { HrMinute } from "./band";
import { e1rm, mainMuscle, MUSCLES, MUSCLE_GROUPS, working, type LoggedSet, type MuscleGroup } from "./training";
import { weekStart } from "./liftstrength";
import { vo2Week, type Vo2Day } from "./vo2";
import type { Template, Workout } from "./types";
import { addDays, localDay } from "./time";

export const WEEK = { lifts: 4, liftWeeks: 8, fitWeeks: 12, setsLo: 10, setsHi: 20, addSets: 2, maxSets: 6 } as const;
const DAY = 86_400_000;

export type LiftRow = { exercise: string; weeks: (number | null)[]; best: number | null; prev: number | null; pb: boolean };
export type WeekReport = {
  from: number; to: number; complete: boolean;
  title: string;
  lifts: LiftRow[];
  muscles: { muscle: MuscleGroup; sets: number; inPlan: boolean }[];
  cardio: { min: number; before: number; zones: number[] | null; zonesBefore: number[] | null };
  vo2: (number | null)[]; rhr: (number | null)[];
  sessions: { at: number; name: string }[]; planned: number | null;
  kg: number; usualKg: number | null;
  pbs: number;
  next: { text: string; add?: { template: string; exercise: string; sets: number } } | null;
};
export type WeekInput = { sets: LoggedSet[]; workouts: Workout[]; templates: Template[]; hr: HrMinute[]; rhr: Record<string, number>; vo2: Record<string, Vo2Day> | undefined; maxHr: number | null };

/** Monday 00:00 of the week `back` weeks before the one `now` is in (0 = this week). */
export function weekFrom(now: number, back = 0): number {
  return weekStart(weekStart(now) - back * 7 * DAY + 3 * DAY); // through a Thursday: a week with a clock change is still one week
}
const median = (v: number[]) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const round1 = (n: number) => Math.round(n * 10) / 10;

/** A lift's best estimated 1-rep max in [a, b), working sets of 1–12 reps; null when it wasn't done. */
function bestIn(sets: LoggedSet[], exercise: string, a: number, b: number): number | null {
  let best: number | null = null;
  for (const s of sets) if (s.exercise === exercise && s.at >= a && s.at < b && s.reps >= 1 && s.reps <= 12 && s.kg > 0) best = Math.max(best ?? 0, e1rm(s.kg, s.reps));
  return best == null ? null : round1(best);
}

export function weekReport(inp: WeekInput, now: number, back = 0): WeekReport {
  const from = weekFrom(now, back), to = weekFrom(now, back - 1), end = Math.min(to, now), complete = now >= to;
  const sets = working(inp.sets);

  // the main lifts: the ones done in the most sessions over the 8 weeks up to this one
  const since = weekFrom(now, back + WEEK.liftWeeks - 1);
  const sessionsOf = new Map<string, Set<string>>();
  for (const s of sets) if (s.at >= since && s.at < end) (sessionsOf.get(s.exercise) ?? sessionsOf.set(s.exercise, new Set()).get(s.exercise)!).add(s.workoutId);
  const main = [...sessionsOf.entries()].filter(([ex]) => MUSCLES[ex]).sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0])).slice(0, WEEK.lifts).map(([ex]) => ex);
  const lifts: LiftRow[] = main.map((exercise) => {
    const weeks = Array.from({ length: WEEK.liftWeeks }, (_, k) => { const a = weekFrom(now, back + WEEK.liftWeeks - 1 - k); return bestIn(sets, exercise, a, Math.min(weekFrom(now, back + WEEK.liftWeeks - 2 - k), end)); });
    const best = weeks[weeks.length - 1], prev = [...weeks.slice(0, -1)].reverse().find((v) => v != null) ?? null;
    const before = bestIn(sets, exercise, 0, from);
    return { exercise, weeks, best, prev, pb: best != null && before != null && best > before };
  });

  // sets per muscle this week; the muscles your split trains are always listed, even at 0
  const count = Object.fromEntries(MUSCLE_GROUPS.map((m) => [m, 0])) as Record<MuscleGroup, number>;
  for (const s of sets) if (s.at >= from && s.at < end) for (const [m, w] of Object.entries(MUSCLES[s.exercise] ?? {})) if (m in count) count[m as MuscleGroup] += w;
  const plan = new Set<MuscleGroup>();
  for (const t of inp.templates) for (const e of t.exercises) for (const [m, w] of Object.entries(MUSCLES[e.name] ?? {})) if (w >= 1 && m in count) plan.add(m as MuscleGroup);
  const muscles = MUSCLE_GROUPS.filter((m) => plan.has(m) || count[m] > 0).map((m) => ({ muscle: m, sets: Math.round(count[m] * 2) / 2, inPlan: plan.has(m) }));

  // cardio: minutes, and zones when the band and a max heart rate allow
  const spans = cardioSpans(inp.workouts, now).filter((s) => !s.running);
  const inWeek = (a: number, b: number) => spans.filter((s) => s.start >= a && s.start < b);
  const prevFrom = weekFrom(now, back + 1);
  const zonesOf = (ss: typeof spans) => {
    if (!inp.maxHr || !ss.length) return null;
    const z = [0, 0, 0, 0, 0];
    for (const s of ss) zoneMinutes(inp.hr, s.start, s.end, inp.maxHr).forEach((m, i) => (z[i] += m));
    return z.some(Boolean) ? z : null;
  };
  const cNow = inWeek(from, end), cBefore = inWeek(prevFrom, from);
  const cardio = { min: cNow.reduce((a, s) => a + minutesOf(s), 0), before: cBefore.reduce((a, s) => a + minutesOf(s), 0), zones: zonesOf(cNow), zonesBefore: zonesOf(cBefore) };

  // fitness: a value a week, 12 weeks, each week's last day (today for this week)
  const lastDay = (k: number) => (k === 0 && !complete ? localDay(now) : addDays(localDay(weekFrom(now, back + k)), 6));
  const vo2 = Array.from({ length: WEEK.fitWeeks }, (_, i) => { const w = inp.vo2 ? vo2Week(inp.vo2, lastDay(WEEK.fitWeeks - 1 - i)) : null; return w ? round1(w.v) : null; });
  const rhr = Array.from({ length: WEEK.fitWeeks }, (_, i) => {
    const e = lastDay(WEEK.fitWeeks - 1 - i), a = addDays(e, -6);
    const m = median(Object.entries(inp.rhr).filter(([d, v]) => d >= a && d <= e && v > 25 && v < 140).map(([, v]) => v));
    return m == null ? null : Math.round(m);
  });

  // sessions and kilos
  const sessions = inp.workouts.filter((w) => w.endedAt && w.startedAt >= from && w.startedAt < end && w.kind !== "cardio").map((w) => ({ at: w.startedAt, name: w.template }));
  const kgIn = (a: number, b: number) => Math.round(sets.filter((s) => s.at >= a && s.at < b).reduce((t, s) => t + s.kg * s.reps, 0));
  const kg = kgIn(from, end);
  const hist = sets.some((s) => s.at < weekFrom(now, back + 3));
  const usualKg = hist ? Math.round([1, 2, 3, 4].map((k) => kgIn(weekFrom(now, back + k), weekFrom(now, back + k - 1))).reduce((a, b) => a + b, 0) / 4) : null;

  const pbs = lifts.filter((l) => l.pb).length;
  // said of a finished week as well as this one ("Mon 19 – Sun 25 Oct: a stronger week")
  const title = !sessions.length && !cardio.min ? (complete ? "No training that week" : "Nothing logged yet this week")
    : pbs ? (complete ? "A stronger week" : "Stronger this week") : complete ? "A steady week" : "This week so far";

  // one thing for next week: the muscle your split trains that's furthest under 10 sets
  let next: WeekReport["next"] = null;
  const under = muscles.filter((m) => m.inPlan && m.sets < WEEK.setsLo).sort((a, b) => a.sets - b.sets);
  if (complete && sessions.length && under.length) {
    const target = under[0].muscle, low = `${target.toLowerCase()} least (${under[0].sets})`;
    const head = under.length > 2 ? `${under.length} muscles in your split got under ${WEEK.setsLo} sets — ${low}.`
      : `${under.map((m, i) => (i ? m.muscle.toLowerCase() : m.muscle)).join(" and ")} got under ${WEEK.setsLo} sets.`;
    const works = inp.templates.flatMap((t) => t.exercises.filter((e) => mainMuscle(e.name) === target).map((e) => ({ t, e })));
    const pick = works.find((x) => x.e.sets + WEEK.addSets <= WEEK.maxSets);
    next = pick ? { text: `${head} Add ${WEEK.addSets} sets of ${pick.e.name} to ${pick.t.name}?`, add: { template: pick.t.name, exercise: pick.e.name, sets: pick.e.sets + WEEK.addSets } }
      : works.length ? { text: `${head} ${works[0].e.name} is already at ${works[0].e.sets} sets on ${works[0].t.name} — a second ${target.toLowerCase()} lift would do more (Edit day).` }
      : { text: `${head} Nothing in your split mainly works ${target.toLowerCase()} — add a lift for it in Edit day.` };
  }
  return { from, to, complete, title, lifts, muscles, cardio, vo2, rhr, sessions, planned: inp.templates.length ? Math.min(7, inp.templates.length) : null, kg, usualKg, pbs, next };
}

/** The headline's pieces (the report's chips, the line): the lifts that went up (PBs first), PBs, cardio, resting HR. */
export function weekParts(r: WeekReport): { lifts: string | null; pbs: string | null; cardio: string | null; rhr: string | null } {
  const ups = r.lifts.filter((l) => l.best != null && l.prev != null && l.best - l.prev >= 0.5)
    .sort((a, b) => Number(b.pb) - Number(a.pb) || (b.best! - b.prev!) - (a.best! - a.prev!)).map((l) => `${l.exercise.toLowerCase()} +${round1(l.best! - l.prev!)} kg`);
  const [r1, r0] = [r.rhr.at(-1), r.rhr.at(-2)];
  return {
    lifts: ups.length ? ups.slice(0, 2).join(", ").replace(/^./, (c) => c.toUpperCase()) : null,
    pbs: r.pbs ? `${r.pbs} PB${r.pbs > 1 ? "s" : ""}` : null,
    cardio: r.cardio.min ? `cardio ${r.cardio.min} min${r.cardio.before ? ` (${r.cardio.min >= r.cardio.before ? "+" : "−"}${Math.abs(r.cardio.min - r.cardio.before)})` : ""}` : null,
    rhr: r1 != null ? `resting HR ${r1}${r0 != null && r1 !== r0 ? ` (${r1 < r0 ? "−" : "+"}${Math.abs(r1 - r0)})` : ""}` : null,
  };
}

/** The headline in a line (Today's card, the AI): "2 of 3 sessions · Squat +2.5 kg, bench +2.5 kg · 2 PBs · cardio 95 min (+20) · resting HR 53 (−2)". */
export function weekLine(r: WeekReport): string {
  const p = weekParts(r), parts = [p.lifts, p.pbs, p.cardio, p.rhr].filter(Boolean);
  return `${r.sessions.length}${r.planned ? ` of ${r.planned}` : ""} session${r.sessions.length === 1 ? "" : "s"}${parts.length ? ` · ${parts.join(" · ")}` : ""}`;
}

/** For the AI: last week as Workout → Your week shows it, with its one suggestion; nothing for a week without training. */
export function weekAiLines(inp: WeekInput, now: number): string[] {
  const r = weekReport(inp, now, 1);
  if (!r.sessions.length && !r.cardio.min) return [];
  return [`Last week (${localDay(r.from)} to ${addDays(localDay(r.from), 6)}, as the app's weekly report shows it): ${r.title.toLowerCase()} — ${weekLine(r)}${r.next ? `. Its one suggestion for this week: ${r.next.text}` : ""}`];
}
