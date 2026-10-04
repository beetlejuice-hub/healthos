/**
 * Insights → Mind (approved prototype v2, phase 3). Two views of how you felt:
 * - the course: each day's mood against your own average (the clinical life-chart layout), with
 *   energy, stress, sleep and what happened that day underneath;
 * - the rhythm: mood by weekday × time of day, from every check-in.
 * Pure: in → numbers out; the component only draws. Nothing here says "because".
 */

import type { Entry, EntryOf } from "./types";
import type { GlanceDay } from "./glance";
import { mean } from "./stats";

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
