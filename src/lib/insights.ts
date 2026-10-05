/**
 * Everything the Insights page shows, derived from entries. Pure: give it the state and a "now",
 * get back series and numbers. The page only draws.
 */

import type { Entry, EntryOf, Supplement, Workout } from "./types";
import type { Point } from "./series";
import type { Settings } from "./store";
import { caffeineAt, cleared, type Dose } from "./caffeine";
import { bedtimeOn } from "./caffeine-sleep";
import type { Check } from "./feelgraph";
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
  focus: Point[];
  stress: Point[];
  /** Calories per logged day, placed at noon. */
  kcalDay: Point[];
  /** Every check-in as given (feelings drawn as dots, joined only within hours: lib/feelgraph). */
  checks: Check[];
  /** Morning sleep ratings (1–10) at the time they were given. */
  sleep: Point[];
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
    caffeine.push([t, cleared(mg)]);
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
    focus: of(entries, "feel").filter((f) => f.focus != null).map((f) => [f.at, f.focus!]),
    stress: of(entries, "feel").filter((f) => f.stress != null).map((f) => [f.at, f.stress!]),
    checks: of(entries, "feel").map((f) => ({ at: f.at, energy: f.energy, mood: f.mood, focus: f.focus, stress: f.stress, note: f.note, doing: f.doing })),
    sleep: of(entries, "sleep").filter((x) => x.rating != null).map((x) => [x.at, x.rating!] as Point),
    kcalDay: (() => { const m = new Map<string, number>(); for (const f of of(entries, "food")) m.set(localDay(f.at), (m.get(localDay(f.at)) ?? 0) + f.macros.kcal); return [...m.entries()].sort().map(([d, k]) => [atMinute(d, 12 * 60), k] as Point); })(),
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
  /** Anything eaten or drunk was logged that day — so "no caffeine" means none, not unknown. */
  logged: boolean;
  /** At least one supplement was ticked or skipped — so an unticked one was really not taken. */
  stackAnswered: boolean;
  lateCaffeineMg: number;
  /** Food logged at or after 21:00. */
  lateEat: boolean;
  /** kg × reps summed over the day's sets. */
  volumeKg: number;
  weekend: boolean;
  /** The biggest single meal: food logged within 45 minutes counts as one meal. Null if no food. */
  bigMealKcal: number | null;
  /** The sleep rating given that morning (last night's), if any. */
  sleep: number | null;
};

/** Food entries within 45 minutes of each other are one meal; the largest meal's kcal. */
export function biggestMeal(foods: { at: number; macros: { kcal: number } }[]): number | null {
  if (!foods.length) return null;
  const sorted = [...foods].sort((a, b) => a.at - b.at);
  let best = 0, cur = 0, last = -Infinity;
  for (const f of sorted) { cur = f.at - last <= 45 * MIN ? cur + f.macros.kcal : f.macros.kcal; last = f.at; best = Math.max(best, cur); }
  return best;
}

/** Caffeine at or after this minute counts as "late". */
export const LATE_CAFFEINE_MIN = 14 * 60;

/** One row per day from `fromDay` to `toDay` inclusive. Days with no food logged get `kcal: null`. */
export function dailyFacts(entries: Entry[], workouts: Workout[], settings: Settings, fromDay: string, toDay: string): DayFacts[] {
  const doses = caffeineDoses(entries), drinks = alcoholDoses(entries);
  const byDay = new Map<string, Entry[]>();
  for (const e of entries) { const d = localDay(e.at); byDay.set(d, [...(byDay.get(d) ?? []), e]); }
  const trainedDays = new Set(workouts.map((w) => localDay(w.startedAt)));
  const sleepBy = new Map<string, number>();
  for (const e of of(entries, "sleep")) if (e.rating != null && !sleepBy.has(localDay(e.at))) sleepBy.set(localDay(e.at), e.rating);
  const out: DayFacts[] = [];
  for (let day = fromDay; day <= toDay; day = addDays(day, 1)) {
    const es = byDay.get(day) ?? [];
    const caf = of(es, "drink").filter((d) => d.caffeineMg > 0);
    const foods = of(es, "food");
    const feel = of(es, "feel");
    const avg = (k: "energy" | "mood" | "focus" | "stress") => { const v = feel.map((f) => f[k]).filter((x): x is number => x != null); return v.length ? mean(v) : null; };
    const bed = bedtimeOn(day, settings.bedMinute);
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
      logged: foods.length > 0 || of(es, "drink").length > 0,
      stackAnswered: of(es, "supp").length > 0,
      lateCaffeineMg: caf.filter((d) => minuteOfDay(d.at) >= LATE_CAFFEINE_MIN).reduce((a, d) => a + d.caffeineMg, 0),
      lateEat: foods.some((f) => minuteOfDay(f.at) >= 21 * 60),
      bigMealKcal: biggestMeal(foods),
      volumeKg: of(es, "set").reduce((a, x) => a + x.kg * x.reps, 0),
      weekend: [0, 6].includes(new Date(atMinute(day, 12 * 60)).getDay()),
      sleep: sleepBy.get(day) ?? null,
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
