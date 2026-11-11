/**
 * Connecting the dots (PLAN 205; owner, 10 Nov: "look at everything thats possible and worth looking into, connecting the
 * dots … if u like a repo app or whatever, u can connect it to app or use the same thing they are doing, copy the
 * mechanism"). The mechanism is SYNAPS's (github.com/scerelli/SYNAPS): every pair of your things, within you, at the same
 * day and one and two days on, honest about how few independent days you have, and corrected for having asked many
 * questions at once. Pure.
 *
 *   1. Each series is taken against its own recent level — the centred 21-day mean — so two things that both drift (weight
 *      down, HRV up over a season) don't look linked just for drifting.
 *   2. Each input against each outcome at lag 0, 1 and 2 days: rank correlation (Spearman), and the slope in plain units
 *      ("per drink, HRV −3.4 ms the next morning").
 *   3. Days aren't independent — a good week is several good days — so n is cut to the effective n of two autocorrelated
 *      series (Bretherton et al. 1999: n · (1 − ρ₁ρ₂) / (1 + ρ₁ρ₂), ρ the lag-1 autocorrelations), and the p-value comes
 *      from a t with that many.
 *   4. All the p-values together get Benjamini–Hochberg's false-discovery correction (q); a pair keeps its best lag; only
 *      q ≤ 0.1 is said.
 * Goes with, never causes.
 */

import type { DayFacts } from "./insights";

export type Series = Record<string, number>;
export type Thing = { key: string; name: string; unit: string; series: Series; /** how one step of it reads: "each drink", "a training day" */ per?: string; /** what it can be: an input (drinks), an outcome (HRV), or both (sleep) */ role: "input" | "outcome" | "both"; /** +1 more is better, −1 less is better, 0 neither */ better?: 1 | -1 | 0 };
export type Link = { from: string; to: string; lag: 0 | 1 | 2; rho: number; n: number; nEff: number; p: number; q: number; /** outcome units per 1 of the input */ slope: number; lo: number; hi: number };

export const CONNECT = { lags: [0, 1, 2] as const, minN: 21, window: 21, fdr: 0.1, z90: 1.645 } as const;

const addD = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

/** Each day against the centred `w`-day mean around it (days that exist only), so a slow drift isn't a link. */
export function deviations(s: Series, w: number = CONNECT.window): Series {
  const days = Object.keys(s).sort(), out: Series = {}, h = Math.floor(w / 2);
  for (const d of days) {
    const near: number[] = [];
    for (let k = -h; k <= h; k++) { const v = s[addD(d, k)]; if (v != null && Number.isFinite(v)) near.push(v); }
    if (near.length >= Math.min(7, w)) out[d] = s[d] - mean(near);
  }
  return out;
}

/** Lag-1 autocorrelation over consecutive days that both exist. */
export function lag1(s: Series): number {
  const a: number[] = [], b: number[] = [];
  for (const d of Object.keys(s)) { const n = s[addD(d, 1)]; if (n != null) { a.push(s[d]); b.push(n); } }
  if (a.length < 5) return 0;
  return pearson(a, b);
}

export function pearson(a: number[], b: number[]): number {
  const ma = mean(a), mb = mean(b);
  let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; }
  return sa && sb ? s / Math.sqrt(sa * sb) : 0;
}
function ranks(v: number[]): number[] {
  const idx = v.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]), r = new Array<number>(v.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; }
  return r;
}
export const spearman = (a: number[], b: number[]) => pearson(ranks(a), ranks(b));

/* Student's t, two-sided — through the regularized incomplete beta (Numerical Recipes' continued fraction). */
function lgamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
  let s = 1.000000000190015; for (const k of c) s += k / ++y;
  return -t + Math.log((2.5066282746310005 * s) / x);
}
function betacf(a: number, b: number, x: number): number {
  const qab = a + b, qap = a + 1, qam = a - 1; let c = 1, d = 1 - (qab * x) / qap; d = Math.abs(d) < 1e-30 ? 1e-30 : d; d = 1 / d; let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m; let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; d = Math.abs(d) < 1e-30 ? 1e-30 : d; c = 1 + aa / c; c = Math.abs(c) < 1e-30 ? 1e-30 : c; d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; d = Math.abs(d) < 1e-30 ? 1e-30 : d; c = 1 + aa / c; c = Math.abs(c) < 1e-30 ? 1e-30 : c; d = 1 / d;
    const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-12) break;
  }
  return h;
}
function ibeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}
/** Two-sided p for t with `df` degrees of freedom. */
export const pT = (t: number, df: number) => ibeta(df / 2, 0.5, df / (df + t * t));

/** Benjamini–Hochberg: each p's q (the smallest false-discovery rate at which it would be kept). */
export function bh(ps: number[]): number[] {
  const m = ps.length, o = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]), q = new Array<number>(m);
  let min = 1;
  for (let k = m - 1; k >= 0; k--) { min = Math.min(min, (o[k][0] * m) / (k + 1)); q[o[k][1]] = min; }
  return q;
}

