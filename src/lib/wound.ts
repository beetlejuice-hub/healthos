/**
 * Insights → Body lab, the nervous-system heatmap (PLAN 177, body lab 5; owner, 27 Oct: "yes"). Minutes your heart was
 * 10+ above your usual for that time of day while you were barely moving — revving with nowhere to go (stress, deep
 * focus, caffeine, a tense call all look like this) — by weekday and hour over the last 4 weeks. Asleep, training and the
 * hour after are left out (lib/heart awakeMinutes), and so is any minute the band counted steps in. An hour is only named
 * when it's wound up on most of its weeks, not once. Pure.
 */

import type { HrMinute, SleepSession, StepBucket } from "./band";
import { awakeMinutes, type Span } from "./heart";
import { usualAt, type Usual } from "./hrusual";
import { addDays, atMinute, localDay } from "./time";

/**
 * over: bpm above your usual; stillSteps: steps a minute under which you're still; weeks: how far back. An hour counts
 * as seen in a week with seenMin minutes of band data in it, and as wound up that week with hotMin wound minutes; it's
 * named when wound up on share of its seen weeks, and at least minWeeks of them.
 */
export const WOUND = { over: 10, stillSteps: 10, weeks: 4, seenMin: 30, hotMin: 5, share: 0.6, minWeeks: 3 } as const;
const MIN = 60_000;
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export type Cell = { wd: number; h: number; perHour: number | null; weeks: number; hot: number };
/** `noSteps`: the band sent no steps, so walking can't be told from sitting — nothing is counted. */
export type Heat = { cells: Cell[]; top: { wd: number; h: number; hot: number; weeks: number; perHour: number; name: string } | null; days: number; minutes: number; noSteps?: true };

/** Monday-first weekday of a local day. */
const wdOf = (day: string) => (new Date(`${day}T12:00:00`).getDay() + 6) % 7;

export function woundHeat(hr: HrMinute[], sleep: Pick<SleepSession, "start" | "end">[], workouts: Span[], steps: StepBucket[], usual: Usual | null, today: string): Heat {
  const from = atMinute(addDays(today, -WOUND.weeks * 7), 0), to = atMinute(today, 0);
  if (!steps.some(([t]) => t >= from && t < to)) return { cells: [], top: null, days: 0, minutes: 0, noSteps: true };
  // steps a minute, from the band's buckets
  const rate = new Map<number, number>();
  for (const [t, len, c] of steps) { if (t + len * MIN < from || t >= to) continue; for (let k = 0; k < len; k++) rate.set(Math.floor(t / MIN) + k, c / len); }
  // per local day and hour: minutes seen, minutes wound up
  const seen = new Map<string, number>(), wound = new Map<string, number>();
  let minutes = 0;
  const days = new Set<string>();
  for (const [t, v] of awakeMinutes(hr.filter((m) => m[0] >= from && m[0] < to), sleep, workouts)) {
    const d = new Date(t), key = `${localDay(t)}|${d.getHours()}`, u = usualAt(usual, t);
    if (!u) continue;
    days.add(localDay(t));
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (v - u.mid >= WOUND.over && (rate.get(Math.floor(t / MIN)) ?? 0) < WOUND.stillSteps) { wound.set(key, (wound.get(key) ?? 0) + 1); minutes++; }
  }
  const cells: Cell[] = [];
  for (let wd = 0; wd < 7; wd++) for (let h = 0; h < 24; h++) {
    let weeks = 0, hot = 0, sum = 0;
    for (const day of days) {
      if (wdOf(day) !== wd) continue;
      const k = `${day}|${h}`, s = seen.get(k) ?? 0;
      if (s < WOUND.seenMin) continue;
      const w = wound.get(k) ?? 0;
      weeks++; sum += (w / s) * 60;
      if (w >= WOUND.hotMin) hot++;
    }
    cells.push({ wd, h, perHour: weeks ? sum / weeks : null, weeks, hot });
  }
  const named = cells.filter((c) => c.weeks >= WOUND.minWeeks && c.hot >= WOUND.minWeeks && c.hot / c.weeks >= WOUND.share).sort((a, b) => b.perHour! - a.perHour! || b.hot - a.hot);
  const t = named[0];
  return { cells, days: days.size, minutes, top: t ? { wd: t.wd, h: t.h, hot: t.hot, weeks: t.weeks, perHour: t.perHour!, name: WEEKDAY_NAMES[t.wd] } : null };
}
