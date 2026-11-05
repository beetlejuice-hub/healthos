/**
 * Tonight's bet (PLAN 187 phase 2; owner, 3 Nov: "App could do prediction vs real so it predicts based on drinks workout
 * food etc to sleep and readiness and restoration of body etc"; on the canvas: "i like the b forecast design, simpler,
 * cleaner"). From your own nights: what the evening held — drinks, caffeine left at bed, training, training late, a meal
 * close to bed, evening stress, bedtime against your usual — against that night's sleep score (lib/sleepscore). A ridge
 * regression (a straight-line fit held back from over-reading few nights), fit only on nights BEFORE the one it bets on,
 * so last night's bet is the bet it would have made then. Its range is the middle 80 % of its own past misses (each night
 * left out of the fit that judges it); each thing's push is how far tonight moves the bet from your usual.
 *
 * Bedtime (PLAN 198; owner, 5 Nov: "app bet for night score is kinda stupid cause it cant predict when im gonna go to
 * sleep"): the one thing it can't know and you can. So the evening shows what today has already set (everything but
 * bedtime) and a score for each bedtime ahead; when your nights say bedtime barely moves yours, one number. A morning
 * check reads the bet off the bedtime you actually had. Pure.
 */

import type { Evening, Night } from "./sleep";
import { clockH } from "./sleep";

export const FORECAST = { minNights: 21, back: 90, lambda: 3, hit: 5, week: 7, minOn: 4, rungs: 4, flatPerHour: 1, alikeSd: 0.25 } as const;

type Feature = { id: string; of: (n: Night, e: Evening, bedH: number) => number; say: (v: number) => string; binary?: boolean };
export const FEATURES: Feature[] = [
  { id: "drinks", of: (_, e) => e.drinks.length, say: (v) => (v < 0.5 ? "no drinks" : `${Math.round(v)} drink${Math.round(v) === 1 ? "" : "s"}`) },
  { id: "caf", of: (_, e) => Math.min(e.caffeineAtBed, 300) / 100, say: (v) => (v < 0.1 ? "no caffeine left at bed" : `${Math.round(v * 100)} mg caffeine at bed`) },
  { id: "trained", of: (_, e) => (e.trained ? 1 : 0), say: (v) => (v ? "the workout" : "no workout"), binary: true },
  { id: "lateTrain", of: (_, e) => (e.lateTrain ? 1 : 0), say: (v) => (v ? "training late" : "no late training"), binary: true },
  { id: "lateMeal", of: (_, e) => (e.lastMealMin != null && e.lastMealMin < 120 ? 1 : 0), say: (v) => (v ? "eating close to bed" : "nothing eaten close to bed"), binary: true },
  { id: "stress", of: (_, e) => (e.eveStress != null && e.eveStress >= 7 ? 1 : 0), say: (v) => (v ? "the stress" : "a calm evening"), binary: true },
  { id: "bedLate", of: (n, _, b) => Math.max(-3, Math.min(4, clockH(n.bed, n.eve) - b)), say: (v) => (v > 0.25 ? "a late bedtime" : v < -0.25 ? "an early night" : "your usual bedtime") },
];

const BED = FEATURES.findIndex((f) => f.id === "bedLate");

export type Row = { x: number[]; y: number };
/** `bedMax`: the latest bed, in hours past your usual, among the nights it learned from (it says nothing past that). */
export type Model = { usual: number; mu: number[]; sd: number[]; w: number[]; use: boolean[]; band: [number, number]; n: number; bedH: number; bedMax: number };
export type Push = { id: string; say: string; pts: number };
export type Bet = { bet: number; low: number; high: number; usual: number; pushes: Push[] };

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0; };
const quant = (v: number[], p: number) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))]; };

