/**
 * Insights → Mind (approved prototype v2, phase 3). Two views of how you felt:
 * - the course: each day's mood against your own average (the clinical life-chart layout), with
 *   energy, stress, sleep and what happened that day underneath;
 * - the rhythm: mood by weekday × time of day, from every check-in.
 * And the band's side (PLAN 58, owner's pick 9 Oct: "C, with A's calendar under it"):
 * - the grid: last night, this morning, the evening before and the day against how you felt that day
 *   (lib/sleep's shuffle test, so it reads like the Sleep and Heart grids), and this morning's line from it;
 * - a feeling against hours asleep the night before;
 * - the month as a calendar, each day's mood against your usual.
 * Pure: in → numbers out; the component only draws. Nothing here says "because".
 */

import type { Entry, EntryOf } from "./types";
import type { GlanceDay } from "./glance";
import { clockH, type Cell as GridCell, type Evening, type Factor, type Night, type Outcome, type Sure } from "./sleep";
import { mean } from "./stats";
import { usualSteps } from "./steps";

export type CourseDay = GlanceDay & { dev: number | null; drinksBefore: boolean; weekend: boolean };
export type Course = { base: number | null; days: CourseDay[]; above: number; rated: number; best: CourseDay | null; lowest: CourseDay | null };

/** The last `n` days of `days` (oldest → newest), each day's mood against the average of every rated day given. */
export function moodCourse(days: GlanceDay[], n: number): Course {
  const rated = days.filter((d) => d.mood != null);
  const base = rated.length ? mean(rated.map((d) => d.mood!)) : null;
  const from = Math.max(0, days.length - n);
  const list: CourseDay[] = days.slice(from).map((d, k) => {
    const prev = days[from + k - 1], dow = new Date(`${d.day}T12:00`).getDay();
    return { ...d, dev: d.mood != null && base != null ? d.mood - base : null, drinksBefore: (prev?.drinks ?? 0) > 0, weekend: dow === 0 || dow === 6 };
  });
  const r = list.filter((d) => d.mood != null);
  const sorted = [...r].sort((a, b) => b.mood! - a.mood!);
  return { base, days: list, above: r.filter((d) => d.dev! > 0).length, rated: r.length, best: sorted[0] ?? null, lowest: sorted[sorted.length - 1] ?? null };
}

/** Time-of-day blocks, start hours. A check-in before 06:00 counts in the last block (a late night). */
export const BLOCKS = [6, 9, 12, 15, 18, 21] as const;
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Cell = { row: number; col: number; mean: number | null; n: number };
export type Rhythm = { cells: Cell[]; lo: number | null; hi: number | null; best: Cell | null; lowest: Cell | null; n: number };

/** Mood by weekday (Mon first) × 3-hour block, from check-ins at or after `fromMs`. Best/lowest need 2+ check-ins in a cell. */
export function moodRhythm(entries: Entry[], fromMs: number, key: "mood" | "energy" | "stress" = "mood"): Rhythm {
  const grid: number[][][] = WEEKDAYS.map(() => BLOCKS.map(() => []));
  let n = 0;
  for (const e of entries) {
    if (e.kind !== "feel" || e.at < fromMs) continue;
    const v = (e as EntryOf<"feel">)[key]; if (v == null) continue;
    const d = new Date(e.at), h = d.getHours();
    // Before 06:00 belongs to the previous evening: last block of the day before.
    const late = h < 6, wd = (d.getDay() + 6 - (late ? 1 : 0)) % 7;
    const col = late ? BLOCKS.length - 1 : BLOCKS.findLastIndex((b) => h >= b);
    grid[wd][col].push(v); n++;
  }
  const cells: Cell[] = grid.flatMap((row, r) => row.map((vs, c) => ({ row: r, col: c, mean: vs.length ? mean(vs) : null, n: vs.length })));
  const filled = cells.filter((c) => c.mean != null), firm = filled.filter((c) => c.n >= 2).sort((a, b) => b.mean! - a.mean!);
  return {
    cells, n,
    lo: filled.length ? Math.min(...filled.map((c) => c.mean!)) : null,
    hi: filled.length ? Math.max(...filled.map((c) => c.mean!)) : null,
    best: firm[0] ?? null, lowest: firm.length > 1 ? firm[firm.length - 1] : null,
  };
}

/** A cell's colour step 0–5 between the grid's lowest and highest mean. */
export const stepOf = (v: number, lo: number, hi: number) => Math.max(0, Math.min(5, Math.floor(((v - lo) / (hi - lo || 1)) * 5.999)));

/* ------------------------------------------------------------------ the band's side (PLAN 58) */

export type Feeling = "mood" | "energy" | "stress" | "focus";
export const FEELING_NAMES: [Feeling, string][] = [["mood", "Mood"], ["energy", "Energy"], ["stress", "Stress"], ["focus", "Focus"]];

/** The grid's columns: how you felt the day each night ends on (that day's check-ins, as GlanceDay has them). Less stress is the better way. */
export function mindOutcomes(byDay: Map<string, GlanceDay>): Outcome[] {
  return FEELING_NAMES.map(([k, name]) => ({ id: k, name, unit: "/10" as const, better: k === "stress" ? -1 : 1, of: (n: Night) => byDay.get(n.day)?.[k] ?? null }));
}

export type When = "last night" | "this morning" | "the evening before" | "the day";
export type MindFactor = Factor & { when: When };
/** Under this many minutes asleep is a short night. */
export const SHORT_NIGHT_MIN = 390;

/**
 * The grid's rows, each saying when it's from — this morning's line only uses what's known by the morning. HRV's
 * "lowest quarter" is among the nights given (needs 8 with HRV); "trained that day" is the day itself, not the evening.
 */
