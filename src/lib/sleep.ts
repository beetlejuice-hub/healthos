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
import { CAF_SLEEP } from "./caffeine-sleep";

/** "restless": the band's own restless stretches (owner, 20 Oct: "WE HAVE THIS IN THE APP, THE APP COUNTS THIS") — asleep, not light sleep. */
export type StageType = "awake" | "restless" | "rem" | "light" | "deep";
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
  /** Minutes the band marked restless between falling asleep and waking (null without stages). */
  restless?: number | null;
  /** Average heart rate while asleep (from falling asleep to waking), when the band had most of the night (sleep score). */
  meanHr?: number | null;
  hrv: number | null; rhr: number | null;
  nap: { start: number; end: number; min: number } | null;
};

const stageOf = (t: string): StageType => (t === "awake" || t === "wake" ? "awake" : t === "restless" ? "restless" : t === "rem" ? "rem" : t === "deep" ? "deep" : "light");
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
    let hs = 0, hn = 0; for (let i = firstAt(hr, onset); i < hr.length && hr[i][0] <= wake; i++) { hs += hr[i][1]; hn++; }
    out.push({
      id: s.id, day, eve, bed: s.start, up: s.end, onset, wake, asleep,
      deep: s.stageMin.deep ?? sum("deep"), rem: s.stageMin.rem ?? sum("rem"), light: s.stageMin.light ?? sum("light"),
      awake, wakes: inNight.length, latency: Math.max(0, (onset - s.start) / MIN), stages, restless: sum("restless"),
      low: lo?.low ?? null, lowAt: lo?.at ?? null, meanHr: hn >= 60 ? hs / hn : null, hrv: hrv[day] ?? null, rhr: rhr[day] ?? null,
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
  steps?: number | null; moreSteps?: boolean | null;
  /** What that morning's sleep entry says last night held (lib/lastnight); null when that morning wasn't asked. */
  tags?: string[] | null;
  /** About how long on the phone before sleep, from that morning's answer (PLAN 88); null when not answered. */
  phoneMin?: number | null;
  /**
   * Food and activities of the evening (PLAN 88), each null when it isn't known — an evening with no food logged isn't an
   * evening you ate nothing. kcal and carbs from 17:00 to bed, and whether that's above the middle of the nights given;
   * minutes from the last real meal (150+ kcal, from 15:00) to bed; a workout ending within 3 h of bed; stress at the
   * last check-in from 17:00; each supplement that day: taken, said "didn't take", or no answer (null).
   */
  eveKcal?: number | null; eveCarbs?: number | null; moreEveKcal?: boolean | null; moreEveCarbs?: boolean | null;
  lastMealMin?: number | null; lateTrain?: boolean; eveStress?: number | null; supps?: Record<string, boolean | null> };

/** `known`: false leaves the night out of that row — a day the band was off has no steps, it isn't a day without. */
/** A grid row. Generic so other grids (Training's sessions) use the same tested shuffle; the default is a night and its evening. */
export type Factor<N = Night, E = Evening> = { id: string; name: string; has: (n: N, e: E) => boolean; known?: (n: N, e: E) => boolean };
export type Outcome<N = Night, E = Evening> = { id: string; name: string; unit: "min" | "bpm" | "ms" | "/10" | "clock" | "×" | "%"; /** +1: more is toward longer, deeper, calmer sleep (or stronger). */ better: 1 | -1; of: (n: N, e: E) => number | null };
export const FACTORS: Factor[] = [
  { id: "drinks", name: "Drinks that evening", has: (_, e) => e.drinks.length > 0 },
  { id: "caf", name: "Caffeine at bed ≥ 30 mg", has: (_, e) => e.caffeineAtBed >= 30 },
  { id: "trained", name: "Trained that day", has: (_, e) => e.trained },
  { id: "late", name: "Ate after 21:00", has: (_, e) => e.ateLate },
  { id: "nap", name: "Napped that day", has: (n) => !!n.nap },
  { id: "latebed", name: "In bed after 00:15", has: (n) => clockH(n.bed, n.eve) >= 24.25 },
  { id: "steps", name: "More steps than usual that day", has: (_, e) => e.moreSteps === true, known: (_, e) => e.moreSteps != null },
  // PLAN 88 (owner: "foods and activities … how it affects sleep score deep sleep"): from what's already logged
  { id: "meal2h", name: "Ate within 2 h of bed", has: (_, e) => e.lastMealMin != null && e.lastMealMin < 120, known: (_, e) => e.lastMealMin != null },
  { id: "bigeve", name: "Ate more than usual in the evening", has: (_, e) => e.moreEveKcal === true, known: (_, e) => e.moreEveKcal != null },
  { id: "carbeve", name: "More carbs than usual in the evening", has: (_, e) => e.moreEveCarbs === true, known: (_, e) => e.moreEveCarbs != null },
  { id: "latetrain", name: "Trained within 3 h of bed", has: (_, e) => e.lateTrain === true, known: (_, e) => e.lateTrain != null },
  // owner, 13 Oct: "late night scrolling how it affects sleep score deep sleep" — the morning's answer
  { id: "phone", name: "On the phone 30+ min before sleep", has: (_, e) => e.phoneMin != null && e.phoneMin >= 30, known: (_, e) => e.phoneMin != null },
  { id: "stress", name: "Stressed in the evening (7+)", has: (_, e) => e.eveStress != null && e.eveStress >= 7, known: (_, e) => e.eveStress != null },
];

/**
 * One row per supplement: days you took it against days you didn't (said so, or didn't log it on a day you used the app — lib/suppdays); days with nothing logged are left out.
 * Only supplements with MIN_SIDE answered nights each way get a row, so a stack of ten doesn't fill the grid with dots.
 */
export function suppFactors(supplements: { id: string; name: string }[], evs: Evening[]): Factor[] {
  return supplements.filter((s) => {
    const a = evs.map((e) => e.supps?.[s.id]);
    return a.filter((x) => x === true).length >= MIN_SIDE && a.filter((x) => x === false).length >= MIN_SIDE;
  }).map((s) => ({ id: `supp:${s.id}`, name: `${s.name} that day`, has: (_, e) => e.supps?.[s.id] === true, known: (_, e) => e.supps?.[s.id] != null }));
}
export const OUTCOMES: Outcome[] = [
  { id: "asleep", name: "Asleep", unit: "min", better: 1, of: (n) => n.asleep },
  // how long it took, and how often you woke (PLAN 88) — the band has both
  { id: "latency", name: "Fell asleep", unit: "min", better: -1, of: (n) => n.latency },
  { id: "deep", name: "Deep", unit: "min", better: 1, of: (n) => n.deep },
  { id: "rem", name: "REM", unit: "min", better: 1, of: (n) => n.rem },
  { id: "awake", name: "Awake", unit: "min", better: -1, of: (n) => n.awake },
  { id: "wakes", name: "Woke up", unit: "×", better: -1, of: (n) => n.wakes },
  { id: "low", name: "Low HR", unit: "bpm", better: -1, of: (n) => n.low },
  { id: "lowAt", name: "Low at", unit: "clock", better: -1, of: (n) => (n.lowAt == null ? null : clockH(n.lowAt, n.eve) * 60) },
  { id: "hrv", name: "HRV", unit: "ms", better: 1, of: (n) => n.hrv },
  { id: "rating", name: "Rating", unit: "/10", better: 1, of: (_, e) => e.rating },
];

export type Sure = "clear" | "likely" | "not clear" | "too few";
export type Cell = { factor: string; outcome: string; nWith: number; nWithout: number; diff: number | null; p: number | null; sure: Sure; toward: "better" | "worse" | null };
/** Under these on either side, a cell says "too few". */
export const MIN_SIDE = 5;

/** How sure a cell must be when `cells` are tried at once: never looser than 0.002 / 0.02 (right for ~48 cells). */
export function bars(cells: number): { clear: number; likely: number } {
  const n = Math.max(1, cells);
  return { clear: Math.min(0.002, 0.1 / n), likely: Math.min(0.02, 1 / n) };
}

/**
 * Nights with a thing against nights without it, for every factor × outcome. How sure: shuffle which nights had the
 * thing (2,000 times or more) and see how often a difference this big turns up anyway. The bar scales with how many cells
 * have enough nights to try: "clear" needs p < 0.1 ÷ cells and "likely" 1 ÷ cells (with ~48 cells: 0.002 and 0.02, never
 * looser) — so a grid of pure chance comes up clear about once in ten grids however many rows it grows (PLAN 88).
 * The Heart page passes its own columns (lib/heart HEART_OUTCOMES) and keeps these rows, so the two grids agree.
 */
export function goesWith<N = Night, E = Evening>(ns: N[], evs: E[], opts: { perms?: number; seed?: number; factors?: Factor<N, E>[]; outcomes?: Outcome<N, E>[] } = {}): Cell[] {
  // 32-bit integer generator (Math.imul): exact and fast — the old one multiplied past what a double holds exactly
  let seed = (opts.seed ?? 7) >>> 0;
  const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const fs = opts.factors ?? (FACTORS as unknown as Factor<N, E>[]), os = opts.outcomes ?? (OUTCOMES as unknown as Outcome<N, E>[]);
  // every cell's nights first (known, with a value), so the bar knows how many cells are being tried
  const rows = fs.map((f) => {
    const has = ns.map((n, i) => f.has(n, evs[i])), known = ns.map((n, i) => !f.known || f.known(n, evs[i]));
    return { f, has, cells: os.map((o) => ({ o, use: ns.flatMap((n, i) => { const v = o.of(n, evs[i]); return known[i] && v != null && Number.isFinite(v) ? [i] : []; }) })) };
  });
  const sides = (has: boolean[], use: number[]) => { const w = use.filter((i) => has[i]).length; return [w, use.length - w] as const; };
  const tried = rows.reduce((a, r) => a + r.cells.filter((c) => { const [w, wo] = sides(r.has, c.use); return w >= MIN_SIDE && wo >= MIN_SIDE; }).length, 0);
  const bar = bars(tried);
  // enough shuffles that "clear" can be reached at all (p can't go under 1 ÷ shuffles)
  const perms = opts.perms ?? Math.max(2000, Math.ceil(4 / bar.clear));
  const done = new Map<string, Cell>();
  for (const r of rows) {
    // the columns of a row that count the same nights share one set of shuffles (a grid of 100 cells stays quick on a phone)
    const groups = new Map<string, { o: Outcome<N, E>; use: number[] }[]>();
    for (const c of r.cells) { const k = c.use.join(","); groups.set(k, [...(groups.get(k) ?? []), c]); }
    for (const g of groups.values()) {
      const use = g[0].use, [nWith, nWithout] = sides(r.has, use), m = use.length;
      if (nWith < MIN_SIDE || nWithout < MIN_SIDE) { for (const c of g) done.set(`${r.f.id}|${c.o.id}`, { factor: r.f.id, outcome: c.o.id, nWith, nWithout, diff: null, p: null, sure: "too few", toward: null }); continue; }
      const vals = g.map((c) => Float64Array.from(use, (i) => c.o.of(ns[i], evs[i])!)), G = g.length;
      const total = vals.map((v) => v.reduce((a, x) => a + x, 0));
      const diffOf = (c: number, sumWith: number) => sumWith / nWith - (total[c] - sumWith) / nWithout;
      const obs = vals.map((v, c) => diffOf(c, use.reduce((a, i, k) => a + (r.has[i] ? v[k] : 0), 0)));
      // Shuffle: pick nWith nights at random (partial Fisher–Yates) and take the same difference, for every column at once.
      const hits = new Int32Array(G), idx = Int32Array.from({ length: m }, (_, k) => k), sw = new Float64Array(G);
      for (let k = 0; k < perms; k++) {
        sw.fill(0);
        for (let i = 0; i < nWith; i++) {
          const j = i + Math.floor(rnd() * (m - i)), t = idx[i]; idx[i] = idx[j]; idx[j] = t;
          const x = idx[i]; for (let c = 0; c < G; c++) sw[c] += vals[c][x];
        }
        for (let c = 0; c < G; c++) if (Math.abs(diffOf(c, sw[c])) >= Math.abs(obs[c]) - 1e-9) hits[c]++;
      }
      g.forEach((cell, c) => {
        const p = (hits[c] + 1) / (perms + 1), d = obs[c];
        done.set(`${r.f.id}|${cell.o.id}`, { factor: r.f.id, outcome: cell.o.id, nWith, nWithout, diff: d, p, sure: p < bar.clear ? "clear" : p < bar.likely ? "likely" : "not clear", toward: d === 0 ? null : d * cell.o.better > 0 ? "better" : "worse" });
      });
    }
  }
  return fs.flatMap((f) => os.map((o) => done.get(`${f.id}|${o.id}`)!));
}

/** The evening before each night, from logged entries: drinks, caffeine left at bed, a workout, food after 21:00, the next morning's rating; and the day's steps from the band (lib/steps `stepsByDay`). */
export function evenings(ns: Night[], o: {
  drinks: { at: number; g: number }[]; caffeineAt: (t: number) => number; workouts: { start: number }[]; meals: { at: number }[]; ratings: { at: number; rating?: number }[];
  steps?: Map<string, number>;
  /** Sleep entries (the morning's rating and last night's tags). Mornings from the first one with a tag count as asked. */
  sleeps?: { at: number; tags?: string[]; phoneMin?: number }[];
  /** PLAN 88: food with kcal and carbs; workouts with their end; check-ins with stress; supplement answers. */
  foods?: { at: number; kcal: number; c: number }[];
  sessions?: { start: number; end: number }[];
  checks?: { at: number; stress?: number }[];
  supps?: { at: number; suppId: string; status: "taken" | "skipped" }[];
}): Evening[] {
  const mid = o.steps ? usualSteps(o.steps, ns.map((n) => n.eve)) : null;
  // the evening's food: from 17:00 to bed; unknown when nothing was logged in that stretch
  const eveFood = (n: Night) => { const f = o.foods!.filter((x) => x.at >= atMinute(n.eve, 17 * 60) && x.at < n.bed); return f.length ? { kcal: f.reduce((a, x) => a + x.kcal, 0), c: f.reduce((a, x) => a + x.c, 0) } : null; };
  const eves = o.foods ? ns.map(eveFood) : [];
  const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length >= 8 ? s[Math.floor((s.length - 1) / 2)] : null; };
  const kMid = o.foods ? median(eves.flatMap((x) => (x ? [x.kcal] : []))) : null, cMid = o.foods ? median(eves.flatMap((x) => (x ? [x.c] : []))) : null;
  const morning = (t: number) => { const h = new Date(t).getHours(); return h >= CAF_SLEEP.morningFromHour && h < CAF_SLEEP.morningUntilHour; };
  const tagged = o.sleeps?.filter((s) => s.tags?.length && morning(s.at)).map((s) => localDay(s.at)).sort()[0];
  return ns.map((n, i) => {
    const sl = o.sleeps?.filter((s) => localDay(s.at) === n.day && morning(s.at)).at(-1);
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
      // Before the first tagged morning nobody was asking, so an untagged night then isn't a night without.
      ...(o.sleeps ? { tags: sl && tagged != null && n.day >= tagged ? sl.tags ?? [] : null, phoneMin: sl?.phoneMin ?? null } : {}),
      ...(o.foods ? (() => {
        const e = eves[i], last = o.foods!.filter((x) => x.kcal >= 150 && x.at >= atMinute(n.eve, 15 * 60) && x.at < n.bed).at(-1);
        return { eveKcal: e?.kcal ?? null, eveCarbs: e?.c ?? null, moreEveKcal: e && kMid != null ? e.kcal > kMid : null, moreEveCarbs: e && cMid != null ? e.c > cMid : null,
          lastMealMin: last ? (n.bed - last.at) / MIN : null };
      })() : {}),
      ...(o.sessions ? { lateTrain: o.sessions.some((w) => w.start < n.bed && w.end > n.bed - 3 * HOUR) } : {}),
      ...(o.checks ? { eveStress: o.checks.filter((c) => c.stress != null && c.at >= atMinute(n.eve, 17 * 60) && c.at < n.bed).at(-1)?.stress ?? null } : {}),
      ...(o.supps ? { supps: (() => {
        const r: Record<string, boolean | null> = {};
        for (const x of o.supps!) if (localDay(x.at) === n.eve) r[x.suppId] = r[x.suppId] === true || x.status === "taken" ? true : false;
        return r;
      })() } : {}),
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


/**
 * How long last night took to fall asleep, from the band (PLAN 77; owner, 13 Oct: "took too long to fall asleep can be
 * replaced IMO w band data"), against the middle of your other nights in the last 2 weeks (needs 5). Null without a night.
 */
export function fellAsleep(sessions: SleepSession[], now: number): { min: number; usual: number | null } | null {
  const main = sessions.filter((s) => !s.nap && s.end <= now && s.end > now - 36 * HOUR).sort((a, b) => b.end - a.end)[0];
  if (!main) return null;
  const lat = (s: SleepSession) => nights([s], [], {}, {})[0]?.latency ?? null;
  const min = lat(main);
  if (min == null) return null;
  const others = sessions.filter((s) => !s.nap && s !== main && s.end > now - 15 * 24 * HOUR && s.end <= now).map(lat).filter((v): v is number => v != null).sort((a, b) => a - b);
  return { min: Math.round(min), usual: others.length >= 5 ? Math.round(others[Math.floor(others.length / 2)]) : null };
}

/**
 * One night in plain words (PLAN 79; owner, 13 Oct, on the nights table: "i really like this sleep data but can we get some
 * eli5 explanations or comparisons here to see whats up"). Each measure against your own usual (the middle half of your
 * other nights, needs 5) and one line on what it is. General figures are "most adults", never a verdict on you.
 */
export type Eli5 = { key: string; name: string; value: string; vs: string; what: string; side: "more" | "less" | "usual" | null };
export function eli5(n: Night, ns: Night[]): Eli5[] {
  const others = ns.filter((x) => x.id !== n.id);
  const hm = (m: number) => { const t = Math.round(m); return t >= 60 ? `${Math.floor(t / 60)} h ${String(t % 60).padStart(2, "0")}` : `${t} min`; };
  const row = (key: string, name: string, v: number | null, of: (x: Night) => number | null, fmt: (v: number) => string, slack: number, what: string): Eli5 | null => {
    if (v == null) return null;
    const u = usual(others.map(of));
    if (!u) return { key, name, value: fmt(v), vs: "your usual shows after 5 nights", what, side: null };
    const side = v > u.hi + slack ? "more" : v < u.lo - slack ? "less" : "usual";
    // "237–246 min", not "237 min–246 min" (the unit once, at the end)
    const lo = fmt(u.lo), hi = fmt(u.hi), unit = / (min|bpm|ms)$/.exec(hi)?.[0] ?? "";
    const range = Math.round(u.lo) === Math.round(u.hi) ? fmt(u.mid) : `${unit && lo.endsWith(unit) ? lo.slice(0, -unit.length) : lo}–${hi}`;
    return { key, name, value: fmt(v), side, what, vs: side === "usual" ? `about your usual (${range})` : `${side} than your usual ${range}` };
  };
  return [
    row("asleep", "Asleep", n.asleep, (x) => x.asleep, hm, 10, "Time actually asleep, not just in bed. Most adults need about 7–9 hours."),
    row("deep", "Deep", n.deep, (x) => x.deep, (v) => `${Math.round(v)} min`, 3, "The heaviest sleep: the body repairs itself and the heart slows down most. Most adults get about 1–1½ hours, mostly early in the night."),
    row("rem", "REM", n.rem, (x) => x.rem, (v) => `${Math.round(v)} min`, 3, "Dreaming sleep: the brain sorts memories and feelings. Most adults get about 1½–2 hours, mostly towards morning."),
    row("awake", "Awake", n.awake, (x) => x.awake, (v) => `${Math.round(v)} min`, 3, "Awake after first falling asleep (not the time before). A few short wakings are normal; long ones leave you more tired."),
    row("low", "Lowest heart rate", n.low, (x) => x.low, (v) => `${Math.round(v)} bpm`, 0.5, "How far your heart settled in the night. Lower than your usual usually means a calmer, more restful night."),
    row("hrv", "HRV", n.hrv, (x) => x.hrv, (v) => `${Math.round(v)} ms`, 0.5, "How much the time between heartbeats varies. Higher than your usual usually means more recovered; it swings a lot night to night, so the trend matters more than one night."),
  ].filter((x): x is Eli5 => x != null);
}
