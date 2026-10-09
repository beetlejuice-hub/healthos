/**
 * Insights → Sleep (PLAN 54, the owner's picks on the canvas, 8 Oct): the band's nights turned into numbers you can
 * read — each night's stages and heart rate asleep, your usual range, how regular your days are, what was different
 * about one night, and what goes with better or worse nights, with how sure. Pure; drawn by components/Sleep.tsx.
 *
 * Honest by construction (each has a test): a night's lowest heart rate is a 5-minute average, not one noisy minute;
 * regularity only compares days that both have a night; "what goes with" shuffles which nights had the thing and asks
 * how often chance alone does as well, with a stricter bar for "clear" because the grid tries many pairs at once.
 */

import type { HrMinute, SleepSession } from "./band";
import { addDays, atMinute, localDay, minuteOfDay, startOfDay, MIN, HOUR } from "./time";
import { usualSteps } from "./steps";

export type StageType = "awake" | "rem" | "light" | "deep";
export type Night = {
  id: string;
  /** The morning you woke (local day) — daily HRV and resting heart rate are filed under it. */
  day: string;
  /** The evening it started from (local day): naps, drinks and workouts that day go with this night. */
  eve: string;
  bed: number; up: number; onset: number; wake: number;
  asleep: number; deep: number | null; rem: number | null; light: number | null;
  /** Minutes awake between falling asleep and waking for good; how many times. */
  awake: number; wakes: number;
  /** Minutes from getting into bed to falling asleep. */
  latency: number;
  stages: { type: StageType; start: number; end: number }[];
  low: number | null; lowAt: number | null;
  hrv: number | null; rhr: number | null;
  nap: { start: number; end: number; min: number } | null;
};

const stageOf = (t: string): StageType => (t === "awake" || t === "wake" ? "awake" : t === "rem" ? "rem" : t === "deep" ? "deep" : "light");
const isNap = (s: SleepSession) => s.nap || (s.end - s.start < 3 * HOUR && minuteOfDay(s.start) >= 9 * 60 && minuteOfDay(s.start) < 19 * 60);
/** The evening a night belongs to: bed at 00:30 is still the evening before. */
const eveOf = (t: number) => localDay(t - 8 * HOUR);

/** The lowest 5-minute average of heart rate between two times, and when (the middle of that window). */
export function lowestHr(hr: HrMinute[], from: number, to: number): { low: number; at: number } | null {
  const lo = firstAt(hr, from);
  let best: { low: number; at: number } | null = null, a = lo, sum = 0;
  for (let b = lo; b < hr.length && hr[b][0] <= to; b++) {
    sum += hr[b][1];
    while (hr[b][0] - hr[a][0] >= 5 * MIN) { sum -= hr[a][1]; a++; }
    const n = b - a + 1;
    // A window counts once it spans most of 5 minutes (or a sparse band's single reading).
    if (n >= 3 || (n >= 1 && b > lo && hr[b][0] - hr[b - 1][0] >= 5 * MIN)) {
      const m = sum / n; if (!best || m < best.low) best = { low: m, at: (hr[a][0] + hr[b][0]) / 2 };
    }
  }
  return best;
}

