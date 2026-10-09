/**
 * Insights → Heart (PLAN 55; the owner's pick, 9 Oct: "C with A's one-day chart on top"). Pure: the band's minutes,
 * nights and daily numbers in, numbers out; components/Heart.tsx draws them. Words say "goes with", never "causes".
 *
 *  - awakeByDay: each day's average heart rate while awake — asleep (the band's nights and naps), workouts and the
 *    hour after them left out, so a gym day or a short night doesn't read as a higher day. Needs 8 hours of minutes.
 *  - dayNumbers: one day against your usual for each time of day — the awake average and time above / below.
 *  - HEART_OUTCOMES: the grid's columns — the next morning's resting heart rate and HRV (the band's own) and the next
 *    day's awake average. Rows and the shuffle test are lib/sleep's, so the Heart and Sleep grids agree.
 *  - aroundChecks: heart rate in the hour around each check-in against your usual for that time, set against the
 *    stress you gave — compared only with check-ins at about the same time of day. Otherwise stressful afternoons
 *    would borrow the afternoon's higher heart rate (heart.test plants exactly that and checks nothing is found), and
 *    the usual, which holds your usual stress for that hour too, would hide part of a real effect (and that).
 *  - roll: the 7-day average for the trend lines.
 */

import type { HrMinute, SleepSession } from "./band";
import type { Check } from "./feelgraph";
import { usualAt, type Usual } from "./hrusual";
import type { Outcome, Sure } from "./sleep";
import { localDay, minuteOfDay, MIN } from "./time";

export type Span = { start: number; end: number };
/** A day's awake average needs this many minutes of it (a day with the band off half of it says nothing). */
export const AWAKE_NEED_MIN = 8 * 60;
/** Check-ins measured before the stress chart says anything. */
export const CHECK_MIN_N = 12;

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

/** Asleep (any band session, naps too), or training and the hour after — the minutes an awake average leaves out. */
function outSpans(sleep: Pick<SleepSession, "start" | "end">[], workouts: Span[]): Span[] {
  const s = [...sleep.map((x) => ({ start: x.start, end: x.end })), ...workouts.map((w) => ({ start: w.start - 5 * MIN, end: w.end + 60 * MIN }))].sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const x of s) { const l = out.at(-1); if (l && x.start <= l.end) l.end = Math.max(l.end, x.end); else out.push({ ...x }); }
  return out;
}

/** The minutes you were awake and not training (minutes in time order). */
export function awakeMinutes(hr: HrMinute[], sleep: Pick<SleepSession, "start" | "end">[], workouts: Span[]): HrMinute[] {
  const spans = outSpans(sleep, workouts), out: HrMinute[] = [];
  let j = 0;
  for (const m of hr) {
    while (j < spans.length && spans[j].end <= m[0]) j++;
    if (j < spans.length && m[0] >= spans[j].start) continue;
    out.push(m);
  }
  return out;
}

export type AwakeDay = { avg: number; min: number };
/** Each local day's awake average and how many minutes it's from; days under AWAKE_NEED_MIN are left out. */
export function awakeByDay(hr: HrMinute[], sleep: Pick<SleepSession, "start" | "end">[], workouts: Span[]): Map<string, AwakeDay> {
  const by = new Map<string, number[]>();
  for (const m of awakeMinutes(hr, sleep, workouts)) { const d = localDay(m[0]), a = by.get(d); if (a) a.push(m[1]); else by.set(d, [m[1]]); }
  const out = new Map<string, AwakeDay>();
  for (const [d, v] of by) if (v.length >= AWAKE_NEED_MIN) out.set(d, { avg: mean(v), min: v.length });
  return out;
}

export type DayNumbers = { avg: number | null; usualAvg: number | null; above: number; below: number; minutes: number };
/**
 * One day, awake and not training: its average, your usual over the same minutes (so a day that's only got to 11:00
 * is compared with your usual mornings, not your usual whole day), and minutes above / below your usual band.
 */
export function dayNumbers(hr: HrMinute[], sleep: Pick<SleepSession, "start" | "end">[], workouts: Span[], usual: Usual | null, day: string): DayNumbers {
  const mins = awakeMinutes(hr.filter((m) => localDay(m[0]) === day), sleep, workouts);
  let above = 0, below = 0; const mids: number[] = [];
  for (const [t, v] of mins) {
    const u = usualAt(usual, t); if (!u) continue;
    mids.push(u.mid); if (v > u.hi) above++; else if (v < u.lo) below++;
  }
  return { avg: mins.length ? mean(mins.map((m) => m[1])) : null, usualAvg: mids.length >= mins.length / 2 && mids.length ? mean(mids) : null, above, below, minutes: mins.length };
}

