/**
 * Insights "at a glance" (owner, 3 Oct, on the desktop prototype: "god damn this is hella good … lets
 * get this built"). Your week against your own usual: each measure's last-7-day value, the range a
 * usual *day* falls in (shaded behind the sparklines and the day-by-day strip) and the range a usual
 * *week* falls in — which is what the week is judged against.
 *
 * Why two ranges: a 7-day average is much steadier than single days, so judging it against the
 * spread of days calls almost every week "typical" (found on the prototype: a deliberately rough week
 * still read 16 of 16 typical). So the week is compared with your 7-day averages over the 8 weeks
 * before it; single days with your days over the 4 weeks before.
 *
 * Pure: entries in, numbers out. Nothing here says "causes"; it only says higher or lower than usual.
 */

import type { Entry, EntryOf, Workout } from "./types";
import type { Settings } from "./store";
import { dailyFacts, type DayFacts } from "./insights";
import { addDays, localDay } from "./time";
import { mean, quantile } from "./stats";

export type GlanceDay = {
  day: string;
  mood: number | null; energy: number | null; focus: number | null; stress: number | null;
  /** The sleep rating given that morning (last night's sleep). */
  sleep: number | null;
  kcal: number | null; protein: number | null;
  /** Caffeine left at your planned bedtime that evening; null on days with nothing logged. */
  cafBed: number | null;
  /** Drinks (14 g of alcohol each) that day; null on days with nothing logged. */
  drinks: number | null;
  /** The day's last weigh-in. */
  weight: number | null;
  trained: boolean; lateCaffeine: boolean; note: boolean;
  checkins: number;
};

const of = <K extends Entry["kind"]>(entries: Entry[], k: K) => entries.filter((e): e is EntryOf<K> => e.kind === k);

/** One row per day, `fromDay` to `toDay` inclusive. */
export function glanceDays(entries: Entry[], workouts: Workout[], settings: Settings, fromDay: string, toDay: string): GlanceDay[] {
  const facts = dailyFacts(entries, workouts, settings, fromDay, toDay);
  const sleep = new Map<string, number>(), weight = new Map<string, { at: number; kg: number }>(), notes = new Set<string>(), checks = new Map<string, number>();
  for (const e of of(entries, "sleep")) if (e.rating != null && !sleep.has(localDay(e.at))) sleep.set(localDay(e.at), e.rating);
  for (const w of of(entries, "weight")) { const d = localDay(w.at), cur = weight.get(d); if (!cur || w.at > cur.at) weight.set(d, { at: w.at, kg: w.kg }); }
  for (const f of of(entries, "feel")) { const d = localDay(f.at); checks.set(d, (checks.get(d) ?? 0) + 1); if (f.note?.trim()) notes.add(d); }
  return facts.map((f: DayFacts) => ({
    day: f.day, mood: f.mood, energy: f.energy, focus: f.focus, stress: f.stress,
    sleep: sleep.get(f.day) ?? null,
    kcal: f.kcal, protein: f.proteinG,
    cafBed: f.logged ? f.caffeineAtBed : null,
    drinks: f.logged ? f.alcoholG / 14 : null,
    weight: weight.get(f.day)?.kg ?? null,
    trained: f.trained, lateCaffeine: f.lateCaffeineMg > 0, note: notes.has(f.day),
    checkins: checks.get(f.day) ?? 0,
  }));
}

export type MeasureKey = "mood" | "energy" | "focus" | "stress" | "sleep" | "kcal" | "protein" | "cafBed" | "drinks" | "weight";
export type Measure = {
  k: MeasureKey; name: string; unit: string; group: "Mind" | "Sleep" | "Body & intake";
  /** Which way is better for you; null when neither is (calories: depends on your goal). */
  good: "up" | "down" | null;
  dec: 0 | 1;
  /** "sum": the week is a total (drinks per week); "mean": an average of the days that have a value. */
  agg: "mean" | "sum";
  /** Today's value is only partway (calories so far, caffeine before bedtime): left out of the week. */
  partialToday?: boolean;
  why?: string;
};

export const MEASURES: Measure[] = [
  { k: "mood", name: "Mood", unit: "/10", group: "Mind", good: "up", dec: 1, agg: "mean" },
  { k: "energy", name: "Energy", unit: "/10", group: "Mind", good: "up", dec: 1, agg: "mean" },
  { k: "focus", name: "Focus", unit: "/10", group: "Mind", good: "up", dec: 1, agg: "mean" },
  { k: "stress", name: "Stress", unit: "/10", group: "Mind", good: "down", dec: 1, agg: "mean" },
  { k: "sleep", name: "Sleep rating", unit: "/10", group: "Sleep", good: "up", dec: 1, agg: "mean", why: "Your own morning rating of last night." },
  { k: "kcal", name: "Calories", unit: "kcal", group: "Body & intake", good: null, dec: 0, agg: "mean", partialToday: true, why: "Days with food logged." },
  { k: "protein", name: "Protein", unit: "g", group: "Body & intake", good: "up", dec: 0, agg: "mean", partialToday: true },
  { k: "cafBed", name: "Caffeine at bedtime", unit: "mg", group: "Body & intake", good: "down", dec: 0, agg: "mean", partialToday: true, why: "What's left in you at your planned bedtime." },
  { k: "drinks", name: "Drinks", unit: "/week", group: "Body & intake", good: "down", dec: 1, agg: "sum", partialToday: true, why: "One drink = 14 g of alcohol." },
  { k: "weight", name: "Weight", unit: "kg", group: "Body & intake", good: null, dec: 1, agg: "mean" },
];

