/**
 * Everything the Insights page shows, derived from entries. Pure: give it the state and a "now",
 * get back series and numbers. The page only draws.
 */

import type { Entry, EntryOf, Supplement, Workout } from "./types";
import type { Point } from "./series";
import type { Settings } from "./store";
import { caffeineAt, type Dose } from "./caffeine";
import { alcoholCurve, type AlcoholDose } from "./alcohol";
import { atMinute, localDay, minuteOfDay, addDays, startOfDay, DAY, MIN } from "./time";
import { correlation, difference, mean, median, sd, type Range } from "./stats";

const of = <K extends Entry["kind"]>(entries: Entry[], k: K) => entries.filter((e): e is EntryOf<K> => e.kind === k);

export const caffeineDoses = (entries: Entry[]): Dose[] => of(entries, "drink").filter((d) => d.caffeineMg > 0).map((d) => ({ at: d.at, mg: d.caffeineMg }));
export const alcoholDoses = (entries: Entry[]): AlcoholDose[] => of(entries, "drink").filter((d) => d.alcoholG > 0).map((d) => ({ at: d.at, g: d.alcoholG }));

/* ------------------------------------------------------------------ master graph lanes */

export type Lanes = {
  from: number;
  to: number;
  caffeine: Point[];
  alcohol: Point[];
  meals: { at: number; kcal: number; name: string }[];
  workouts: { start: number; end: number; name: string }[];
  supps: { at: number; suppId: string; row: number }[];
  weight: Point[];
  energy: Point[];
  mood: Point[];
};

/** Continuous lanes on a 10-minute grid from the first entry (or 14 days back) to `now`. */
export function lanes(entries: Entry[], workouts: Workout[], supplements: Supplement[], settings: Settings, now: number): Lanes {
  const first = entries.length ? Math.min(entries[0].at, now - 14 * DAY) : now - 14 * DAY;
  const from = startOfDay(first), step = 10 * MIN;
  const doses = caffeineDoses(entries);
  const caffeine: Point[] = [];
  // Walk forward keeping only doses that still matter (after 48 h a dose is < 0.2%).
  let lo = 0;
  for (let t = from; t <= now; t += step) {
    while (lo < doses.length && doses[lo].at < t - 48 * 60 * MIN) lo++;
    let mg = 0;
    for (let i = lo; i < doses.length && doses[i].at <= t; i++) mg += doses[i].mg * Math.pow(0.5, (t - doses[i].at) / MIN / settings.halfLifeMin);
    caffeine.push([t, mg]);
  }
  const alcohol = alcoholCurve(alcoholDoses(entries), from, now, { bodyKg: settings.bodyKg, stepMin: 10 });
  const rows = new Map(supplements.map((s, i) => [s.id, i]));
  const setsByWorkout = new Map<string, number[]>();
  for (const s of of(entries, "set")) setsByWorkout.set(s.workoutId, [...(setsByWorkout.get(s.workoutId) ?? []), s.at]);
  return {
    from, to: now, caffeine, alcohol,
    meals: of(entries, "food").map((f) => ({ at: f.at, kcal: f.macros.kcal, name: f.name })),
    workouts: workouts.map((w) => {
      const times = setsByWorkout.get(w.id) ?? [];
      return { start: w.startedAt, end: w.endedAt ?? (times.length ? Math.max(...times) + 3 * MIN : Math.min(now, w.startedAt + 60 * MIN)), name: w.template };
    }),
    supps: of(entries, "supp").filter((s) => s.status === "taken").map((s) => ({ at: s.at, suppId: s.suppId, row: rows.get(s.suppId) ?? supplements.length })),
    weight: of(entries, "weight").map((w) => [w.at, w.kg]),
    energy: of(entries, "feel").filter((f) => f.energy != null).map((f) => [f.at, f.energy!]),
    mood: of(entries, "feel").filter((f) => f.mood != null).map((f) => [f.at, f.mood!]),
  };
}

/* ------------------------------------------------------------------ per-day facts */

export type DayFacts = {
  day: string;
  caffeineMg: number;
  lastCaffeineMin: number | null;
  caffeineAtBed: number;
  alcoholG: number;
  alcoholAtBed: number;
  trained: boolean;
  kcal: number | null;
  proteinG: number | null;
  energy: number | null;
  mood: number | null;
  focus: number | null;
  stress: number | null;
  taken: Set<string>;
};

