/**
 * Balance — a rival "real burn" engine (prototype; the app still uses tdee.ts).
 *
 * tdee.ts draws one straight line through 28 days of weigh-ins and subtracts it from average
 * intake. That is right when nothing changes for four weeks. Balance instead follows you day by
 * day with a small state model, the way a navigation system follows a car:
 *
 *   real weight  m'  = m + (eaten − burn) / 7,700        ← energy balance, every day
 *   water        w'  = φ·w + noise                       ← salt, carbs, sleep: comes and goes
 *   burn         T'  = T + small drift                   ← can change (a cut, more training)
 *   unlogged     D'  = D                                 ← what un-logged days add, learned
 *   scale             = m + w + reading noise
 *
 * A Kalman filter runs forward through the days, a smoother runs back, and every number comes with
 * its own uncertainty. The three noise levels (how much your water swings, how fast it settles,
 * how much your burn drifts) are not settings: each is tried on a small grid and the versions are
 * averaged by how well they explain *your* scale readings.
 *
 * Consequences, each tested on the bench (balance.test.ts):
 * - an intake change mid-window doesn't bend the answer (each day's food is used on its own day);
 * - a burn that changes is followed, and the change is reported only when it's clear;
 * - days you didn't log aren't assumed average — the weight they caused is measured, and shown;
 * - a water spike isn't fat; typos are dropped;
 * - it answers from the first week, with an honest (wide) range, instead of nothing.
 */

import type { BodyDay } from "../tdee";
import { median, sd } from "../stats";

export const KCAL_PER_KG = 7700;

type V = number[];
type M = number[][];

