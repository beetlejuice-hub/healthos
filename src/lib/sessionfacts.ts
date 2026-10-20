/**
 * Training page B · what goes with a strong session (PLAN 64; owner, 9 Oct: "Make sure app sees connection between food
 * intake, calorie, carbs, and strength in gym"). For each session, what came before it — carbs in the 4 h before, the
 * night before from the band, the 3 days before against your usual eating, that morning's HRV, coffee in the 2 h before,
 * each supplement that day, morning or evening — and how you felt after. Then the Sleep grid's tested shuffle
 * (lib/sleep goesWith) against the session's strength (lib/liftstrength: each lift against its own line). Unknown is
 * left out, never counted as "without": a day with nothing logged isn't a day you ate nothing. Pure.
 */

import type { Entry } from "./types";
import type { Night, Factor, Outcome, Sure } from "./sleep";
import type { Session } from "./liftstrength";
import { localDay, addDays, HOUR } from "./time";
import { suppByDay } from "./suppdays";

export type SessionFacts = {
  /** g of carbs logged in the 4 h before; null when nothing was logged that day before it started. */ carbs4h: number | null;
  /** Minutes asleep the night before (the band's night ending that morning). */ asleep: number | null;
  /** kcal a day under your usual over the 3 days before (negative: over); null unless all 3 days have food logged. */ under3: number | null;
  /** That morning's HRV in your lowest quarter of the session mornings (from 8 with HRV). */ hrvLow: boolean | null;
  /** A caffeinated drink in the 2 h before. */ coffee: boolean;
  /** Started at 15:00 or later. */ evening: boolean;
  /** Each supplement that day: taken, or not (said "didn't", or not logged on a day the app was used); unknown left out. */ supps: Record<string, boolean | null>;
  /** Energy (else mood) at the first check-in within 3 h after it ended. */ feltAfter: number | null;
};

export const CARBS_G = 60, SHORT_MIN = 390, UNDER_KCAL = 400;

export function sessionFacts(ss: Session[], entries: Entry[], ns: Night[] = []): SessionFacts[] {
  const foods = entries.filter((e): e is Extract<Entry, { kind: "food" }> => e.kind === "food");
  const kcalByDay = new Map<string, number>();
  for (const f of foods) kcalByDay.set(localDay(f.at), (kcalByDay.get(localDay(f.at)) ?? 0) + f.macros.kcal);
  const hrvs = ss.map((s) => ns.find((n) => n.day === localDay(s.startedAt))?.hrv ?? null).filter((v): v is number => v != null).sort((a, b) => a - b);
  const q1 = hrvs.length >= 8 ? hrvs[Math.floor((hrvs.length - 1) * 0.25)] : null;
  const suppsBy = suppByDay(entries); // not logged = not taken, on days you used the app (owner, 20 Oct)
  return ss.map((s) => {
    const t = s.startedAt, day = localDay(t), end = s.endedAt ?? t + HOUR;
    const dayFood = foods.filter((f) => localDay(f.at) === day && f.at < t);
    const carbs4h = dayFood.length ? dayFood.filter((f) => f.at >= t - 4 * HOUR).reduce((a, f) => a + f.macros.c, 0) : null;
    const night = ns.find((n) => n.day === day && n.up <= t);
    // the 3 days before against the median logged day of the 28 before them
    const three = [1, 2, 3].map((k) => kcalByDay.get(addDays(day, -k)));
    const base = Array.from({ length: 28 }, (_, k) => kcalByDay.get(addDays(day, -4 - k))).filter((v): v is number => v != null).sort((a, b) => a - b);
    const usual = base.length >= 7 ? base[Math.floor((base.length - 1) / 2)] : null;
    const under3 = usual != null && three.every((v) => v != null) ? usual - (three as number[]).reduce((a, b) => a + b, 0) / 3 : null;
    const hrv = ns.find((n) => n.day === day)?.hrv ?? null;
    const supps: Record<string, boolean | null> = Object.fromEntries(suppsBy.get(day) ?? []);
    const after = entries.find((e): e is Extract<Entry, { kind: "feel" }> => e.kind === "feel" && e.at >= end && e.at < end + 3 * HOUR && (e.energy != null || e.mood != null));
    return {
      carbs4h, asleep: night?.asleep ?? null, under3, hrvLow: q1 != null && hrv != null ? hrv <= q1 : null,
      coffee: entries.some((e) => e.kind === "drink" && e.caffeineMg > 0 && e.at >= t - 2 * HOUR && e.at < t),
      evening: new Date(t).getHours() >= 15, supps, feltAfter: after ? after.energy ?? after.mood ?? null : null,
    };
  });
}