/** One row per day from `fromDay` to `toDay` inclusive. Days with no food logged get `kcal: null`. */
export function dailyFacts(entries: Entry[], workouts: Workout[], settings: Settings, fromDay: string, toDay: string): DayFacts[] {
  const doses = caffeineDoses(entries), drinks = alcoholDoses(entries);
  const byDay = new Map<string, Entry[]>();
  for (const e of entries) { const d = localDay(e.at); byDay.set(d, [...(byDay.get(d) ?? []), e]); }
  const trainedDays = new Set(workouts.map((w) => localDay(w.startedAt)));
  const out: DayFacts[] = [];
  for (let day = fromDay; day <= toDay; day = addDays(day, 1)) {
    const es = byDay.get(day) ?? [];
    const caf = of(es, "drink").filter((d) => d.caffeineMg > 0);
    const foods = of(es, "food");
    const feel = of(es, "feel");
    const avg = (k: "energy" | "mood" | "focus" | "stress") => { const v = feel.map((f) => f[k]).filter((x): x is number => x != null); return v.length ? mean(v) : null; };
    const bed = atMinute(day, settings.bedMinute);
    const alcBed = (() => { const pts = alcoholCurve(drinks.filter((d) => d.at > bed - 24 * 60 * MIN && d.at <= bed), bed - 12 * 60 * MIN, bed, { bodyKg: settings.bodyKg }); return pts.length ? pts[pts.length - 1][1] : 0; })();
    out.push({
      day,
      caffeineMg: caf.reduce((a, d) => a + d.caffeineMg, 0),
      lastCaffeineMin: caf.length ? minuteOfDay(Math.max(...caf.map((d) => d.at))) : null,
      caffeineAtBed: caffeineAt(doses, bed, settings.halfLifeMin),
      alcoholG: of(es, "drink").reduce((a, d) => a + d.alcoholG, 0),
      alcoholAtBed: alcBed,
      trained: trainedDays.has(day),
      kcal: foods.length ? foods.reduce((a, f) => a + f.macros.kcal, 0) : null,
      proteinG: foods.length ? foods.reduce((a, f) => a + f.macros.p, 0) : null,
      energy: avg("energy"), mood: avg("mood"), focus: avg("focus"), stress: avg("stress"),
      taken: new Set(of(es, "supp").filter((s) => s.status === "taken").map((s) => s.suppId)),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ supplements */

export type Adherence = { suppId: string; taken: number; due: number; usualMin: number | null; spreadMin: number | null };

/** How often each active supplement was taken over the days given, and at what time. */
export function adherence(entries: Entry[], supplements: Supplement[], days: string[]): Adherence[] {
  const set = new Set(days);
  const taken = of(entries, "supp").filter((s) => s.status === "taken" && set.has(localDay(s.at)));
  return supplements.filter((s) => s.active).map((s) => {
    const mine = taken.filter((t) => t.suppId === s.id);
    const mins = mine.map((t) => minuteOfDay(t.at));
    return { suppId: s.id, taken: new Set(mine.map((t) => localDay(t.at))).size, due: days.length, usualMin: mins.length ? Math.round(median(mins)) : null, spreadMin: mins.length > 2 ? Math.round(sd(mins)) : null };
  });
}

/* ------------------------------------------------------------------ what moves what */

export type Pair = { id: string; cause: string; effect: string; unitX: string; unitY: string; xs: number[]; ys: number[]; r: Range | null; need: number };

const MIN_PAIRS = 10;

/** Candidate cause → next-day effect pairs, each with its correlation (or how much data it still needs). */
export function pairs(facts: DayFacts[]): Pair[] {
  const next = (i: number) => facts[i + 1];
  const build = (id: string, cause: string, effect: string, unitX: string, unitY: string, x: (d: DayFacts) => number | null, y: (d: DayFacts) => number | null): Pair => {
    const xs: number[] = [], ys: number[] = [];
    facts.forEach((d, i) => { const n = next(i); if (!n) return; const a = x(d), b = y(n); if (a != null && b != null) { xs.push(a); ys.push(b); } });
    return { id, cause, effect, unitX, unitY, xs, ys, r: xs.length >= MIN_PAIRS ? correlation(xs, ys) : null, need: Math.max(0, MIN_PAIRS - xs.length) };
  };
  return [
    build("caf-energy", "Caffeine left at bedtime", "Energy next day", "mg", "/10", (d) => d.caffeineAtBed, (n) => n.energy),
    build("caf-focus", "Caffeine left at bedtime", "Focus next day", "mg", "/10", (d) => d.caffeineAtBed, (n) => n.focus),
    build("alc-energy", "Alcohol left at bedtime", "Energy next day", "g", "/10", (d) => d.alcoholAtBed, (n) => n.energy),
    build("alc-mood", "Alcohol that evening", "Mood next day", "g", "/10", (d) => d.alcoholG, (n) => n.mood),
    build("kcal-energy", "Calories eaten", "Energy next day", "kcal", "/10", (d) => d.kcal, (n) => n.energy),
    build("train-mood", "Trained that day", "Mood next day", "", "/10", (d) => (d.trained ? 1 : 0), (n) => n.mood),
  ];
}

export type SuppEffect = { suppId: string; metric: "energy" | "mood" | "focus"; on: number; off: number; diff: Range | null; need: number };

/**
 * On vs off for each supplement: next-day energy/mood/focus on days after you took it vs days
 * after you didn't. Only meaningful with enough "off" days — which is why the page suggests a
 * planned off block rather than reading too much into a 93% adherence streak.
 */
export function suppEffects(facts: DayFacts[], supplements: Supplement[]): SuppEffect[] {
  const out: SuppEffect[] = [];
  for (const s of supplements.filter((x) => x.active)) {
    for (const metric of ["energy", "mood", "focus"] as const) {
      const on: number[] = [], off: number[] = [];
      facts.forEach((d, i) => { const n = facts[i + 1]; const v = n?.[metric]; if (v == null) return; (d.taken.has(s.id) ? on : off).push(v); });
      const need = Math.max(0, 5 - Math.min(on.length, off.length));
      out.push({ suppId: s.id, metric, on: on.length, off: off.length, diff: need ? null : difference(on, off), need });
    }
  }
  return out;
}
