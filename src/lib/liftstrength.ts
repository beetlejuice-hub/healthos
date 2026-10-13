/**
 * Training page A · your lifts (PLAN 64; owner's pick 13 Oct, all three boards). Strength measured so that normal
 * progress isn't credited to a good day: each lift's estimated 1-rep max per session (its best working set, Epley), a
 * straight line through that lift's sessions (its trend), and a session's strength = how far its lifts' bests sat from
 * their own lines, averaged (±%). Plus this week against your usual weeks, and working sets per muscle. Pure.
 */

import { e1rm, MUSCLE_GROUPS, MUSCLES, volume, working, type LoggedSet, type MuscleGroup } from "./training";
import { DAY } from "./time";

/** A lift needs this many sessions before it has a trend. */
export const TREND_MIN = 3;

export type LiftPoint = { at: number; workoutId: string; e1rm: number; kg: number; reps: number };
export type LiftTrend = { exercise: string; pts: LiftPoint[]; slopePerDay: number; at0: number; v0: number; line: (t: number) => number; gain: number; days: number };

/** Each session's best working set of `exercise` as an estimated 1-rep max (sets of 1–12 reps). */
export function liftPoints(sets: LoggedSet[], exercise: string): LiftPoint[] {
  const by = new Map<string, LiftPoint>();
  for (const s of working(sets)) {
    if (s.exercise !== exercise || s.reps < 1 || s.reps > 12 || s.kg <= 0) continue;
    const v = e1rm(s.kg, s.reps), cur = by.get(s.workoutId);
    if (!cur || v > cur.e1rm) by.set(s.workoutId, { at: cur ? Math.min(cur.at, s.at) : s.at, workoutId: s.workoutId, e1rm: v, kg: s.kg, reps: s.reps });
  }
  return [...by.values()].sort((a, b) => a.at - b.at);
}

/** The least-squares line through a lift's sessions; `gain`: the line's rise from its first session to its last, kg. */
export function liftTrend(sets: LoggedSet[], exercise: string): LiftTrend | null {
  const pts = liftPoints(sets, exercise);
  if (pts.length < TREND_MIN) return null;
  const xs = pts.map((p) => (p.at - pts[0].at) / DAY), ys = pts.map((p) => p.e1rm);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const slope = sxx > 0 ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx : 0;
  const at0 = pts[0].at, v0 = my - slope * mx, line = (t: number) => v0 + slope * ((t - at0) / DAY);
  const days = xs[xs.length - 1];
  return { exercise, pts, slopePerDay: slope, at0, v0, line, gain: slope * days, days };
}

/** The lifts with a trend, most-trained first (sessions), at most `max`. */
export function mainLifts(sets: LoggedSet[], max = 4): LiftTrend[] {
  const sessions = new Map<string, Set<string>>();
  for (const s of working(sets)) sessions.set(s.exercise, (sessions.get(s.exercise) ?? new Set()).add(s.workoutId));
  return [...sessions.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .map(([ex]) => liftTrend(sets, ex)).filter((t): t is LiftTrend => t != null).slice(0, max);
}

export type Session = { id: string; template: string; startedAt: number; endedAt: number | null; sets: LoggedSet[]; volume: number; workingSets: number;
  /** Each lift's best against its own trend, averaged, in % (null: no lift in it has a trend yet). */ pct: number | null; lifts: { exercise: string; pct: number }[] };

/** Every session, with its strength against your trends (all lifts with a trend, not only the main four). */
export function sessions(workouts: { id: string; template: string; startedAt: number; endedAt: number | null }[], sets: LoggedSet[]): Session[] {
  const trends = new Map<string, LiftTrend>();
  for (const ex of new Set(working(sets).map((s) => s.exercise))) { const t = liftTrend(sets, ex); if (t) trends.set(ex, t); }
  return [...workouts].sort((a, b) => a.startedAt - b.startedAt).map((w) => {
    const mine = sets.filter((s) => s.workoutId === w.id), lifts: { exercise: string; pct: number }[] = [];
    for (const [ex, t] of trends) { const p = t.pts.find((x) => x.workoutId === w.id); if (p) lifts.push({ exercise: ex, pct: (p.e1rm / t.line(p.at) - 1) * 100 }); }
    return { ...w, sets: mine, volume: volume(mine), workingSets: working(mine).length, pct: lifts.length ? lifts.reduce((a, l) => a + l.pct, 0) / lifts.length : null, lifts };
  }).filter((s) => s.sets.length > 0);
}

/** Monday 00:00 of the week `t` is in (local). */
export function weekStart(t: number): number {
  const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime();
}
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

export type ThisWeek = { from: number; sessions: number; workingSets: number; pct: number | null; usualSessions: number | null; usualSets: number | null };
/** This week (from Monday) against the 4 full weeks before it: sessions, working sets, strength against your trends. */
export function thisWeek(ss: Session[], now: number): ThisWeek {
  const from = weekStart(now), mine = ss.filter((s) => s.startedAt >= from && s.startedAt <= now);
  const weeks = [1, 2, 3, 4].map((k) => ss.filter((s) => s.startedAt >= from - k * 7 * DAY && s.startedAt < from - (k - 1) * 7 * DAY));
  const any = ss.some((s) => s.startedAt < from - 3 * 7 * DAY); // a usual needs 4 weeks of history, not 4 empty ones
  const pcts = mine.flatMap((s) => (s.pct == null ? [] : [s.pct]));
  return { from, sessions: mine.length, workingSets: mine.reduce((a, s) => a + s.workingSets, 0), pct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
    usualSessions: any ? median(weeks.map((w) => w.length)) : null, usualSets: any ? median(weeks.map((w) => w.reduce((a, s) => a + s.workingSets, 0))) : null };
}

/** Working sets per muscle in a week: the average of the 4 full weeks before this one, and this week so far (secondary muscles count half). */
export function setsPerMuscleWeek(sets: LoggedSet[], now: number): { muscle: MuscleGroup; usual: number; now: number }[] {
  const from = weekStart(now);
  const count = (a: number, b: number) => {
    const c = Object.fromEntries(MUSCLE_GROUPS.map((m) => [m, 0])) as Record<MuscleGroup, number>;
    for (const s of working(sets)) if (s.at >= a && s.at < b) for (const [m, w] of Object.entries(MUSCLES[s.exercise] ?? {})) if (m in c) c[m as MuscleGroup] += w;
    return c;
  };
  const usual = count(from - 28 * DAY, from), cur = count(from, now + 1);
  return MUSCLE_GROUPS.map((m) => ({ muscle: m, usual: usual[m] / 4, now: cur[m] })).filter((x) => x.usual > 0 || x.now > 0);
}
