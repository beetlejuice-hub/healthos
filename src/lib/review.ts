/**
 * The week and month reads (PLAN 65; owner: "AI should look at data at eod, eow, eom, and make suggestions, summaries,
 * etc, even make graphs or like interesting notices"; 15 Oct: "do the digests"). The end of the day is the night
 * read-back; this is the step back. The app measures here — each measure's week against your usual week, the same numbers
 * At a glance uses — and the AI only writes about them, picking which measure each of its notices is about so the card
 * can draw that measure's chart from these numbers, never from the AI's. Pure.
 */

import type { Entry, Goals, Workout } from "./types";
import type { Settings } from "./store";
import { glance, glanceDays, dayShade, type MeasureKey, type MeasureStat } from "./glance";
import type { Shade } from "./shade";
import { bodyDays, weightTrend } from "./tdee";
import { sessions } from "./liftstrength";
import { working, type LoggedSet } from "./training";
import { addDays, atMinute, dayLabel, localDay } from "./time";

/** Reads are written from this hour on (Monday for the week, the 1st for the month). */
export const REVIEW_FROM_H = 6;
/** A month read missed on the 1st is still written within this many days; after that it would be stale. */
export const MONTH_CATCHUP_DAYS = 7;

export type ReviewKind = "week" | "month";
export type Due = { kind: ReviewKind; key: string; from: string; to: string };

const noon = (day: string) => atMinute(day, 720);
export const mondayOf = (day: string) => addDays(day, -((new Date(noon(day)).getDay() + 6) % 7));

/**
 * What's due now, given the reads already written (`done`: "week:2026-10-12", "month:2026-09"). The week just gone, from
 * Monday 06:00 until the next Monday — opened on Thursday, it's written then; the month just gone, from the 1st 06:00 for a
 * week. A Monday the 1st gets both.
 */
export function dueReviews(now: number, done: string[]): Due[] {
  const today = localDay(now), early = new Date(now).getHours() < REVIEW_FROM_H, out: Due[] = [];
  const monday = mondayOf(today);
  if (!(today === monday && early)) {
    const from = addDays(monday, -7);
    if (!done.includes(`week:${from}`)) out.push({ kind: "week", key: from, from, to: addDays(monday, -1) });
  }
  const dom = Number(today.slice(8)), first = `${today.slice(0, 8)}01`;
  if (dom <= MONTH_CATCHUP_DAYS && !(dom === 1 && early)) {
    const to = addDays(first, -1), from = `${to.slice(0, 8)}01`, key = to.slice(0, 7);
    if (!done.includes(`month:${key}`)) out.push({ kind: "month", key, from, to });
  }
  return out;
}

/** One measure's week: its value against your usual week, and each day shaded against a usual day. */
export type ReviewRow = {
  k: MeasureKey; name: string; unit: string; dec: 0 | 1; good: "up" | "down" | null;
  value: number | null; usual: number | null; state: MeasureStat["state"]; better: boolean | null;
  /** A usual day (10th–90th percentile of the 4 weeks before), for the chart's band. */
  lo: number | null; hi: number | null;
  days: (number | null)[]; shades: Shade[];
};
export type WeekFacts = {
  from: string; to: string; rows: ReviewRow[];
  training: { sessions: number; sets: number; usualSessions: number | null; pct: number | null };
  weight: { kg: number; perWeek: number } | null;
  food: { days: number; onGoal: number; proteinHit: number; goal: number; protein: number };
  pace: number | null;
  best: { day: string; mood: number } | null; worst: { day: string; mood: number } | null;
};