export function mindFactors(ns: Night[], trainedOn: (day: string) => boolean, steps?: Map<string, number>): MindFactor[] {
  const hrv = ns.map((n) => n.hrv).filter((v): v is number => v != null).sort((a, b) => a - b);
  const mid = steps ? usualSteps(steps, ns.map((n) => n.day)) : null;
  const q1 = hrv.length >= 8 ? hrv[Math.floor((hrv.length - 1) * 0.25)] : null;
  return [
    { id: "short", name: "Under 6 h 30 asleep", when: "last night", has: (n) => n.asleep < SHORT_NIGHT_MIN },
    { id: "latebed", name: "In bed after 00:15", when: "last night", has: (n) => clockH(n.bed, n.eve) >= 24.25 },
    { id: "lowhrv", name: "HRV in your lowest quarter", when: "this morning", has: (n) => q1 != null && n.hrv != null && n.hrv <= q1 },
    { id: "drinks", name: "Drinks the evening before", when: "the evening before", has: (_, e) => e.drinks.length > 0 },
    { id: "caf", name: "Caffeine at bed ≥ 30 mg", when: "the evening before", has: (_, e) => e.caffeineAtBed >= 30 },
    { id: "trained", name: "Trained that day", when: "the day", has: (n) => trainedOn(n.day) },
    // PLAN 66 (owner: "more walking equals … better mood"): the day's own steps, worn days only.
    { id: "steps", name: "More steps than usual", when: "the day", has: (n) => mid != null && (steps!.get(n.day) ?? 0) > mid, known: (n) => mid != null && !!steps?.has(n.day) },
  ];
}

export type MorningLink = { factor: MindFactor; cell: GridCell };
/** What the grid says about mornings like this one: rows known by the morning that hold for it, cells clear or likely. */
export function thisMorning(n: Night, e: Evening, factors: MindFactor[], cells: GridCell[]): MorningLink[] {
  return factors.filter((f) => f.when !== "the day" && f.has(n, e)).flatMap((f) =>
    cells.filter((c) => c.factor === f.id && (c.sure === "clear" || c.sure === "likely")).map((cell) => ({ factor: f, cell })))
    .sort((a, b) => a.cell.p! - b.cell.p!);
}

export type SleepSlope = { pts: [hours: number, value: number][]; slope: number | null; p: number | null; sure: Sure };
/** Days needed before the slope says anything. */
export const SLOPE_MIN_DAYS = 10;

/**
 * A feeling on the day against hours asleep the night before: the least-squares slope per hour; how sure by shuffling
 * which day had which night (2,000 times). The page lets you pick any of four feelings, so the bars are four times
 * stricter than for one: clear p < 0.00125, likely p < 0.0125.
 */
export function sleepSlope(ns: Night[], of: (n: Night) => number | null, opts: { perms?: number; seed?: number } = {}): SleepSlope {
  const pts: [number, number][] = ns.flatMap((n) => { const v = of(n); return v == null ? [] : [[n.asleep / 60, v] as [number, number]]; });
  if (pts.length < SLOPE_MIN_DAYS) return { pts, slope: null, p: null, sure: "too few" };
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), mx = mean(xs), my = mean(ys);
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  if (sxx === 0) return { pts, slope: null, p: null, sure: "too few" };
  const slopeOf = (y: number[]) => xs.reduce((a, x, i) => a + (x - mx) * (y[i] - my), 0) / sxx;
  const slope = slopeOf(ys), perms = opts.perms ?? 2000, sh = [...ys];
  let seed = opts.seed ?? 13, hits = 0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let k = 0; k < perms; k++) {
    for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
    if (Math.abs(slopeOf(sh)) >= Math.abs(slope) - 1e-9) hits++;
  }
  const p = (hits + 1) / (perms + 1);
  return { pts, slope, p, sure: p < 0.00125 ? "clear" : p < 0.0125 ? "likely" : "not clear" };
}

export type CalDay = { day: string; mood: number | null; dev: number | null; step: number | null; drinksBefore: boolean; short: boolean | null; trained: boolean };
export type Month = { usual: number | null; days: CalDay[] };
/** Mood points from your usual that make each colour step: about usual inside ±0.3, then 0.7, then 1.2. */
export const CAL_STEPS = [0.3, 0.7, 1.2];

/**
 * The last `n` days as a calendar: each day's mood against your usual — the middle of those days' moods (needs 5 rated
 * days) — as a step −3…3; what the evening before held, a short night (from the band, null without one), training.
 */
export function moodMonth(days: GlanceDay[], n: number, asleepOn: (day: string) => number | null): Month {
  const list = days.slice(-n), rated = list.map((d) => d.mood).filter((v): v is number => v != null).sort((a, b) => a - b);
  const usual = rated.length >= 5 ? (rated.length % 2 ? rated[(rated.length - 1) / 2] : (rated[rated.length / 2 - 1] + rated[rated.length / 2]) / 2) : null;
  const step = (dev: number) => Math.sign(dev) * CAL_STEPS.filter((s) => Math.abs(dev) >= s).length;
  const start = days.length - list.length;
  return {
    usual,
    days: list.map((d, k) => {
      const dev = d.mood != null && usual != null ? d.mood - usual : null, a = asleepOn(d.day);
      return { day: d.day, mood: d.mood, dev, step: dev == null ? null : step(dev), drinksBefore: (days[start + k - 1]?.drinks ?? 0) > 0, short: a == null ? null : a < SHORT_NIGHT_MIN, trained: d.trained };
    }),
  };
}
