/**
 * Insights → Connections (approved prototype v2, phase 4). Every "days with vs without" comparison
 * in one place, drawn as one forest plot, so "what goes with better days" is one chart instead of
 * three panels (replaces What moves what and Does it do anything). Each row: the difference in
 * points, its 95% range, and how many days on each side. Right of zero is always better for you
 * (for stress, lower is better, so it's flipped). Plus the explorer: any two measures, with r.
 *
 * Wording rule (CLAUDE.md): "goes with", never "causes". A row is "clear" only when the 95% range
 * stays on one side of zero, and the page says how many could look clear by chance.
 */

import type { Supplement } from "./types";
import type { GlanceDay } from "./glance";
import { correlation, difference, type Range } from "./stats";

export const MIN_EACH = 5;
export type Outcome = "mood" | "energy" | "stress" | "sleep";
export type Comparison = {
  id: string; group: "Mood" | "Energy" | "Stress" | "Sleep";
  what: string; outcome: string;
  /** +1: higher outcome is better; −1: lower is (stress). */
  dir: 1 | -1;
  /** Raw difference with − without, in points; null until both sides have MIN_EACH days. */
  diff: Range | null;
  nWith: number; nWithout: number;
  /** Days still needed on the smaller side. */
  need: number;
};

type Pred = (d: GlanceDay, prev: GlanceDay | undefined) => boolean | null;
type Out = (d: GlanceDay, next: GlanceDay | undefined) => number | null;

const same = (k: Outcome): Out => (d) => (k === "sleep" ? null : d[k]);
const nextDay = (k: Outcome): Out => (_, n) => (n ? n[k] : null);
/** The sleep rating given the next morning = the night after this day. */
const thatNight: Out = (_, n) => n?.sleep ?? null;

export function comparisons(days: GlanceDay[], supplements: Supplement[] = []): Comparison[] {
  const row = (id: string, group: Comparison["group"], what: string, outcome: string, dir: 1 | -1, pred: Pred, out: Out): Comparison => {
    const a: number[] = [], b: number[] = [];
    days.forEach((d, i) => { const p = pred(d, days[i - 1]); if (p == null) return; const v = out(d, days[i + 1]); if (v == null) return; (p ? a : b).push(v); });
    const need = Math.max(0, MIN_EACH - Math.min(a.length, b.length));
    return { id, group, what, outcome, dir, diff: need ? null : difference(a, b), nWith: a.length, nWithout: b.length, need };
  };
  const drinksBefore: Pred = (_, p) => (p?.drinks == null ? null : p.drinks > 0);
  const sleptWell: Pred = (d) => (d.sleep == null ? null : d.sleep >= 7);
  const weekend: Pred = (d) => { const w = new Date(`${d.day}T12:00`).getDay(); return w === 0 || w === 6; };
  const lateCafKnown: Pred = (d) => (d.cafBed == null ? null : d.lateCaffeine);
  const drinksTonight: Pred = (d) => (d.drinks == null ? null : d.drinks > 0);
  const rows: Comparison[] = [
    row("train-mood", "Mood", "Trained that day", "mood", 1, (d) => d.trained, same("mood")),
    row("weekend-mood", "Mood", "Weekend", "mood", 1, weekend, same("mood")),
    row("slept-mood", "Mood", "Slept well (rated 7+)", "mood that day", 1, sleptWell, same("mood")),
    row("drinks-mood", "Mood", "Drinks the night before", "mood", 1, drinksBefore, same("mood")),
    row("slept-energy", "Energy", "Slept well (rated 7+)", "energy that day", 1, sleptWell, same("energy")),
    row("drinks-energy", "Energy", "Drinks the night before", "energy", 1, drinksBefore, same("energy")),
    row("caf-energy", "Energy", "Caffeine after 14:00", "energy next day", 1, lateCafKnown, nextDay("energy")),
    row("train-energy", "Energy", "Trained", "energy next day", 1, (d) => d.trained, nextDay("energy")),
    row("train-stress", "Stress", "Trained that day", "stress", -1, (d) => d.trained, same("stress")),
    row("weekend-stress", "Stress", "Weekend", "stress", -1, weekend, same("stress")),
    row("caf-sleep", "Sleep", "Caffeine after 14:00", "that night's sleep rating", 1, lateCafKnown, thatNight),
    row("drinks-sleep", "Sleep", "Drinks that evening", "that night's sleep rating", 1, drinksTonight, thatNight),
    row("train-sleep", "Sleep", "Trained that day", "that night's sleep rating", 1, (d) => d.trained, thatNight),
  ];
  // Each supplement: taken vs not, on days the stack was answered. Next-day mood and energy, and
  // that night's sleep for an evening one.
  for (const s of supplements.filter((x) => x.active)) {
    const took: Pred = (d) => (d.stackAnswered ? (d.taken ?? []).includes(s.id) : null);
    rows.push(row(`supp-${s.id}-mood`, "Mood", `${s.name} taken`, "mood next day", 1, took, nextDay("mood")));
    rows.push(row(`supp-${s.id}-energy`, "Energy", `${s.name} taken`, "energy next day", 1, took, nextDay("energy")));
    if (s.slot === "evening") rows.push(row(`supp-${s.id}-sleep`, "Sleep", `${s.name} taken`, "that night's sleep rating", 1, took, thatNight));
  }
  // Grouped for the chart (stable: the order above within a group).
  const order = ["Mood", "Energy", "Stress", "Sleep"];
  return rows.map((r, i) => [r, i] as const).sort((a, b) => order.indexOf(a[0].group) - order.indexOf(b[0].group) || a[1] - b[1]).map(([r]) => r);
}