/** Solve A w = b (small, symmetric, positive): Gaussian elimination with pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => (Math.abs(r[i]) < 1e-12 ? 0 : r[n] / r[i]));
}

/** The fit itself, without its range (that needs it run once per left-out night). */
function fit(rows: Row[], bedH: number): Model {
  const p = FEATURES.length, n = rows.length;
  const mu = Array.from({ length: p }, (_, j) => rows.reduce((a, r) => a + r.x[j], 0) / n);
  const sd = mu.map((m, j) => Math.sqrt(rows.reduce((a, r) => a + (r.x[j] - m) ** 2, 0) / n));
  // a thing used only with enough nights of it: a yes/no on 4+ nights, anything else that varies at all
  const use = FEATURES.map((f, j) => sd[j] > 1e-9 && (!f.binary || rows.filter((r) => r.x[j] > 0).length >= FORECAST.minOn));
  const idx = use.flatMap((u, j) => (u ? [j] : []));
  const usual = rows.reduce((a, r) => a + r.y, 0) / n;
  const Z = rows.map((r) => idx.map((j) => (r.x[j] - mu[j]) / sd[j])), yc = rows.map((r) => r.y - usual);
  const A = idx.map((_, a) => idx.map((_, b) => Z.reduce((s, z) => s + z[a] * z[b], 0) + (a === b ? FORECAST.lambda : 0)));
  const rhs = idx.map((_, a) => Z.reduce((s, z, i) => s + z[a] * yc[i], 0));
  const wi = idx.length ? solve(A, rhs) : [];
  const w = Array(p).fill(0) as number[];
  idx.forEach((j, k) => { w[j] = wi[k]; });
  return { usual, mu, sd, w, use, band: [0, 0], n, bedH, bedMax: Math.max(...rows.map((r) => r.x[BED])) };
}

const pushesOf = (m: Model, x: number[]): Push[] => FEATURES.flatMap((f, j) => (m.use[j] ? [{ id: f.id, say: f.say(x[j]), pts: (m.w[j] * (x[j] - m.mu[j])) / m.sd[j] }] : []));
const predict = (m: Model, x: number[]) => m.usual + pushesOf(m, x).reduce((a, q) => a + q.pts, 0);

/** The model from past nights (each with its evening's features and its score), or null under FORECAST.minNights. */
export function forecastModel(rows: Row[], bedH: number): Model | null {
  if (rows.length < FORECAST.minNights) return null;
  const m = fit(rows, bedH);
  // its misses on nights it didn't see: each left out of the fit that judges it
  const miss = rows.map((r, i) => r.y - predict(fit(rows.filter((_, k) => k !== i), bedH), r.x));
  m.band = [quant(miss, 0.1), quant(miss, 0.9)];
  return m;
}

/** The bet for an evening: the score, its range, your usual, and what pushes it, biggest first (only those of a point or more). */
export function betOn(m: Model, x: number[]): Bet {
  const bet = predict(m, x), clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
  const pushes = pushesOf(m, x).filter((q) => Math.abs(q.pts) >= 1).sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts)).map((q) => ({ ...q, pts: Math.round(q.pts) }));
  return { bet: clamp(bet), low: clamp(bet + m.band[0]), high: clamp(bet + m.band[1]), usual: Math.round(m.usual), pushes };
}

/** One night's features; `bedAsUsual`: as if in bed at your usual time (what that night would have been then). */
export const featuresOf = (n: Night, e: Evening, bedH: number, bedAsUsual = false) => FEATURES.map((f) => (bedAsUsual && f.id === "bedLate" ? 0 : f.of(n, e, bedH)));

/** Your usual bedtime, as hours from the evening's midnight (23.5 = 23:30, 24.5 = 00:30). */
export const usualBedH = (ns: Night[]) => median(ns.map((n) => clockH(n.bed, n.eve)));

export type Scored = { n: Night; e: Evening; score: number };

/**
 * The bet for night `i` of `all` (by bed time), from the FORECAST.back days of nights before it — what the app would have
 * said that evening for the bedtime you actually had (`asUsual`: for your usual one instead) — or null with too few.
 */