/** One input against one outcome at one lag: the pairs (input on day d, outcome on day d + lag), from deviations. */
function pairUp(a: Series, b: Series, lag: number): [number[], number[]] {
  const x: number[] = [], y: number[] = [];
  for (const d of Object.keys(a)) { const v = b[addD(d, lag)]; if (v != null) { x.push(a[d]); y.push(v); } }
  return [x, y];
}

/** Every input × outcome × lag, tested and corrected together; each pair at its best lag; those with q ≤ fdr, surest first. */
export function connect(things: Thing[], o: { fdr?: number; minN?: number } = {}): Link[] {
  const fdr = o.fdr ?? CONNECT.fdr, minN = o.minN ?? CONNECT.minN;
  const dev = new Map(things.map((t) => [t.key, deviations(t.series)])), ac = new Map([...dev].map(([k, s]) => [k, lag1(s)]));
  const tests: Link[] = [];
  for (const a of things) for (const b of things) {
    if (a.key === b.key || a.role === "outcome" || b.role === "input") continue;
    for (const lag of CONNECT.lags) {
      if (lag === 0 && a.role === "both" && b.role === "both") continue; // two "both"s on one day: which way? leave it out
      const [x, y] = pairUp(dev.get(a.key)!, dev.get(b.key)!, lag);
      if (x.length < minN || new Set(x).size < 3 || new Set(y).size < 3) continue;
      const rho = spearman(x, y), ra = ac.get(a.key)!, rb = ac.get(b.key)!;
      const nEff = Math.max(4, Math.min(x.length, (x.length * (1 - ra * rb)) / (1 + ra * rb)));
      const t = rho * Math.sqrt((nEff - 2) / Math.max(1e-12, 1 - rho * rho));
      // the slope in plain units, from the raw values paired the same way (deviations would be in "off your usual" units)
      const [rx, ry] = pairUp(a.series, b.series, lag), mx = mean(rx), my = mean(ry);
      let sxy = 0, sxx = 0; for (let i = 0; i < rx.length; i++) { sxy += (rx[i] - mx) * (ry[i] - my); sxx += (rx[i] - mx) ** 2; }
      const slope = sxx ? sxy / sxx : 0, resid = rx.reduce((s, xi, i) => s + (ry[i] - my - slope * (xi - mx)) ** 2, 0);
      const se = sxx && rx.length > 2 ? Math.sqrt(resid / (rx.length - 2) / sxx) * Math.sqrt(rx.length / nEff) : 0; // widened for the days that aren't independent
      tests.push({ from: a.key, to: b.key, lag: lag as 0 | 1 | 2, rho, n: x.length, nEff, p: pT(t, nEff - 2), q: 1, slope, lo: slope - CONNECT.z90 * se, hi: slope + CONNECT.z90 * se });
    }
  }
  const qs = bh(tests.map((t) => t.p));
  tests.forEach((t, i) => (t.q = qs[i]));
  const best = new Map<string, Link>();
  for (const t of tests) { const k = `${t.from}>${t.to}`, b = best.get(k); if (!b || t.q < b.q || (t.q === b.q && Math.abs(t.rho) > Math.abs(b.rho))) best.set(k, t); }
  return [...best.values()].filter((t) => t.q <= fdr).sort((a, b) => a.q - b.q || Math.abs(b.rho) - Math.abs(a.rho));
}

const LAG_WORDS = ["the same day", "the next day", "two days on"] as const;

/**
 * Your things from the app's days (lib/insights dailyFacts, with the band's and the weather's — lib/daysband) and the band's
 * mornings. Inputs on the day they happened; sleep and the mornings on the morning they ended — so a drink in the evening
 * and the night after it meet at lag 1 on their own.
 */