/** A difference shown so right = better: [value, lo, hi] times dir. */
export const better = (c: Comparison): { d: number; lo: number; hi: number } | null => {
  if (!c.diff) return null;
  const a = c.diff.lo * c.dir, b = c.diff.hi * c.dir;
  return { d: c.diff.value * c.dir, lo: Math.min(a, b), hi: Math.max(a, b) };
};

/* ------------------------------------------------------------------ explorer: any two */

export type Var = { k: string; name: string; get: (d: GlanceDay) => number | null };
export const FACTORS: Var[] = [
  { k: "cafBed", name: "Caffeine at bedtime (mg)", get: (d) => d.cafBed },
  { k: "drinks", name: "Drinks that day", get: (d) => d.drinks },
  { k: "sleep", name: "Sleep rating that morning", get: (d) => d.sleep },
  { k: "kcal", name: "Calories", get: (d) => d.kcal },
  { k: "protein", name: "Protein (g)", get: (d) => d.protein },
  { k: "trained", name: "Trained (0/1)", get: (d) => (d.checkins || d.kcal != null ? (d.trained ? 1 : 0) : null) },
  { k: "stress", name: "Stress (day average)", get: (d) => d.stress },
  { k: "energy", name: "Energy (day average)", get: (d) => d.energy },
];
export const OUTCOMES: Var[] = [
  { k: "mood", name: "Mood (day average)", get: (d) => d.mood },
  { k: "energy", name: "Energy (day average)", get: (d) => d.energy },
  { k: "focus", name: "Focus (day average)", get: (d) => d.focus },
  { k: "stress", name: "Stress (day average)", get: (d) => d.stress },
  { k: "sleep", name: "Sleep rating", get: (d) => d.sleep },
];

export type Pair = { x: Var; y: Var; lag: 0 | 1; pts: [number, number, string][]; r: Range | null };

/**
 * Factor on day i against outcome on day i+lag. For sleep as the outcome the lag is shifted by one:
 * the rating given the next morning is that day's night.
 */
export function pair(days: GlanceDay[], x: Var, y: Var, lag: 0 | 1): Pair {
  const shift = lag + (y.k === "sleep" ? 1 : 0), pts: [number, number, string][] = [];
  for (let i = 0; i + shift < days.length; i++) { const a = x.get(days[i]), b = y.get(days[i + shift]); if (a != null && b != null) pts.push([a, b, days[i].day]); }
  return { x, y, lag, pts, r: pts.length >= 10 ? correlation(pts.map((p) => p[0]), pts.map((p) => p[1])) : null };
}

/**
 * Not findings: the same thing measured twice (stress against stress), or two feelings from the same
 * check-in (energy and focus are rated together, so they always move together that day).
 */
const FEELINGS = new Set(["mood", "energy", "focus", "stress"]);
const sameThing = (x: Var, y: Var, lag: 0 | 1) => x.k === y.k || (lag === 0 && FEELINGS.has(x.k) && FEELINGS.has(y.k));

/** Every factor × outcome × lag whose range stays clear of zero, strongest first. */
export function strongestPairs(days: GlanceDay[]): Pair[] {
  return FACTORS.flatMap((x) => OUTCOMES.flatMap((y) => ([0, 1] as const).map((lag) => (sameThing(x, y, lag) ? null : pair(days, x, y, lag)))))
    .filter((p): p is Pair => !!p?.r?.clear)
    .sort((a, b) => Math.abs(b.r!.value) - Math.abs(a.r!.value));
}
