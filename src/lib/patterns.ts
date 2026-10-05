/**
 * Insights → "Before your best and worst days" (owner, 5 Oct: "smarter engine"). Instead of testing
 * one cause at a time, start from the outcome: take your lowest-mood days (bottom fifth) and your
 * best (top fifth), and compare what came before them — the night's sleep rating, caffeine left at
 * bedtime, drinks, training, food — with every other day. Each difference carries its 95% range,
 * so "your worst days follow nights you rated 1.6 lower" only reads as clear when it is.
 * Plus the words that keep showing up in your notes on those days, and the mood trend.
 *
 * "Goes with", never "causes" (CLAUDE.md). Feelings on the same day aren't used as "before".
 */

import type { Entry } from "./types";
import type { GlanceDay } from "./glance";
import { difference, mean, quantile, sd, type Range } from "./stats";
import { localDay } from "./time";

export type Feature = { k: string; name: string; unit: string; get: (d: GlanceDay, prev: GlanceDay | undefined) => number | null; dec: 0 | 1; share?: boolean };

export const FEATURES: Feature[] = [
  { k: "sleep", name: "Sleep rating that morning", unit: "/10", dec: 1, get: (d) => d.sleep },
  { k: "cafBed", name: "Caffeine at bedtime the night before", unit: "mg", dec: 0, get: (_, p) => p?.cafBed ?? null },
  { k: "drinks", name: "Drinks the night before", unit: "% of days", dec: 0, share: true, get: (_, p) => (p?.drinks == null ? null : p.drinks > 0 ? 1 : 0) },
  { k: "trainedBefore", name: "Trained the day before", unit: "% of days", dec: 0, share: true, get: (_, p) => (p && (p.checkins || p.kcal != null) ? (p.trained ? 1 : 0) : null) },
  { k: "trained", name: "Trained that day", unit: "% of days", dec: 0, share: true, get: (d) => (d.checkins || d.kcal != null ? (d.trained ? 1 : 0) : null) },
  { k: "kcalBefore", name: "Calories the day before", unit: "kcal", dec: 0, get: (_, p) => p?.kcal ?? null },
  { k: "lateCaf", name: "Caffeine after 14:00 the day before", unit: "% of days", dec: 0, share: true, get: (_, p) => (p?.cafBed == null ? null : p.lateCaffeine ? 1 : 0) },
];

export const PATTERN_MIN = { rated: 20, perSide: 4 };

export type Row = { f: Feature; group: number; rest: number; diff: Range | null; nGroup: number; nRest: number; /** |difference| in the feature's own spreads, for ranking. */ size: number };
export type Side = { days: string[]; cut: number; mood: number; rows: Row[]; words: { word: string; days: number; rate: number }[] };
export type Patterns = { worst: Side; best: Side; rated: number } | { need: number };

const STOP = new Set("the and for with was that this but not from have had just very bit too got get out all its are you your about after again then than into over some more much really day today work".split(" "));
const words = (s: string) => [...new Set(s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[a-z]{3,}/g) ?? [])].filter((w) => !STOP.has(w));

/** `days` oldest → newest (consecutive). `entries` give the notes. */
export function patterns(days: GlanceDay[], entries: Entry[]): Patterns {
  const rated = days.map((d, i) => ({ d, prev: days[i - 1] })).filter((x) => x.d.mood != null);
  if (rated.length < PATTERN_MIN.rated) return { need: PATTERN_MIN.rated - rated.length };
  const moods = rated.map((x) => x.d.mood!), lo = quantile(moods, 0.2), hi = quantile(moods, 0.8);
  const notes = new Map<string, string[]>();
  for (const e of entries) if (e.kind === "feel" && e.note?.trim()) notes.set(localDay(e.at), [...(notes.get(localDay(e.at)) ?? []), e.note]);
  const dayWords = new Map([...notes].map(([d, ns]) => [d, new Set(ns.flatMap(words))]));
  const side = (inGroup: (m: number) => boolean): Side => {
    const g = rated.filter((x) => inGroup(x.d.mood!)), rest = rated.filter((x) => !inGroup(x.d.mood!));
    const rows: Row[] = FEATURES.map((f) => {
      const a = g.map((x) => f.get(x.d, x.prev)).filter((v): v is number => v != null), b = rest.map((x) => f.get(x.d, x.prev)).filter((v): v is number => v != null);
      const enough = a.length >= PATTERN_MIN.perSide && b.length >= PATTERN_MIN.perSide;
      const diff = enough ? difference(a, b) : null, spread = sd([...a, ...b]) || 1;
      return { f, group: a.length ? mean(a) : NaN, rest: b.length ? mean(b) : NaN, diff, nGroup: a.length, nRest: b.length, size: diff ? Math.abs(diff.value) / spread : 0 };
    }).sort((x, y) => Number(!!y.diff?.clear) - Number(!!x.diff?.clear) || y.size - x.size);
    // Words on 2+ of these days, at least twice as common here as on the other days.
    const gDays = g.map((x) => x.d.day), rDays = rest.map((x) => x.d.day), count = (ds: string[], w: string) => ds.filter((d) => dayWords.get(d)?.has(w)).length;
    const all = new Set(gDays.flatMap((d) => [...(dayWords.get(d) ?? [])]));
    const ws = [...all].map((w) => ({ word: w, days: count(gDays, w), rate: count(gDays, w) / gDays.length, other: count(rDays, w) / Math.max(1, rDays.length) }))
      .filter((x) => x.days >= 2 && x.rate >= 2 * x.other).sort((a, b) => b.days - a.days || a.word.localeCompare(b.word)).slice(0, 6).map(({ word, days: n, rate }) => ({ word, days: n, rate }));
    return { days: gDays, cut: 0, mood: mean(g.map((x) => x.d.mood!)), rows, words: ws };
  };
  const worst = { ...side((m) => m <= lo), cut: lo }, best = { ...side((m) => m >= hi), cut: hi };
  if (worst.days.length < PATTERN_MIN.perSide || best.days.length < PATTERN_MIN.perSide) return { need: 1 };
  return { worst, best, rated: rated.length };
}

/** Least-squares trend of a daily measure over the last `n` days, per week, with its 95% range. */
export function weeklyTrend(days: GlanceDay[], k: "mood" | "energy" | "stress", n = 28): { perWeek: number; lo: number; hi: number; n: number; clear: boolean } | null {
  const pts = days.slice(-n).map((d, i) => [i, d[k]] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 10) return null;
  const mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1]));
  let sxy = 0, sxx = 0; for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
  const b = sxy / sxx, a = my - b * mx, rss = pts.reduce((s, [x, y]) => s + (y - a - b * x) ** 2, 0);
  const se = Math.sqrt(rss / (pts.length - 2) / sxx), t = 2 + 4 / pts.length; // ~t(0.975) for small n
  return { perWeek: b * 7, lo: (b - t * se) * 7, hi: (b + t * se) * 7, n: pts.length, clear: b - t * se > 0 || b + t * se < 0 };
}

/** Each day's 7-day rolling average (needs 3 values in the window). */
export const rolling7 = (vals: (number | null)[]) => vals.map((_, i) => { const xs = vals.slice(Math.max(0, i - 6), i + 1).filter((v): v is number => v != null); return xs.length >= 3 ? mean(xs) : null; });