/** One Night per morning (the longest main sleep), with the afternoon's nap and that night's heart rate. */
export function nights(sessions: SleepSession[], hr: HrMinute[], rhr: Record<string, number>, hrv: Record<string, number>): Night[] {
  const naps = new Map<string, SleepSession>();
  const mains = new Map<string, SleepSession>();
  for (const s of sessions) {
    if (isNap(s)) { const d = localDay(s.start), p = naps.get(d); if (!p || s.end - s.start > p.end - p.start) naps.set(d, s); continue; }
    const d = localDay(s.end), p = mains.get(d);
    if (!p || s.end - s.start > p.end - p.start) mains.set(d, s);
  }
  const out: Night[] = [];
  for (const [day, s] of mains) {
    const stages = s.stages.map((x) => ({ type: stageOf(x.type), start: x.start, end: x.end })).sort((a, b) => a.start - b.start);
    const asleepSt = stages.filter((x) => x.type !== "awake");
    const onset = asleepSt[0]?.start ?? s.start + (s.toFallAsleepMin ?? 0) * MIN;
    const wake = asleepSt.at(-1)?.end ?? s.end;
    const sum = (t: StageType) => (stages.length ? stages.filter((x) => x.type === t).reduce((m, x) => m + (x.end - x.start) / MIN, 0) : null);
    const inNight = stages.filter((x) => x.type === "awake" && x.start >= onset && x.end <= wake);
    const awake = stages.length ? inNight.reduce((m, x) => m + (x.end - x.start) / MIN, 0) : (s.awakeMin ?? 0);
    const asleep = s.asleepMin ?? (stages.length ? asleepSt.reduce((m, x) => m + (x.end - x.start) / MIN, 0) : (wake - onset) / MIN - awake);
    const lo = lowestHr(hr, onset, wake), eve = eveOf(s.start), nap = naps.get(eve);
    out.push({
      id: s.id, day, eve, bed: s.start, up: s.end, onset, wake, asleep,
      deep: s.stageMin.deep ?? sum("deep"), rem: s.stageMin.rem ?? sum("rem"), light: s.stageMin.light ?? sum("light"),
      awake, wakes: inNight.length, latency: Math.max(0, (onset - s.start) / MIN), stages,
      low: lo?.low ?? null, lowAt: lo?.at ?? null, hrv: hrv[day] ?? null, rhr: rhr[day] ?? null,
      nap: nap ? { start: nap.start, end: nap.end, min: nap.asleepMin ?? (nap.end - nap.start) / MIN } : null,
    });
  }
  return out.sort((a, b) => a.bed - b.bed);
}

/**
 * Hours on the evening's clock: 23:30 → 23.5, 07:00 next morning → 31, so nights line up on one clock. By the local
 * clock, not elapsed time: on the night the clocks go back, 07:00 is still 31, not 32.
 */
export function clockH(t: number, eve: string): number {
  const d = new Date(t), days = Math.round((startOfDay(t) - atMinute(eve, 0)) / (24 * HOUR));
  return days * 24 + d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 + d.getMilliseconds() / HOUR;
}