/** The week `from`–`to` (Mon–Sun, all of it over) against the weeks before it. */
export function weekFacts(entries: Entry[], workouts: Workout[], settings: Settings, goals: Goals, from: string, to: string): WeekFacts {
  const days = glanceDays(entries, workouts, settings, addDays(to, -77), to);
  const stats = glance(days, to, 7, true);
  const rows: ReviewRow[] = stats.filter((m) => m.weekDays > 0).map((m) => ({
    k: m.k, name: m.name, unit: m.unit, dec: m.dec, good: m.good, value: m.week, usual: m.usualWeek?.p50 ?? null, state: m.state, better: m.better,
    lo: m.day?.p10 ?? null, hi: m.day?.p90 ?? null, days: m.trend, shades: m.trend.map((v) => dayShade(m, v)),
  }));
  const t0 = atMinute(from, 0), t1 = atMinute(addDays(to, 1), 0);
  const sets = entries.filter((e): e is Extract<Entry, { kind: "set" }> => e.kind === "set") as LoggedSet[];
  const ss = sessions(workouts, sets), mine = ss.filter((s) => s.startedAt >= t0 && s.startedAt < t1);
  const before = [1, 2, 3, 4].map((k) => ss.filter((s) => s.startedAt >= t0 - k * 7 * 86_400_000 && s.startedAt < t0 - (k - 1) * 7 * 86_400_000).length);
  const pcts = mine.flatMap((s) => (s.pct == null ? [] : [s.pct]));
  const trend = weightTrend(bodyDays(entries, addDays(to, -27), to));
  const week = days.filter((d) => d.day >= from && d.day <= to);
  const fed = week.filter((d) => d.kcal != null), moods = week.filter((d) => d.mood != null);
  const by = (f: (a: number, b: number) => boolean) => moods.reduce<(typeof moods)[number] | null>((b, d) => (!b || f(d.mood!, b.mood!) ? d : b), null);
  const best = by((a, b) => a > b), worst = by((a, b) => a < b);
  return {
    from, to, rows,
    training: { sessions: mine.length, sets: working(sets.filter((s) => s.at >= t0 && s.at < t1)).length, usualSessions: ss.some((s) => s.startedAt < t0 - 21 * 86_400_000) ? before.reduce((a, b) => a + b, 0) / 4 : null, pct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null },
    weight: trend ? { kg: trend.nowKg, perWeek: trend.perDay * 7 } : null,
    food: { days: fed.length, onGoal: fed.filter((d) => Math.abs(d.kcal! - goals.kcal) <= 200).length, proteinHit: fed.filter((d) => (d.protein ?? 0) >= goals.p).length, goal: goals.kcal, protein: goals.p },
    pace: settings.energy?.mode === "burn" ? settings.energy.pace : null,
    best: best && worst && best.mood! - worst.mood! >= 1 ? { day: best.day, mood: best.mood! } : null,
    worst: best && worst && best.mood! - worst.mood! >= 1 ? { day: worst.day, mood: worst.mood! } : null,
  };
}

const fmt = (r: { dec: 0 | 1; unit: string }, v: number) => (r.unit === "kcal" ? Math.round(v).toLocaleString("en-GB") : v.toFixed(r.dec));
const dayName = (d: string) => dayLabel(noon(d)).slice(0, 3);
export const span = (from: string, to: string) => `${dayLabel(noon(from)).slice(4)}–${dayLabel(noon(to)).slice(4)}`;

/** The week as the app measured it, for the AI: numbers it must use, not invent. */
export function weekLines(f: WeekFacts): string[] {
  const rows = f.rows.map((r) => {
    const v = r.value == null ? "too few days" : `${fmt(r, r.value)}${r.unit.startsWith("/") ? r.unit : ` ${r.unit}`}`;
    const u = r.usual == null ? "no usual yet" : `usual ${fmt(r, r.usual)}`;
    const word = r.state === "hi" || r.state === "lo" ? `${r.state === "hi" ? "higher" : "lower"} than usual${r.better == null ? "" : r.better ? " — the better way" : " — the worse way"}` : r.state === "ok" ? "about usual" : "";
    return `- [${r.k}] ${r.name}: ${v} (${u})${word ? `, ${word}` : ""}; each day: ${r.days.map((x, i) => `${dayName(addDays(f.from, i))} ${x == null ? "–" : fmt(r, x)}`).join(", ")}`;
  });
  const t = f.training, w = f.weight, food = f.food;
  return [
    `## The week ${span(f.from, f.to)}, as the app measured it (each against your usual week; [key] = a measure a notice can be about)`,
    ...rows,
    `- Training: ${t.sessions} session${t.sessions === 1 ? "" : "s"}, ${t.sets} working sets${t.usualSessions != null ? ` (usual ${t.usualSessions.toFixed(1)} sessions a week)` : ""}${t.pct != null ? `, strength ${t.pct >= 0 ? "+" : ""}${t.pct.toFixed(1)} % against your trend` : ""}.`,
    w ? `- Weight trend: ${w.kg.toFixed(1)} kg, ${w.perWeek >= 0 ? "+" : ""}${w.perWeek.toFixed(2)} kg a week${f.pace != null ? ` (the calorie goal is set for −${f.pace} kg a week)` : ""}.` : "- Weight trend: not enough weigh-ins.",
    food.days ? `- Food: ${food.days} days logged; within ±200 of the ${food.goal.toLocaleString("en-GB")} kcal goal on ${food.onGoal}; protein at the ${food.protein} g goal on ${food.proteinHit}.` : "- Food: nothing logged.",
    ...(f.best && f.worst ? [`- Best mood ${dayName(f.best.day)} (${f.best.mood.toFixed(1)}), lowest ${dayName(f.worst.day)} (${f.worst.mood.toFixed(1)}).`] : []),
  ];
}