/** Minimums before a range is shown (fewer and it would be a guess). 14 overlapping 7-day windows = 3 weeks of history. */
export const GLANCE_MIN = { weekDays: 3, sumDays: 5, usualDays: 10, usualWeeks: 14, windowDays: 4 } as const;

export type Band = { p10: number; p50: number; p90: number; n: number };
export type MeasureStat = Measure & {
  /** This week's value (average, or total per week). Null with too few days. */
  week: number | null;
  /** How many of the last 7 days have a value. */
  weekDays: number;
  day: Band | null;
  usualWeek: Band | null;
  /** "building": not enough history yet for a usual week. */
  state: "lo" | "hi" | "ok" | "building" | "none";
  delta: number | null;
  /** Higher/lower in the good direction; null when within range or neither way is better. */
  better: boolean | null;
  /** Daily values over the trend window, oldest first, for the sparkline. */
  trend: (number | null)[];
};

const band = (xs: number[], min: number): Band | null =>
  xs.length >= min ? { p10: quantile(xs, 0.1), p50: quantile(xs, 0.5), p90: quantile(xs, 0.9), n: xs.length } : null;

/**
 * Every measure for the 7 days ending `today`. `days` must run oldest → newest and end on `today`;
 * `trendDays` sets how much of it the sparkline gets.
 */
export function glance(days: GlanceDay[], today: string, trendDays = 30): MeasureStat[] {
  const idx = new Map(days.map((d, i) => [d.day, i]));
  const end = idx.get(today) ?? days.length - 1, start = end - 6;
  return MEASURES.map((m) => {
    const v = (i: number): number | null => {
      if (i < 0 || i >= days.length) return null;
      if (m.partialToday && i === end && days[i].day === today) return null;
      return days[i][m.k];
    };
    const windowValue = (a: number, z: number): { value: number | null; n: number } => {
      const xs: number[] = []; for (let i = a; i <= z; i++) { const x = v(i); if (x != null) xs.push(x); }
      if (m.agg === "sum") return { value: xs.length >= GLANCE_MIN.sumDays ? (xs.reduce((s, x) => s + x, 0) * 7) / xs.length : null, n: xs.length };
      return { value: xs.length >= GLANCE_MIN.weekDays ? mean(xs) : null, n: xs.length };
    };
    const wk = windowValue(start, end);
    // A usual day: the 4 weeks before this week. A usual week: 7-day windows ending in the 8 weeks before.
    const dayVals: number[] = []; for (let i = start - 28; i < start; i++) { const x = v(i); if (x != null) dayVals.push(x); }
    const weekVals: number[] = [];
    for (let e = start - 1; e >= start - 56 && e - 6 >= 0; e--) {
      const xs: number[] = []; for (let i = e - 6; i <= e; i++) { const x = v(i); if (x != null) xs.push(x); }
      if (m.agg === "sum" ? xs.length >= GLANCE_MIN.sumDays : xs.length >= GLANCE_MIN.windowDays) weekVals.push(m.agg === "sum" ? (xs.reduce((s, x) => s + x, 0) * 7) / xs.length : mean(xs));
    }
    const day = band(dayVals, GLANCE_MIN.usualDays), usualWeek = band(weekVals, GLANCE_MIN.usualWeeks);
    const week = wk.value;
    const state: MeasureStat["state"] = week == null ? "none" : !usualWeek ? "building" : week < usualWeek.p10 ? "lo" : week > usualWeek.p90 ? "hi" : "ok";
    const delta = week != null && usualWeek ? week - usualWeek.p50 : null;
    const better = (state === "lo" || state === "hi") && m.good ? (m.good === "up") === (state === "hi") : null;
    const trend: (number | null)[] = []; for (let i = end - trendDays + 1; i <= end; i++) trend.push(i >= 0 ? (i === end && m.partialToday ? null : days[i]?.[m.k] ?? null) : null);
    return { ...m, week, weekDays: wk.n, day, usualWeek, state, delta, better, trend };
  });
}

/** The 7 days of this week, for the day-by-day strip. */
export const weekDays = (days: GlanceDay[], today: string): GlanceDay[] => {
  const end = days.findIndex((d) => d.day === today);
  return days.slice(Math.max(0, (end < 0 ? days.length : end + 1) - 7), end < 0 ? days.length : end + 1);
};

/** Whether a single day's value sits outside a usual day; with its tone. */
export function dayTone(m: MeasureStat, v: number | null): "better" | "worse" | "neutral" | null {
  if (v == null || !m.day) return null;
  const out = v < m.day.p10 ? "lo" : v > m.day.p90 ? "hi" : null;
  if (!out) return null;
  if (!m.good) return "neutral";
  return (m.good === "up") === (out === "hi") ? "better" : "worse";
}

/** The first and last day a glance over `n` days back needs (8 weeks of history + this week). */
export const glanceSpan = (today: string, trendDays = 30) => ({ from: addDays(today, -Math.max(70, trendDays + 7)), to: today });