export type Range = { lo: number; mid: number; hi: number; n: number };
const quant = (s: number[], p: number) => s[Math.round((s.length - 1) * p)];
/** The middle half of a list (quartiles) and its middle. Null under 5 values. */
export function usual(vals: (number | null | undefined)[]): Range | null {
  const s = vals.filter((v): v is number => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  return s.length >= 5 ? { lo: quant(s, 0.25), mid: quant(s, 0.5), hi: quant(s, 0.75), n: s.length } : null;
}

/**
 * Sleep Regularity Index: how often you're in the same state — asleep or awake — at the same clock time on one day
 * and the next, in 5-minute steps from noon to noon, naps included; scaled so identical days are 100 and unrelated
 * ones about 0 (most adults 60–90). Only pairs of days that both have a night count. Null under 5 pairs.
 */
export function regularity(ns: Night[]): { score: number; pairs: number } | null {
  const byEve = new Map(ns.map((n) => [n.eve, n]));
  const state = (n: Night) => {
    const noon = atMinute(n.eve, 12 * 60), s = new Uint8Array(288);
    const mark = (a: number, b: number) => { for (let i = Math.max(0, Math.ceil((a - noon) / (5 * MIN))); i < Math.min(288, Math.ceil((b - noon) / (5 * MIN))); i++) s[i] = 1; };
    if (n.stages.length) n.stages.forEach((x) => { if (x.type !== "awake") mark(x.start, x.end); }); else mark(n.onset, n.wake);
    if (n.nap) mark(n.nap.start, n.nap.end);
    return s;
  };
  let same = 0, tot = 0, pairs = 0;
  for (const n of ns) {
    const next = byEve.get(addDays(n.eve, 1)); if (!next) continue;
    const a = state(n), b = state(next); pairs++;
    for (let i = 0; i < 288; i++) { tot++; if (a[i] === b[i]) same++; }
  }
  return pairs >= 5 ? { score: (200 * same) / tot - 100, pairs } : null;
}

/** Friday and Saturday nights against the rest: how much later the middle of your sleep falls, in minutes. Null if either side has under 2. */
export function weekendShift(ns: Night[]): number | null {
  const mid = (n: Night) => clockH((n.onset + n.wake) / 2, n.eve) * 60;
  const wk = ns.filter((n) => [5, 6].includes(new Date(atMinute(n.eve, 720)).getDay())), wd = ns.filter((n) => !wk.includes(n));
  if (wk.length < 2 || wd.length < 2) return null;
  const m = (a: Night[]) => a.reduce((s, n) => s + mid(n), 0) / a.length;
  return m(wk) - m(wd);
}

/** Heart rate asleep on other nights at each 10 minutes of the clock (21:00–11:00): the middle half, for a band behind one night. */
export function usualNightHr(ns: Night[], hr: HrMinute[], except?: string): { h: number; lo: number; mid: number; hi: number }[] {
  const buckets = new Map<number, { v: number[]; nights: Set<string> }>();
  for (const n of ns) {
    if (n.id === except) continue;
    for (let j = firstAt(hr, n.onset); j < hr.length && hr[j][0] <= n.wake; j++) {
      const b = Math.round(clockH(hr[j][0], n.eve) * 6), x = buckets.get(b) ?? buckets.set(b, { v: [], nights: new Set() }).get(b)!;
      x.v.push(hr[j][1]); x.nights.add(n.id);
    }
  }
  // A ten-minute slot counts once at least 5 other nights were asleep in it.
  return [...buckets.keys()].sort((a, b) => a - b).filter((b) => b >= 21 * 6 && b <= 35 * 6 && buckets.get(b)!.nights.size >= 5).map((b) => {
    const v = buckets.get(b)!.v.sort((x, y) => x - y);
    return { h: b / 6, lo: quant(v, 0.25), mid: quant(v, 0.5), hi: quant(v, 0.75) };
  });
}

/** Index of the first minute at or after t (binary search; minutes are in time order). */
export function firstAt(hr: HrMinute[], t: number): number {
  let a = 0, b = hr.length;
  while (a < b) { const m = (a + b) >> 1; if (hr[m][0] < t) a = m + 1; else b = m; }
  return a;
}

/** What each night's evening held, from what you logged. */
export type Evening = { drinks: number[]; caffeineAtBed: number; trained: boolean; ateLate: boolean; rating: number | null;
  /** The day's steps when the band was worn (lib/steps), and whether that's above the middle of the nights given (PLAN 66). */
  steps?: number | null; moreSteps?: boolean | null };

/** `known`: false leaves the night out of that row — a day the band was off has no steps, it isn't a day without. */
export type Factor = { id: string; name: string; has: (n: Night, e: Evening) => boolean; known?: (n: Night, e: Evening) => boolean };
export type Outcome = { id: string; name: string; unit: "min" | "bpm" | "ms" | "/10" | "clock"; /** +1: more is toward longer, deeper, calmer sleep. */ better: 1 | -1; of: (n: Night, e: Evening) => number | null };
export const FACTORS: Factor[] = [
  { id: "drinks", name: "Drinks that evening", has: (_, e) => e.drinks.length > 0 },
  { id: "caf", name: "Caffeine at bed ≥ 30 mg", has: (_, e) => e.caffeineAtBed >= 30 },
  { id: "trained", name: "Trained that day", has: (_, e) => e.trained },
  { id: "late", name: "Ate after 21:00", has: (_, e) => e.ateLate },
  { id: "nap", name: "Napped that day", has: (n) => !!n.nap },
  { id: "latebed", name: "In bed after 00:15", has: (n) => clockH(n.bed, n.eve) >= 24.25 },
  { id: "steps", name: "More steps than usual that day", has: (_, e) => e.moreSteps === true, known: (_, e) => e.moreSteps != null },
];
export const OUTCOMES: Outcome[] = [
  { id: "asleep", name: "Asleep", unit: "min", better: 1, of: (n) => n.asleep },
  { id: "deep", name: "Deep", unit: "min", better: 1, of: (n) => n.deep },
  { id: "rem", name: "REM", unit: "min", better: 1, of: (n) => n.rem },
  { id: "awake", name: "Awake", unit: "min", better: -1, of: (n) => n.awake },
  { id: "low", name: "Low HR", unit: "bpm", better: -1, of: (n) => n.low },
  { id: "lowAt", name: "Low at", unit: "clock", better: -1, of: (n) => (n.lowAt == null ? null : clockH(n.lowAt, n.eve) * 60) },
  { id: "hrv", name: "HRV", unit: "ms", better: 1, of: (n) => n.hrv },
  { id: "rating", name: "Rating", unit: "/10", better: 1, of: (_, e) => e.rating },
];

export type Sure = "clear" | "likely" | "not clear" | "too few";
export type Cell = { factor: string; outcome: string; nWith: number; nWithout: number; diff: number | null; p: number | null; sure: Sure; toward: "better" | "worse" | null };
/** Under these on either side, a cell says "too few". */
export const MIN_SIDE = 5;

/**
 * Nights with a thing against nights without it, for every factor × outcome. How sure: shuffle which nights had the
 * thing (2,000 times) and see how often a difference this big turns up anyway. With ~48 cells tried at once, "clear"
 * needs p < 0.002 and "likely" p < 0.02 — so a grid of pure chance comes up clear about once in ten grids, not every time.
 * The Heart page passes its own columns (lib/heart HEART_OUTCOMES) and keeps these rows, so the two grids agree.
 */
export function goesWith(ns: Night[], evs: Evening[], opts: { perms?: number; seed?: number; factors?: Factor[]; outcomes?: Outcome[] } = {}): Cell[] {
  const perms = opts.perms ?? 2000; let seed = opts.seed ?? 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const out: Cell[] = [];
  for (const f of opts.factors ?? FACTORS) {
    const has = ns.map((n, i) => f.has(n, evs[i])), known = ns.map((n, i) => !f.known || f.known(n, evs[i]));
    for (const o of opts.outcomes ?? OUTCOMES) {
      const pairs: [boolean, number][] = []; ns.forEach((n, i) => { const v = o.of(n, evs[i]); if (known[i] && v != null && Number.isFinite(v)) pairs.push([has[i], v]); });
      const nWith = pairs.filter((p) => p[0]).length, nWithout = pairs.length - nWith;
      if (nWith < MIN_SIDE || nWithout < MIN_SIDE) { out.push({ factor: f.id, outcome: o.id, nWith, nWithout, diff: null, p: null, sure: "too few", toward: null }); continue; }
      const vals = pairs.map((p) => p[1]), total = vals.reduce((s, v) => s + v, 0);
      const diffOf = (sumWith: number) => sumWith / nWith - (total - sumWith) / nWithout;
      const obs = diffOf(pairs.reduce((s, p) => s + (p[0] ? p[1] : 0), 0));
      // Shuffle: pick nWith nights at random (partial Fisher–Yates) and take the same difference.
      let hits = 0; const idx = vals.map((_, i) => i);
      for (let k = 0; k < perms; k++) {
        let sw = 0;
        for (let i = 0; i < nWith; i++) { const j = i + Math.floor(rnd() * (idx.length - i)); [idx[i], idx[j]] = [idx[j], idx[i]]; sw += vals[idx[i]]; }
        if (Math.abs(diffOf(sw)) >= Math.abs(obs) - 1e-9) hits++;
      }
      const p = (hits + 1) / (perms + 1);
      out.push({ factor: f.id, outcome: o.id, nWith, nWithout, diff: obs, p, sure: p < 0.002 ? "clear" : p < 0.02 ? "likely" : "not clear", toward: obs === 0 ? null : obs * o.better > 0 ? "better" : "worse" });
    }
  }
  return out;
}

/** The evening before each night, from logged entries: drinks, caffeine left at bed, a workout, food after 21:00, the next morning's rating; and the day's steps from the band (lib/steps `stepsByDay`). */
export function evenings(ns: Night[], o: {
  drinks: { at: number; g: number }[]; caffeineAt: (t: number) => number; workouts: { start: number }[]; meals: { at: number }[]; ratings: { at: number; rating?: number }[];
  steps?: Map<string, number>;
}): Evening[] {
  const mid = o.steps ? usualSteps(o.steps, ns.map((n) => n.eve)) : null;
  return ns.map((n) => {
    const st = o.steps?.get(n.eve) ?? null;
    const from = atMinute(n.eve, 12 * 60), late = atMinute(n.eve, 21 * 60);
    const rate = o.ratings.filter((r) => r.rating != null && localDay(r.at) === n.day && r.at >= n.up - HOUR && r.at <= n.up + 12 * HOUR).at(-1);
    return {
      drinks: o.drinks.filter((d) => d.at >= from && d.at < n.bed).map((d) => d.at),
      caffeineAtBed: o.caffeineAt(n.bed),
      trained: o.workouts.some((w) => localDay(w.start) === n.eve),
      ateLate: o.meals.some((m) => m.at >= late && m.at < n.bed),
      rating: rate?.rating ?? null,
      ...(o.steps ? { steps: st, moreSteps: st != null && mid != null ? st > mid : null } : {}),
    };
  });
}

/** Plain facts about one night against the others — what was different, never why. */
export function facts(n: Night, e: Evening, all: Night[], fmt: { clock: (t: number) => string; dur: (min: number) => string }): string[] {
  const others = all.filter((x) => x.id !== n.id), out: string[] = [];
  if (e.drinks.length) out.push(`${e.drinks.length} drink${e.drinks.length > 1 ? "s" : ""}, the last ${fmt.dur((n.bed - Math.max(...e.drinks)) / MIN)} before bed.`);
  if (e.caffeineAtBed >= 30) out.push(`About ${Math.round(e.caffeineAtBed)} mg of caffeine still in you at bedtime.`);
  const bed = usual(others.map((x) => clockH(x.bed, x.eve) * 60));
  if (bed) { const d = clockH(n.bed, n.eve) * 60 - bed.mid; if (Math.abs(d) >= 45) out.push(`In bed ${fmt.dur(Math.abs(d))} ${d > 0 ? "later" : "earlier"} than usual.`); }
  const lowAt = usual(others.map((x) => (x.lowAt == null ? null : clockH(x.lowAt, x.eve) * 60))), low = usual(others.map((x) => x.low));
  if (n.lowAt != null && n.low != null && lowAt && low) {
    const dt = clockH(n.lowAt, n.eve) * 60 - lowAt.mid, db = n.low - low.mid;
    if (Math.abs(dt) >= 45 || Math.abs(db) >= 3) out.push(`Lowest heart rate ${Math.round(n.low)} at ${fmt.clock(n.lowAt)}${Math.abs(dt) >= 45 ? `, ${fmt.dur(Math.abs(dt))} ${dt > 0 ? "later" : "earlier"} than usual` : ""} (usually about ${Math.round(low.mid)}).`);
  }
  if (n.hrv != null) {
    const v = others.map((x) => x.hrv).filter((x): x is number => x != null);
    if (v.length >= 9) { const below = v.filter((x) => x < n.hrv!).length, above = v.filter((x) => x > n.hrv!).length;
      if (below <= 2) out.push(`HRV ${Math.round(n.hrv)} ms — ${["the lowest", "the 2nd lowest", "the 3rd lowest"][below]} of ${v.length + 1} nights.`);
      else if (above <= 2) out.push(`HRV ${Math.round(n.hrv)} ms — ${["the highest", "the 2nd highest", "the 3rd highest"][above]} of ${v.length + 1} nights.`); }
  }
  for (const [k, name] of [["deep", "Deep sleep"], ["rem", "REM"]] as const) {
    const u = usual(others.map((x) => x[k])), v = n[k];
    if (u && v != null && (v < u.lo || v > u.hi)) out.push(`${name} ${Math.round(v)} min, ${v < u.lo ? "under" : "over"} your usual ${Math.round(u.lo)}–${Math.round(u.hi)}.`);
  }
  if (n.nap) out.push(`A ${Math.round(n.nap.min)}-minute nap at ${fmt.clock(n.nap.start)}.`);
  return out.slice(0, 6);
}

