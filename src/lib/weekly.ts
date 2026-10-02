/**
 * Your week, how you felt: the last 7 days against the 7 before, the best and worst time of day,
 * your best and lowest day with what happened on it, and the top connection the between-check-ins
 * engine has so far. Starts once there are two weeks of check-ins. Changes are only called "up" or
 * "down" when they're bigger than the week-to-week wobble (Welch 95%); otherwise "about the same".
 */

import type { Entry, Workout } from "./types";
import { localDay, addDays } from "./time";
import { mean, difference } from "./stats";
import { FEEL_KEYS, type FeelKey } from "./feel";
import { between, type BetweenResult } from "./detectors/between";

export const WEEKLY = { needDays: 14, needCheckIns: 10 };

type Feel = Extract<Entry, { kind: "feel" }>;
export type Avg = { k: FeelKey; now: number | null; before: number | null; dir: "up" | "down" | "same" | null; n: number };
export type Band = { name: string; mood: number; n: number };
export type DayNote = { day: string; mood: number; what: string[] };
export type Week = {
  checkIns: number; days: number;
  avgs: Avg[];
  best: Band | null; worst: Band | null;
  bestDay: DayNote | null; lowDay: DayNote | null;
  /** A finding (sure enough), or the strongest early sign (may be chance), or nothing yet. */
  top: { r: BetweenResult; sure: boolean } | null;
};
export type Weekly = { ready: false; startsOn: string | null; checkIns: number } | { ready: true; week: Week };

const BANDS: [string, number, number][] = [["mornings", 0, 11], ["middays", 11, 15], ["afternoons", 15, 19], ["evenings", 19, 24]];

export function weekly(entries: Entry[], workouts: Workout[], suppNames: Map<string, string>, now: number): Weekly {
  const feels = entries.filter((e): e is Feel => e.kind === "feel" && e.at <= now).sort((a, b) => a.at - b.at);
  if (!feels.length) return { ready: false, startsOn: null, checkIns: 0 };
  const today = localDay(now), first = localDay(feels[0].at);
  const startsOn = addDays(first, WEEKLY.needDays - 1); // 14 days counting the first
  if (startsOn > today || feels.length < WEEKLY.needCheckIns) return { ready: false, startsOn: startsOn > today ? startsOn : today, checkIns: feels.length };

  const weekStart = addDays(today, -6), prevStart = addDays(today, -13);
  const inWeek = feels.filter((f) => localDay(f.at) >= weekStart);
  const inPrev = feels.filter((f) => localDay(f.at) >= prevStart && localDay(f.at) < weekStart);

  const avgs: Avg[] = FEEL_KEYS.map((k) => {
    const a = inWeek.flatMap((f) => (f[k] != null ? [f[k]!] : [])), b = inPrev.flatMap((f) => (f[k] != null ? [f[k]!] : []));
    const d = difference(a, b);
    return { k, now: a.length ? mean(a) : null, before: b.length ? mean(b) : null, n: a.length, dir: !d ? null : !d.clear ? "same" : d.value > 0 ? "up" : "down" };
  });

  const bands = BANDS.flatMap(([name, from, to]) => {
    const xs = inWeek.filter((f) => f.mood != null && new Date(f.at).getHours() >= from && new Date(f.at).getHours() < to).map((f) => f.mood!);
    return xs.length >= 2 ? [{ name, mood: mean(xs), n: xs.length }] : [];
  }).sort((a, b) => b.mood - a.mood);

  const byDay = new Map<string, number[]>();
  for (const f of inWeek) if (f.mood != null) byDay.set(localDay(f.at), [...(byDay.get(localDay(f.at)) ?? []), f.mood]);
  const days = [...byDay.entries()].map(([day, xs]) => ({ day, mood: mean(xs) })).sort((a, b) => b.mood - a.mood);
  const what = (day: string): string[] => {
    const es = entries.filter((e) => localDay(e.at) === day);
    const out: string[] = [];
    if (workouts.some((w) => localDay(w.startedAt) === day)) out.push("gym");
    const alc = es.reduce((s, e) => s + (e.kind === "drink" ? e.alcoholG : 0), 0);
    if (alc >= 10) out.push("alcohol");
    if (es.some((e) => e.kind === "drink" && e.caffeineMg > 0 && new Date(e.at).getHours() >= 15)) out.push("late caffeine");
    const tags = new Set(es.flatMap((e) => (e.kind === "feel" ? e.doing ?? [] : [])));
    for (const t of tags) if (!out.includes(t)) out.push(t);
    return out;
  };
  const note = (d?: { day: string; mood: number }) => (d ? { ...d, what: what(d.day) } : null);

  const rs = between(entries, workouts, suppNames, now);
  const found = rs.filter((r) => r.found).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))[0];
  const early = rs.filter((r) => !r.found && Math.abs(r.effect) >= 1 && r.p < 0.2 && r.withN >= 3).sort((a, b) => a.p - b.p)[0];

  return {
    ready: true,
    week: {
      checkIns: inWeek.length, days: new Set(inWeek.map((f) => localDay(f.at))).size,
      avgs,
      best: bands.length >= 2 ? bands[0] : null, worst: bands.length >= 2 ? bands[bands.length - 1] : null,
      bestDay: days.length >= 3 ? note(days[0]) : null, lowDay: days.length >= 3 ? note(days[days.length - 1]) : null,
      top: found ? { r: found, sure: true } : early ? { r: early, sure: false } : null,
    },
  };
}
