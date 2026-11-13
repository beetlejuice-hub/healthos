/**
 * Cardio fitness without typing, the app's side (PLAN 218; canvas A: a row per lane). From the Worker's 5-minute
 * windows (lib/cadence: steps a minute and the heart rate in them) and the workouts:
 *
 *   lanes     walking — 100–130 steps a minute outside workouts (and the 10 minutes after one); running — 140+ outside
 *             workouts, or inside a Run; the stairmaster — inside a Stairmaster (a session of its own, a phase, or the
 *             cardio after lifting). Only windows wholly inside a cardio phase count as that phase's.
 *   steady    a window counts only if the 5 minutes before it were the same lane: the heart lags the first minutes of
 *             a walk, so a bout's first window would read low.
 *   per week  the heart rate at one fixed step rate (the lane's median, to the nearest 5): each week's average heart
 *             rate moved along a slope shared by all weeks (heart rate per step a minute, fitted within weeks — so a
 *             faster week isn't read as an unfit one) to that step rate. Weeks with under FIT.minWin windows are left out.
 *   trend     a straight line through the weekly points; it says "lower"/"higher" only when it moved FIT.change bpm or
 *             more and the shuffle test (sessionfacts slopeTest) puts it under p 0.05. Lower at the same step rate goes
 *             with fitter.
 *
 * Recovery (the drop in the 2 minutes after cardio, worked out by the Worker) gets the same line, over sessions. Resting
 * heart rate and the band's VO2 max are put on the same weeks. Pure.
 */

import type { CadPair, Recovery } from "./cadence";
import type { Workout } from "./types";
import type { Vo2Day } from "./vo2";
import { kindOf } from "./cardio";
import { phasesOf } from "./cardiostats";
import { weekStart } from "./liftstrength";
import { slopeTest } from "./sessionfacts";

const MIN = 60_000, WEEK = 7 * 86_400_000;
export const FIT = {
  weeks: 12, minWin: 3, minWeeks: 4, walk: [100, 130] as const, run: 140, runIn: 100, stairIn: 40, afterMin: 10,
  /** heart rate per step a minute: the fitted slope is held inside this; with no spread to fit, `slope0` */
  slope: [0, 1.5] as const, slope0: 0.5, change: 2, p: 0.05,
} as const;

export type Lane = "walk" | "run" | "stair";
export const LANES: Lane[] = ["walk", "stair", "run"];
export const LANE_NAME: Record<Lane, string> = { walk: "Daily walking", run: "Running", stair: "Stairmaster" };
export type Win = { t: number; spm: number; bpm: number; lane: Lane };

/** Which lane each window is in (none: left out), and only steady ones (the window before it in the same lane). */
export function laneWindows(pairs: CadPair[], workouts: Workout[], now: number): Win[] {
  const phases = workouts.flatMap((w) => phasesOf(w, now)).map((p) => ({ start: p.start, end: p.end, kind: kindOf(p.what)?.name ?? null }));
  const busy = workouts.map((w) => [w.startedAt, (w.endedAt ?? now) + FIT.afterMin * MIN] as const);
  const laneOf = ([t, spm]: CadPair): Lane | null => {
    const end = t + 5 * MIN, ph = phases.find((p) => p.start <= t && end <= p.end);
    if (ph) return ph.kind === "Stairmaster" && spm >= FIT.stairIn ? "stair" : ph.kind === "Run" && spm >= FIT.runIn ? "run" : null;
    if (busy.some(([a, z]) => t < z && end > a)) return null;
    return spm >= FIT.walk[0] && spm <= FIT.walk[1] ? "walk" : spm >= FIT.run ? "run" : null;
  };
  const all = [...pairs].sort((a, b) => a[0] - b[0]).map((p) => ({ p, lane: laneOf(p) }));
  const at = new Map(all.map((x) => [x.p[0], x.lane]));
  return all.flatMap(({ p, lane }) => (lane && at.get(p[0] - 5 * MIN) === lane ? [{ t: p[0], spm: p[1], bpm: p[2], lane }] : []));
}

export type WeekPoint = { week: number; v: number; n: number; spm: number };
export type Trend = { from: number; to: number; change: number; p: number | null; word: "lower" | "higher" | "same" } | null;
export type LaneTrend = { lane: Lane; ref: number; slope: number; windows: number; pts: WeekPoint[]; trend: Trend;
  /** for the cloud: the first and last 3 weeks' windows, each group's line at `ref` */ then: Win[]; now: Win[]; thenAt: number | null; nowAt: number | null };

const mean = (v: number[]) => v.reduce((a, x) => a + x, 0) / v.length;
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** The first week shown: FIT.weeks weeks back, this one included. */
export const firstWeek = (now: number, weeks: number = FIT.weeks) => weekStart(weekStart(now) - (weeks - 1) * WEEK + WEEK / 2);

/** A straight line through points (x in weeks): where it starts and ends, and whether the move is clear. */
export function lineOf(pts: [number, number][], up: "lower" | "higher", min: number = FIT.minWeeks): Trend {
  if (pts.length < min) return null;
  const s = slopeTest(pts, { min, perms: 2000, seed: 218 });
  if (s.slope == null) return null;
  const xs = pts.map((q) => q[0]), mx = mean(xs), my = mean(pts.map((q) => q[1])), x0 = Math.min(...xs), x1 = Math.max(...xs);
  const from = my + s.slope * (x0 - mx), to = my + s.slope * (x1 - mx), change = to - from;
  const clear = Math.abs(change) >= FIT.change && s.p != null && s.p < FIT.p;
  return { from, to, change, p: s.p, word: !clear ? "same" : (change < 0) === (up === "lower") ? up : up === "lower" ? "higher" : "lower" };
}