/** The grid's rows (board B), each with what it needs; supplements join by name once answered 5 times each way. */
export function sessionFactors(supplements: { id: string; name: string }[], fs: SessionFacts[]): Factor<Session, SessionFacts>[] {
  const supp = supplements.filter((x) => { const a = fs.map((f) => f.supps[x.id]); return a.filter((v) => v === true).length >= 5 && a.filter((v) => v === false).length >= 5; });
  return [
    { id: "carbs", name: `Carbs ≥ ${CARBS_G} g in the 4 h before`, has: (_, f) => (f.carbs4h ?? 0) >= CARBS_G, known: (_, f) => f.carbs4h != null },
    { id: "short", name: "Under 6 h 30 asleep the night before", has: (_, f) => f.asleep != null && f.asleep < SHORT_MIN, known: (_, f) => f.asleep != null },
    { id: "cut", name: `${UNDER_KCAL}+ kcal a day under your usual, 3 days before`, has: (_, f) => (f.under3 ?? 0) >= UNDER_KCAL, known: (_, f) => f.under3 != null },
    { id: "hrv", name: "HRV in your lowest quarter that morning", has: (_, f) => f.hrvLow === true, known: (_, f) => f.hrvLow != null },
    { id: "coffee", name: "Coffee in the 2 h before", has: (_, f) => f.coffee },
    { id: "evening", name: "Evening session (from 15:00)", has: (_, f) => f.evening },
    ...supp.map((x) => ({ id: `supp:${x.id}`, name: `${x.name} that day`, has: (_: Session, f: SessionFacts) => f.supps[x.id] === true, known: (_: Session, f: SessionFacts) => f.supps[x.id] != null })),
  ];
}

export const SESSION_OUTCOMES: Outcome<Session, SessionFacts>[] = [
  { id: "pct", name: "Strength", unit: "%", better: 1, of: (s) => s.pct },
  { id: "felt", name: "Felt after", unit: "/10", better: 1, of: (_, f) => f.feltAfter },
];

export type Slope = { pts: [number, number][]; slope: number | null; p: number | null; sure: Sure };
/** Least-squares slope of y on x; how sure by shuffling which y went with which x (2,000 times). Bars as the grid's. */
export function slopeTest(pts: [number, number][], opts: { perms?: number; seed?: number; min?: number } = {}): Slope {
  if (pts.length < (opts.min ?? 10)) return { pts, slope: null, p: null, sure: "too few" };
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), m = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length, mx = m(xs), my = m(ys);
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  if (sxx === 0) return { pts, slope: null, p: null, sure: "too few" };
  const of = (y: number[]) => xs.reduce((a, x, i) => a + (x - mx) * (y[i] - my), 0) / sxx;
  const slope = of(ys), perms = opts.perms ?? 2000, sh = [...ys];
  let seed = (opts.seed ?? 17) >>> 0, hits = 0;
  const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let k = 0; k < perms; k++) {
    for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
    if (Math.abs(of(sh)) >= Math.abs(slope) - 1e-9) hits++;
  }
  const p = (hits + 1) / (perms + 1);
  return { pts, slope, p, sure: p < 0.002 ? "clear" : p < 0.02 ? "likely" : "not clear" };
}