export function thingsFrom(days: DayFacts[], band: { rhr?: Record<string, number>; hrv?: Record<string, number> } | null): Thing[] {
  const s = (f: (d: DayFacts) => number | null | undefined): Series => { const o: Series = {}; for (const d of days) { const v = f(d); if (v != null && Number.isFinite(v)) o[d.day] = v; } return o; };
  const logged = (f: (d: DayFacts) => number | null | undefined) => s((d) => (d.logged ? f(d) : null));
  const out: Thing[] = [
    { key: "drinks", name: "Drinks", unit: "", per: "each drink", role: "input", series: logged((d) => d.alcoholG / 14) },
    { key: "lateCaf", name: "Caffeine after 14:00", unit: "", per: "each 100 mg of caffeine after 14:00", role: "input", series: logged((d) => d.lateCaffeineMg / 100) },
    { key: "protein", name: "Protein", unit: "", per: "each 10 g of protein", role: "input", series: s((d) => (d.proteinG == null ? null : d.proteinG / 10)) },
    // food only: a drink's calories would make calories a second count of the drinks
    { key: "kcal", name: "Calories", unit: "", per: "each 100 kcal eaten", role: "input", series: s((d) => (d.kcal == null ? null : (d.kcal - (d.alcKcal ?? 0)) / 100)) },
    { key: "trained", name: "Training", unit: "", per: "a training day", role: "input", series: s((d) => (d.trained ? 1 : 0)) },
    { key: "lateEat", name: "Eating after 21:00", unit: "", per: "eating after 21:00", role: "input", series: logged((d) => (d.lateEat ? 1 : 0)) },
    { key: "steps", name: "Steps", unit: "", per: "each 1,000 steps", role: "input", series: s((d) => (d.steps == null ? null : d.steps / 1000)) },
    { key: "bedLate", name: "Bedtime", unit: "", per: "each hour later to bed", role: "input", series: s((d) => d.bedLateH) },
    // PLAN 210: how alike your last 7 nights were (lib/sleep regularityByDay)
    // PLAN 210, brought in: last night's bedroom air (Aranet), the day's places (Google Maps Timeline)
    { key: "co2", name: "Bedroom CO₂", unit: "", per: "each 100 ppm more CO₂ in the bedroom overnight", role: "input", series: s((d) => (d.co2 == null ? null : d.co2 / 100)) },
    { key: "awayH", name: "Time away from home", unit: "", per: "each hour away from home", role: "input", series: s((d) => d.awayH) },
    { key: "travelKm", name: "Travel", unit: "", per: "each 10 km travelled", role: "input", series: s((d) => (d.travelKm == null ? null : d.travelKm / 10)) },
    { key: "activeMin", name: "Walking and cycling", unit: "", per: "each 30 min walking or cycling (from Maps)", role: "input", series: s((d) => (d.activeMin == null ? null : d.activeMin / 30)) },
    { key: "awayNight", name: "A night away", unit: "", per: "a night away from home", role: "input", series: s((d) => (d.awayNight == null ? null : d.awayNight ? 1 : 0)) },
    { key: "regular", name: "Sleep regularity", unit: "", per: "each 10 points more regular sleep (last 7 nights)", role: "input", series: s((d) => (d.regular == null ? null : d.regular / 10)) },
    { key: "rain", name: "Rain", unit: "", per: "each 5 mm of rain", role: "input", series: s((d) => (d.rainMm == null ? null : d.rainMm / 5)) },
    { key: "daylight", name: "Daylight", unit: "", per: "each hour of daylight", role: "input", series: s((d) => d.daylightH) },
    { key: "asleep", name: "Sleep", unit: "h", per: "each hour asleep", role: "both", series: s((d) => (d.asleepMin == null ? null : d.asleepMin / 60)) },
    { key: "mood", name: "Mood", unit: "", role: "outcome", better: 1, series: s((d) => d.mood) },
    { key: "energy", name: "Energy", unit: "", role: "outcome", better: 1, series: s((d) => d.energy) },
    { key: "focus", name: "Focus", unit: "", role: "outcome", better: 1, series: s((d) => d.focus) },
    { key: "stress", name: "Stress", unit: "", role: "outcome", better: -1, series: s((d) => d.stress) },
    { key: "sleepRating", name: "Your sleep rating", unit: "", role: "outcome", better: 1, series: s((d) => d.sleep) },
  ];
  if (band?.hrv) out.push({ key: "hrv", name: "HRV", unit: "ms", role: "outcome", better: 1, series: { ...band.hrv } });
  if (band?.rhr) out.push({ key: "rhr", name: "Resting heart rate", unit: "bpm", role: "outcome", better: -1, series: { ...band.rhr } });
  return out;
}

/** The app's links as lines for the AI: what it found, in words, surest first. */
export const linkLines = (links: Link[], things: Thing[], n = 10): string[] => { const by = new Map(things.map((t) => [t.key, t])); return links.slice(0, n).map((l) => linkWords(l, by)); };
const fmt = (v: number) => (Math.abs(v) >= 10 ? Math.round(v).toString() : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2));
/** "Each drink goes with HRV 3.4 ms lower the next day (90 %: 2.1–4.7) · 96 days, about 61 independent · q 0.01" */
export function linkWords(l: Link, byKey: Map<string, Thing>): string {
  const a = byKey.get(l.from)!, b = byKey.get(l.to)!, s = l.slope;
  const per = a.per ?? (a.unit ? `each ${a.unit} of ${a.name.toLowerCase()}` : `more ${a.name.toLowerCase()}`);
  const bn = /^[A-Z0-9]+$/.test(b.name) ? b.name : b.name.toLowerCase();
  return `${per[0].toUpperCase()}${per.slice(1)} goes with ${bn} ${fmt(Math.abs(s))}${b.unit ? ` ${b.unit}` : ""} ${s < 0 ? "lower" : "higher"} ${LAG_WORDS[l.lag]}`
    + ` (90 %: ${fmt(Math.min(Math.abs(l.lo), Math.abs(l.hi)))}–${fmt(Math.max(Math.abs(l.lo), Math.abs(l.hi)))}${Math.sign(l.lo) !== Math.sign(l.hi) ? ", could be either way" : ""})`
    + ` · ${l.n} days, about ${Math.round(l.nEff)} independent · q ${l.q < 0.01 ? "< 0.01" : l.q.toFixed(2)}`;
}