/** A lane's weeks: the heart rate at its step rate each week, and how that moved. Null with no windows in the span. */
export function laneTrend(wins: Win[], lane: Lane, now: number, weeks: number = FIT.weeks): LaneTrend | null {
  const from = firstWeek(now, weeks), mine = wins.filter((w) => w.lane === lane && w.t >= from && w.t <= now);
  if (!mine.length) return null;
  const ref = Math.round(median(mine.map((w) => w.spm)) / 5) * 5;
  const byWeek = new Map<number, Win[]>();
  for (const w of mine) { const k = weekStart(w.t); (byWeek.get(k) ?? byWeek.set(k, []).get(k)!).push(w); }
  // the shared slope, fitted within weeks (each week against its own averages)
  let sxy = 0, sxx = 0;
  for (const ws of byWeek.values()) {
    const mx = mean(ws.map((w) => w.spm)), my = mean(ws.map((w) => w.bpm));
    for (const w of ws) { sxy += (w.spm - mx) * (w.bpm - my); sxx += (w.spm - mx) ** 2; }
  }
  const slope = sxx >= 25 ? Math.min(FIT.slope[1], Math.max(FIT.slope[0], sxy / sxx)) : FIT.slope0;
  const pts: WeekPoint[] = [...byWeek.entries()].sort((a, b) => a[0] - b[0]).filter(([, ws]) => ws.length >= FIT.minWin).map(([week, ws]) => {
    const spm = mean(ws.map((w) => w.spm));
    return { week, n: ws.length, spm, v: mean(ws.map((w) => w.bpm)) - slope * (spm - ref) };
  });
  const trend = lineOf(pts.map((p) => [(p.week - from) / WEEK, p.v]), "lower");
  // the cloud: the first 3 weeks with points against the last 3 (when there are 6 or more), each group's line at ref
  const split = pts.length >= 6 ? [pts.slice(0, 3), pts.slice(-3)] : null;
  const inW = (g: WeekPoint[]) => mine.filter((w) => g.some((p) => p.week === weekStart(w.t)));
  const at = (ws: Win[]) => (ws.length ? mean(ws.map((w) => w.bpm)) - slope * (mean(ws.map((w) => w.spm)) - ref) : null);
  const then = split ? inW(split[0]) : [], nowW = split ? inW(split[1]) : [];
  return { lane, ref, slope, windows: mine.length, pts, trend, then, now: nowW, thenAt: at(then), nowAt: at(nowW) };
}

export type RecPoint = { start: number; what: string; rec: Recovery };
/** Recovery over the span's sessions: a line over them (in weeks), higher is fitter. */
export function recoveryTrend(pts: RecPoint[], now: number, weeks: number = FIT.weeks): { pts: RecPoint[]; trend: Trend; last: RecPoint | null } {
  const from = firstWeek(now, weeks), mine = pts.filter((p) => p.start >= from && p.start <= now).sort((a, b) => a.start - b.start);
  return { pts: mine, trend: lineOf(mine.map((p) => [(p.start - from) / WEEK, p.rec.drop]), "higher"), last: mine.at(-1) ?? null };
}

/** A daily value (resting heart rate, VO2 max) as weekly averages over the span. */
export function weekly(byDay: Record<string, number | Vo2Day> | undefined, now: number, weeks: number = FIT.weeks): { week: number; v: number }[] {
  const from = firstWeek(now, weeks), out = new Map<number, number[]>();
  for (const [day, x] of Object.entries(byDay ?? {})) {
    const v = typeof x === "number" ? x : x?.v, t = new Date(`${day}T12:00:00`).getTime();
    if (v == null || !Number.isFinite(v) || t < from || t > now) continue;
    const k = weekStart(t); (out.get(k) ?? out.set(k, []).get(k)!).push(v);
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([week, v]) => ({ week, v: mean(v) }));
}

const dm = (t: number) => { const d = new Date(t); return `${d.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]}`; };
/** "Walking at 115 steps a minute: 112 → 104 bpm since 24 Aug — lower, goes with fitter." */
export function laneLine(t: LaneTrend): string {
  const name = t.lane === "walk" ? "Walking" : t.lane === "run" ? "Running" : "On the stairmaster";
  if (!t.trend) return `${name} at ${t.ref} steps a minute: ${Math.round(t.pts.at(-1)?.v ?? 0)} bpm. ${t.pts.length} of ${FIT.minWeeks} weeks for a trend.`;
  const a = Math.round(t.trend.from), b = Math.round(t.trend.to), since = dm(t.pts[0].week);
  const said = t.trend.word === "lower" ? "lower, which goes with fitter" : t.trend.word === "higher" ? "higher than it was" : "about the same so far";
  return `${name} at ${t.ref} steps a minute: ${a} → ${b} bpm since ${since}, ${said}.`;
}
export const recLine = (r: ReturnType<typeof recoveryTrend>) => {
  if (!r.trend) return r.last ? `Your heart rate fell ${r.last.rec.drop} bpm in the 2 minutes after your last cardio (${dm(r.last.start)}). ${r.pts.length} of ${FIT.minWeeks} sessions for a trend.` : null;
  const a = Math.round(r.trend.from), b = Math.round(r.trend.to), said = r.trend.word === "higher" ? "a faster drop, which goes with fitter" : r.trend.word === "lower" ? "a slower drop than it was" : "about the same so far";
  return `After cardio your heart rate falls ${a} → ${b} bpm in 2 minutes since ${dm(r.pts[0].start)}, ${said}.`;
};