/** The grid's columns: what the next morning (and day) held, after each evening's row from lib/sleep. */
export function heartOutcomes(awake: Map<string, AwakeDay>): Outcome[] {
  return [
    { id: "rhr", name: "Resting HR", unit: "bpm", better: -1, of: (n) => n.rhr },
    { id: "hrv", name: "HRV", unit: "ms", better: 1, of: (n) => n.hrv },
    { id: "awake", name: "Awake avg", unit: "bpm", better: -1, of: (n) => awake.get(n.day)?.avg ?? null },
  ];
}

export type CheckPt = { at: number; stress: number; delta: number };
export type AroundChecks = {
  pts: CheckPt[];
  /** bpm against your usual per point of stress given (least squares); null when too few. */
  slope: number | null; p: number | null; sure: Sure;
  /** Mean at each stress level with 3 or more check-ins. */
  levels: { stress: number; mean: number; n: number }[];
};

/** Check-ins are compared with others in the same 3 hours of the day. */
const CHECK_BIN_MIN = 180;

/**
 * Heart rate in the hour around each check-in (±30 min, 20 minutes of it needed) minus your usual at each of those
 * minutes, against the stress you gave. Check-ins near a workout (or the hour after) are left out. The slope is
 * within 3-hour windows of the day: stress above what you usually give at that time against heart rate above your
 * usual then. How sure: shuffle the stress values among check-ins in the same window and see how often a slope this
 * steep turns up anyway — clear p < 0.005, likely p < 0.05 (one test, so no grid correction).
 */
export function aroundChecks(checks: Check[], hr: HrMinute[], usual: Usual | null, workouts: Span[], opts: { perms?: number; seed?: number } = {}): AroundChecks {
  const perms = opts.perms ?? 1000; let seed = opts.seed ?? 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const mins = new Map(hr.map((m) => [Math.floor(m[0] / MIN) * MIN, m[1]]));
  const busy = (a: number, b: number) => workouts.some((w) => w.start - 5 * MIN < b && w.end + 60 * MIN > a);
  const pts: CheckPt[] = [];
  for (const c of checks) {
    if (c.stress == null || busy(c.at - 30 * MIN, c.at + 30 * MIN)) continue;
    const d: number[] = [];
    for (let t = Math.ceil((c.at - 30 * MIN) / MIN) * MIN; t <= c.at + 30 * MIN; t += MIN) { const v = mins.get(t), u = usualAt(usual, t); if (v != null && u) d.push(v - u.mid); }
    if (d.length >= 20) pts.push({ at: c.at, stress: c.stress, delta: mean(d) });
  }
  const levels: AroundChecks["levels"] = [];
  for (let s = 0; s <= 10; s++) { const v = pts.filter((p) => p.stress === s).map((p) => p.delta); if (v.length >= 3) levels.push({ stress: s, mean: mean(v), n: v.length }); }
  // Stress centred within each window of the day; the slope only sees differences between check-ins at about the same time.
  const bins = new Map<number, number[]>();
  pts.forEach((p, i) => { const b = Math.floor(minuteOfDay(p.at) / CHECK_BIN_MIN), a = bins.get(b); if (a) a.push(i); else bins.set(b, [i]); });
  const ys = pts.map((p) => p.delta), my = pts.length ? mean(ys) : 0;
  const centred = (x: number[]) => { const c = new Array<number>(x.length).fill(0); for (const ix of bins.values()) { const m = mean(ix.map((i) => x[i])); ix.forEach((i) => { c[i] = x[i] - m; }); } return c; };
  const slopeOf = (x: number[]) => { const c = centred(x), sxx = c.reduce((a, v) => a + v * v, 0); return sxx > 0 ? c.reduce((a, v, i) => a + v * (ys[i] - my), 0) / sxx : 0; };
  const xs = pts.map((p) => p.stress);
  if (pts.length < CHECK_MIN_N || centred(xs).every((v) => Math.abs(v) < 1e-9)) return { pts, slope: null, p: null, sure: "too few", levels };
  const slope = slopeOf(xs), sh = [...xs];
  let hits = 0;
  for (let k = 0; k < perms; k++) {
    for (const ix of bins.values()) for (let a = ix.length - 1; a > 0; a--) { const b = Math.floor(rnd() * (a + 1)); [sh[ix[a]], sh[ix[b]]] = [sh[ix[b]], sh[ix[a]]]; }
    if (Math.abs(slopeOf(sh)) >= Math.abs(slope) - 1e-9) hits++;
  }
  const p = (hits + 1) / (perms + 1);
  return { pts, slope, p, sure: p < 0.005 ? "clear" : p < 0.05 ? "likely" : "not clear", levels };
}

/** The average of the last `k` values that are there (this one included), when at least `need` of them are. */
export function roll(vals: (number | null)[], k = 7, need = 4): (number | null)[] {
  return vals.map((_, i) => { const w = vals.slice(Math.max(0, i - k + 1), i + 1).filter((v): v is number => v != null); return w.length >= need ? mean(w) : null; });
}