const mm = (a: M, b: M): M => a.map((r) => b[0].map((_, j) => r.reduce((s, v, k) => s + v * b[k][j], 0)));
const mv = (a: M, v: V): V => a.map((r) => r.reduce((s, x, k) => s + x * v[k], 0));
const tr = (a: M): M => a[0].map((_, j) => a.map((r) => r[j]));
const add = (a: M, b: M): M => a.map((r, i) => r.map((v, j) => v + b[i][j]));
const sub = (a: M, b: M): M => a.map((r, i) => r.map((v, j) => v - b[i][j]));
const sym = (a: M): M => a.map((r, i) => r.map((v, j) => (v + a[j][i]) / 2));
function inv(a: M): M {
  const n = a.length, x = a.map((r, i) => [...r, ...r.map((_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(x[r][c]) > Math.abs(x[p][c])) p = r;
    [x[c], x[p]] = [x[p], x[c]];
    const d = x[c][c];
    for (let j = 0; j < 2 * n; j++) x[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = x[r][c]; for (let j = 0; j < 2 * n; j++) x[r][j] -= f * x[c][j]; }
  }
  return x.map((r) => r.slice(n));
}

/** One version of you: how your water and burn behave. Balance tries several and averages. */
export type Params = {
  /** Typical size of a water swing (kg, standard deviation). */
  waterKg: number;
  /** How much of today's water is still there tomorrow (0 = gone overnight). */
  phi: number;
  /** How far your burn can drift in one day (kcal, standard deviation). */
  driftKcal: number;
  /** A one-off change in burn going into this day (index), any size — or none. */
  jumpAt?: number;
};

export const GRID: Params[] = [0.15, 0.3, 0.5, 0.8].flatMap((waterKg) =>
  [0, 0.6, 0.85].flatMap((phi) => [0, 8].map((driftKcal) => ({ waterKg, phi, driftKcal }))));

/** Prior odds that your burn stepped to a new level somewhere in the history (spread over the days). */
const P_JUMP = 0.2;
/** How big a step can be, kcal (sd): wide enough for a new job or a long injury, so the data decide. */
const JUMP_KCAL = 400;
/** Steps are tried every few days, with 3 weeks before and 2 after to compare (a newer one can't be told from noise). */
const JUMP_EVERY = 3, JUMP_BEFORE = 21, JUMP_AFTER = 14;

/** The scale's own reading error (it shows 0.1 kg steps), kg. */
const READ_KG = 0.1;

export type DayKind = "logged" | "partial" | "unlogged";

export type DayOut = {
  day: string;
  /** What the scale said (null = no weigh-in), and whether it was set aside. */
  scale: number | null; outlier: "typo" | "softened" | null;
  /** Real weight (water taken out), with its standard deviation. */
  kg: number; kgSd: number;
  /** Water on top of real weight that morning. */
  water: number;
  /** Burn that day, with its standard deviation. */
  burn: number; burnSd: number;
  /** Food: what you logged, and how the day was treated. */
  logged: number | null; kind: DayKind;
};

export type Balance = {
  days: DayOut[];
  /** Burn now: kcal/day and a 90% range. */
  burn: number; lo: number; hi: number; burnSd: number;
  /** Real weight now and the water on today's reading. */
  kg: number; kgSd: number; water: number;
  /** Your usual logged day, and the burn's change over the last 28 days if it's clear. */
  usual: number;
  change: { kcal: number; from: string; clear: boolean } | null;
  /** A step in your burn the data are sure of (≥ 80%): around which day, and how big. */
  step: { day: string; kcal: number; prob: number } | null;
  /** What days you didn't fully log really looked like — measured from the weight they caused. */
  unlogged: { n: number; kcal: number; sd: number } | null;
  /** Scale readings set aside or softened. */
  dropped: number; softened: number;
  /** What Balance learned about you (the averaged noise settings), and how sure it is of each. */
  learned: { waterKg: number; settleDays: number; driftPerMonth: number };
  /**
   * Days until the 90% range is within ±100 kcal: logging like your last two weeks, and logging food
   * every day (same weigh-ins). Null = already there; Infinity = not within 4 months.
   */
  daysToTight: { asNow: number; everyDay: number } | null;
  counts: { foodDays: number; weighIns: number; span: number };
};

type Prep = { kinds: DayKind[]; u: number[]; uVar: number[]; usual: number; spread: number };

/** How each day's food enters the model. Partly logged days (under half your usual) count as unlogged. */
function prep(days: BodyDay[]): Prep | null {
  const logged = days.slice(0, -1).map((d) => d.kcal).filter((k): k is number => k != null && k > 0);
  if (logged.length < 3) return null;
  const usual = median(logged);
  const full = logged.filter((k) => k >= usual * 0.5);
  const spread = Math.max(250, full.length >= 3 ? sd(full) : 400);
  const kinds: DayKind[] = days.map((d) => (d.kcal == null || d.kcal <= 0 ? "unlogged" : d.kcal < usual * 0.5 ? "partial" : "logged"));
  // A logged day is known to ±10% (labels, portions); an unlogged one only to your usual spread.
  const u = days.map((d, i) => (kinds[i] === "logged" ? d.kcal! : usual));
  const uVar = days.map((d, i) => (kinds[i] === "logged" ? Math.max(100, 0.1 * d.kcal!) ** 2 : spread ** 2));
  return { kinds, u, uVar, usual, spread };
}

type Run = { ll: number; xs: V[]; Ps: M[]; out: ("typo" | "softened" | null)[] };

/** `future` marks days whose weigh-in is imagined (a forecast): it counts as a reading, with no surprise in it. */
function run(days: BodyDay[], p: Prep, q: Params, smooth: boolean, future = days.length): Run {
  const K = KCAL_PER_KG, n = days.length;
  const scales = days.map((d) => d.kg).filter((k): k is number => k != null);
  const mid = median(scales);
  const first = median(scales.filter((k) => Math.abs(k - mid) <= 5).slice(0, 3));
  const wVar = q.waterKg ** 2;
  let x: V = [first, 0, p.usual, 0];
  let P: M = [[4, 0, 0, 0], [0, wVar, 0, 0], [0, 0, 700 ** 2, 0], [0, 0, 0, 800 ** 2]];
  const xf: V[] = [], Pf: M[] = [], xp: V[] = [], Pp: M[] = [], Fs: M[] = [], out: Run["out"] = [];
  let ll = 0;
  for (let t = 0; t < n; t++) {
    if (t > 0) {
      const s = t - 1, g = p.kinds[s] === "logged" ? 0 : 1;
      const F: M = [[1, 0, -1 / K, g / K], [0, q.phi, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
      const Q: M = [[p.uVar[s] / K ** 2, 0, 0, 0], [0, wVar * (1 - q.phi ** 2), 0, 0], [0, 0, q.driftKcal ** 2 + (t === q.jumpAt ? JUMP_KCAL ** 2 : 0), 0], [0, 0, 0, 9]];
      x = mv(F, x); x[0] += p.u[s] / K;
      P = sym(add(mm(mm(F, P), tr(F)), Q));
      Fs[s] = F;
    }
    xp[t] = [...x]; Pp[t] = P.map((r) => [...r]);
    const y = days[t].kg;
    out[t] = null;
    if (y != null) {
      const nu = t >= future ? 0 : y - x[0] - x[1];
      let S = P[0][0] + P[1][1] + 2 * P[0][1] + READ_KG ** 2;
      const z = Math.abs(nu) / Math.sqrt(S);
      // A reading 5 sd off and 1.5 kg away is a typo or clothes: skip it. 3–5 sd: trust it less.
      if (z > 5 && Math.abs(nu) > 1.5) out[t] = "typo";
      else {
        let R = READ_KG ** 2;
        if (z > 3) { out[t] = "softened"; R += (nu / 3) ** 2 - S; S = (nu / 3) ** 2; }
        ll += -0.5 * (Math.log(2 * Math.PI * S) + nu ** 2 / S);
        const Kg = [0, 1, 2, 3].map((i) => (P[i][0] + P[i][1]) / S);
        x = x.map((v, i) => v + Kg[i] * nu);
        // Joseph form keeps P symmetric and positive.
        const IKH = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => (i === j ? 1 : 0) - Kg[i] * (j < 2 ? 1 : 0)));
        P = sym(add(mm(mm(IKH, P), tr(IKH)), Kg.map((a) => Kg.map((b) => a * b * R))));
      }
    }
    xf[t] = [...x]; Pf[t] = P.map((r) => [...r]);
  }
  if (!smooth) return { ll, xs: xf, Ps: Pf, out };
  const xs: V[] = [], Ps: M[] = [];
  xs[n - 1] = xf[n - 1]; Ps[n - 1] = Pf[n - 1];
  for (let t = n - 2; t >= 0; t--) {
    const C = mm(mm(Pf[t], tr(Fs[t])), inv(Pp[t + 1]));
    xs[t] = xf[t].map((v, i) => v + mv(C, xs[t + 1].map((s, j) => s - xp[t + 1][j]))[i]);
    Ps[t] = sym(add(Pf[t], mm(mm(C, sub(Ps[t + 1], Pp[t + 1])), tr(C))));
  }
  return { ll, xs, Ps, out };
}

/** The 90% range is within this many kcal either side before Balance calls the burn "settled". */
export const TIGHT = 100;
const Z90 = 1.645;

/**
 * Balance's answer for the days given (oldest first; give it all the history there is, today's
 * food left out). Null until there are 3 logged days and 3 weigh-ins over at least a week.
 */
export function balance(days: BodyDay[]): Balance | null {
  const p = prep(days);
  const weighIns = days.filter((d) => d.kg != null).length;
  if (!p || weighIns < 3) return null;
  const idx = days.flatMap((d, i) => (d.kg != null ? [i] : []));
  const span = idx[idx.length - 1] - idx[0] + 1;
  if (span < 7) return null;

  // Every version of you, weighted by how well it explains your scale: first how your water and
  // burn wobble, then — with the best-fitting water — whether your burn stepped on some day.
  const smooth = GRID.map((q) => ({ q, r: run(days, p, q, true), prior: (1 - P_JUMP) / GRID.length }));
  const lead = smooth.reduce((a, b) => (b.r.ll > a.r.ll ? b : a)).q;
  const at = Array.from({ length: Math.max(0, Math.floor((days.length - JUMP_BEFORE - JUMP_AFTER) / JUMP_EVERY) + 1) }, (_, k) => JUMP_BEFORE + k * JUMP_EVERY);
  const steps = at.map((jumpAt) => { const q = { ...lead, driftKcal: 0, jumpAt }; return { q, r: run(days, p, q, true), prior: P_JUMP / at.length }; });
  const runs = steps.length ? [...smooth, ...steps] : smooth.map((x) => ({ ...x, prior: 1 / GRID.length }));
  const lw = runs.map((x) => x.r.ll + Math.log(x.prior));
  const top = Math.max(...lw);
  const ws = lw.map((v) => Math.exp(v - top));
  const tot = ws.reduce((a, b) => a + b, 0);
  const w = ws.map((v) => v / tot);
  /** Mixture mean and variance of state component i on day t. */
  const mix = (t: number, i: number) => {
    let m = 0, s2 = 0;
    runs.forEach(({ r }, k) => { m += w[k] * r.xs[t][i]; s2 += w[k] * (r.Ps[t][i][i] + r.xs[t][i] ** 2); });
    return { m, sd: Math.sqrt(Math.max(0, s2 - m * m)) };
  };
  // The step, if the data say there was one: when (most likely day) and how big.
  const pStep = steps.reduce((a, _, k) => a + w[smooth.length + k], 0);
  let step: Balance["step"] = null;
  if (steps.length && pStep >= 0.8) {
    const k = steps.reduce((bi, _, i) => (w[smooth.length + i] > w[smooth.length + bi] ? i : bi), 0);
    const r = steps[k].r, j = steps[k].q.jumpAt!;
    step = { day: days[j].day, kcal: r.xs[j][2] - r.xs[j - 1][2], prob: pStep };
  }
  const best = runs[w.indexOf(Math.max(...w))].r;

  const out: DayOut[] = days.map((d, t) => {
    const kg = mix(t, 0), water = mix(t, 1), burn = mix(t, 2);
    return { day: d.day, scale: d.kg, outlier: best.out[t], kg: kg.m, kgSd: kg.sd, water: water.m, burn: burn.m, burnSd: burn.sd, logged: d.kcal, kind: p.kinds[t] };
  });
  const last = out[out.length - 1];

  // A change is "clear" only when the two days' ranges are far apart even ignoring that they share
  // data (which makes this stricter than it needs to be — on purpose, no false alarms).
  let change: Balance["change"] = null;
  if (out.length >= 29) {
    const then = out[out.length - 29];
    const diff = last.burn - then.burn;
    change = { kcal: diff, from: then.day, clear: Math.abs(diff) > 1.96 * Math.hypot(last.burnSd, then.burnSd) && Math.abs(diff) >= 100 };
  }

  const nUnl = p.kinds.slice(0, -1).filter((k) => k !== "logged").length;
  const D = mix(out.length - 1, 3);
  const unlogged = nUnl >= 4 && D.sd < 600 ? { n: nUnl, kcal: p.usual + D.m, sd: D.sd } : null;

  const learned = {
    waterKg: runs.reduce((s, { q }, k) => s + w[k] * q.waterKg, 0),
    settleDays: runs.reduce((s, { q }, k) => s + w[k] * (q.phi > 0 ? -Math.log(2) / Math.log(q.phi) : 0.5), 0),
    driftPerMonth: Math.sqrt(runs.reduce((s, { q }, k) => s + w[k] * q.driftKcal ** 2 * 30, 0)),
  };

  return {
    days: out, burn: last.burn, burnSd: last.burnSd, lo: last.burn - Z90 * last.burnSd, hi: last.burn + Z90 * last.burnSd,
    kg: last.kg, kgSd: last.kgSd, water: last.scale != null && !last.outlier ? last.scale - last.kg : last.water, usual: p.usual,
    change, step, unlogged, dropped: best.out.filter((o) => o === "typo").length, softened: best.out.filter((o) => o === "softened").length,
    learned, daysToTight: Z90 * last.burnSd <= TIGHT ? null : {
      asNow: daysToTight(days, p, { ...lead, driftKcal: 0 }, false),
      everyDay: daysToTight(days, p, { ...lead, driftKcal: 0 }, true),
    },
    counts: { foodDays: p.kinds.slice(0, -1).filter((k) => k === "logged").length, weighIns, span },
  };
}

/**
 * How many more days like your last two weeks (or with food logged every day) until the 90% range is
 * ±100 kcal, if your burn holds still (a burn that keeps drifting can never be pinned that tight). Exact, not a rule
 * of thumb: a Kalman filter's uncertainty doesn't depend on what the scale says, only on which days
 * have food and weigh-ins, so the future can be run without knowing it.
 */
function daysToTight(days: BodyDay[], p: Prep, q: Params, everyDay: boolean): number {
  const recent = days.slice(-15, -1);
  const fut: BodyDay[] = [...days];
  const pk = [...p.kinds], pu = [...p.u], pv = [...p.uVar];
  for (let k = 0; k < 120; k++) {
    const like = recent[k % recent.length];
    const kcal = everyDay ? (like.kcal != null && like.kcal >= p.usual * 0.5 ? like.kcal : p.usual) : like.kcal;
    fut.push({ day: `+${k}`, kcal, kg: like.kg });
    const kind: DayKind = kcal == null || kcal <= 0 ? "unlogged" : kcal < p.usual * 0.5 ? "partial" : "logged";
    pk.push(kind); pu.push(kind === "logged" ? kcal! : p.usual); pv.push(kind === "logged" ? Math.max(100, 0.1 * kcal!) ** 2 : p.spread ** 2);
  }
  const r = run(fut, { ...p, kinds: pk, u: pu, uVar: pv }, q, false, days.length);
  for (let t = days.length; t < fut.length; t++) if (Z90 * Math.sqrt(r.Ps[t][2][2]) <= TIGHT) return t - days.length + 1;
  return Infinity;
}

/** At a steady intake, the weekly change and its 90% range, from the burn and its uncertainty. */
export function plan(b: Pick<Balance, "burn" | "burnSd">, intake: number) {
  const wk = ((intake - b.burn) * 7) / KCAL_PER_KG, s = (b.burnSd * 7) / KCAL_PER_KG;
  return { kgPerWeek: wk, lo: wk - Z90 * s, hi: wk + Z90 * s };
}

/** The steady intake that gives a chosen weekly change (e.g. −0.5 kg/week). */
export const intakeFor = (b: Pick<Balance, "burn">, kgPerWeek: number) => b.burn + (kgPerWeek * KCAL_PER_KG) / 7;