export function betBefore(all: Scored[], i: number, asUsual = false): (Bet & { model: Model }) | null {
  const t = all[i].n, before = all.filter((s) => s.n.bed < t.bed && s.n.bed >= t.bed - FORECAST.back * 86_400_000);
  const bedH = usualBedH(before.map((s) => s.n));
  const m = forecastModel(before.map((s) => ({ x: featuresOf(s.n, s.e, bedH), y: s.score })), bedH);
  return m ? { ...betOn(m, featuresOf(t, all[i].e, bedH, asUsual)), model: m } : null;
}

/** Points a bed an hour later has gone with on your nights (negative: costs); 0 when bedtime isn't in the fit. */
export const perHour = (m: Model) => (m.use[BED] ? m.w[BED] / m.sd[BED] : 0);

export type Rung = { h: number; bet: number; low: number; high: number };
export type Tonight = {
  usual: number; bedH: number; perHour: number;
  /** Bedtime hasn't moved the score a point an hour — one number, "whenever you go". `alike`: too few different bedtimes to tell. */
  flat: boolean; alike: boolean;
  /** The bet at your usual bed, and what today has already set: every push but bedtime's. */
  bet: Bet; set: Push[];
  /** A score for each whole hour ahead (none past the latest bed it has seen). */
  rungs: Rung[];
};

/**
 * Tonight from the model: `xAt(h)` is tonight's features with you in bed at h (hours from the evening's midnight — the
 * caffeine still in you and the time since the last meal change with it); `nowH` is now, the same way. Rungs start at the
 * whole hour before your usual, or the first one at least 15 minutes off.
 */
export function tonight(m: Model, xAt: (h: number) => number[], nowH: number): Tonight {
  const bet = betOn(m, xAt(m.bedH)), ph = perHour(m), alike = m.sd[BED] < FORECAST.alikeSd;
  const flat = alike || Math.abs(ph) < FORECAST.flatPerHour;
  const first = Math.max(Math.floor(m.bedH) - 1, Math.ceil(nowH + 0.25));
  const rungs = flat ? [] : Array.from({ length: FORECAST.rungs }, (_, k) => first + k).filter((h) => h - m.bedH <= m.bedMax + 0.5)
    .map((h) => { const b = betOn(m, xAt(h)); return { h, bet: b.bet, low: b.low, high: b.high }; });
  return { usual: bet.usual, bedH: m.bedH, perHour: ph, flat, alike, bet, set: bet.pushes.filter((q) => q.id !== "bedLate"), rungs };
}

/** "23:20" for 23.33, "00:40" for 24.67 — the minute it's in, as a clock reads (00:04:40 is 00:04). */
export const hhmm = (h: number) => { const t = Math.floor(h * 60 + 1e-3), m = ((t % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

export type Called = { day: string; bet: number; real: number; off: number; hit: boolean };

/** The last FORECAST.week nights it could bet on: what it bet for the bedtime you had, what came, whether within FORECAST.hit. */
export function lastBets(all: Scored[]): Called[] {
  const sorted = [...all].sort((a, b) => a.n.bed - b.n.bed), out: Called[] = [];
  for (let i = sorted.length - 1; i >= 0 && out.length < FORECAST.week; i--) {
    const b = betBefore(sorted, i);
    if (!b) break;
    const off = sorted[i].score - b.bet;
    out.unshift({ day: sorted[i].n.day, bet: b.bet, real: sorted[i].score, off, hit: Math.abs(off) <= FORECAST.hit });
  }
  return out;
}

/** "mostly the 2 beers (−6)": the biggest push in words, when there's one of 2 points or more. */
export function mostly(b: Bet): string | null {
  const q = b.pushes[0];
  return q && Math.abs(q.pts) >= 2 ? `mostly ${q.say} (${q.pts > 0 ? "+" : "−"}${Math.abs(q.pts)})` : null;
}
