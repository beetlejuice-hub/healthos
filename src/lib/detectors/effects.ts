/**
 * The effect engine (Noticed phase 2): what moves your energy, mood, focus, stress — and your
 * eating — asked of your own days, every question held to the same bar:
 *
 *  1. pairs: the thing on day d, the outcome on day d (lag 0) or d+1 (lag 1); both logged;
 *  2. a fair comparison: outcome = thing + weekend + yesterday's outcome + slow drift (OLS);
 *  3. enough data (8 days with and 8 without, or 20 pairs for amounts);
 *  4. big enough to matter (0.5 points on a 1–10 scale; 150 kcal);
 *  5. false alarms controlled across every question at once (Benjamini–Hochberg, 10%);
 *  6. replication: same direction in the first and the second half of the days.
 *
 * Answers: a finding, a "no effect" (enough data, any effect too small to matter), or still
 * checking with what would settle it. Plan: the "HealthOS — Noticed phase 2" doc.
 */

import type { DayFacts } from "../insights";
import type { Supplement } from "../types";
import type { Area, Checking, Finding, Quiet } from "../findings";
import { bh, ols, tCrit } from "../regress";
import { mean, median, perGroupFor } from "../stats";

export type Outcome = { key: string; name: string; get: (d: DayFacts) => number | null; minEffect: number; unit: string };
export type Question = {
  id: string; area: Area; kind: "binary" | "dose"; lag: 0 | 1;
  /** Short name for lists: "Caffeine after 14:00". */
  thing: string;
  /** Binary: "The day after 2+ drinks". Dose: the unit, "100 mg of caffeine after 14:00". */
  phrase: string;
  x: (d: DayFacts) => number | null;
  outcomes: Outcome[];
  /** Questions sharing a group answer the same thing two ways; only the stronger is shown. */
  group: string;
  /** Binary questions: how to call the two kinds of day, for "2 more rest days". */
  more?: [string, string];
  adjustWeekend?: boolean;
};

const FEEL: Outcome[] = (["energy", "mood", "focus", "stress"] as const).map((k) => ({ key: k, name: k, get: (d: DayFacts) => d[k], minEffect: 0.5, unit: "points" }));
const KCAL: Outcome = { key: "kcal", name: "calories", get: (d) => d.kcal, minEffect: 150, unit: "kcal" };

export const MIN_EACH = 8, MIN_PAIRS = 20;

/** The questions, given your stack and your usual calories. */
export function questions(supplements: Supplement[], usualKcal: number | null): Question[] {
  const ifLogged = (f: (d: DayFacts) => number) => (d: DayFacts) => (d.logged ? f(d) : null);
  const qs: Question[] = [
    { id: "late-caf", group: "late-caf", area: "caffeine", kind: "binary", lag: 1, thing: "Caffeine after 14:00", phrase: "The day after caffeine past 14:00", x: ifLogged((d) => (d.lateCaffeineMg > 0 ? 1 : 0)), outcomes: FEEL, more: ["days with coffee after 14:00", "days without coffee after 14:00"] },
    { id: "late-caf-mg", group: "late-caf", area: "caffeine", kind: "dose", lag: 1, thing: "Caffeine after 14:00 (mg)", phrase: "100 mg of caffeine after 14:00", x: ifLogged((d) => d.lateCaffeineMg / 100), outcomes: FEEL },
    { id: "caf-bed", group: "late-caf", area: "caffeine", kind: "dose", lag: 1, thing: "Caffeine left at bedtime", phrase: "50 mg of caffeine left at bedtime", x: ifLogged((d) => d.caffeineAtBed / 50), outcomes: FEEL },
    { id: "caf-total", group: "caf-total", area: "caffeine", kind: "dose", lag: 0, thing: "Caffeine that day", phrase: "100 mg of caffeine", x: ifLogged((d) => d.caffeineMg / 100), outcomes: FEEL },
    { id: "alc-2", group: "alc", area: "caffeine", kind: "binary", lag: 1, thing: "2+ drinks", phrase: "The day after 2+ drinks", x: (d) => (!d.logged ? null : d.alcoholG >= 28 ? 1 : d.alcoholG === 0 ? 0 : null), outcomes: FEEL, more: ["evenings with 2+ drinks", "evenings without a drink"] },
    { id: "alc-drink", group: "alc", area: "caffeine", kind: "dose", lag: 1, thing: "Drinks (each)", phrase: "drink (14 g of alcohol)", x: ifLogged((d) => d.alcoholG / 14), outcomes: FEEL },
    { id: "gym", group: "gym", area: "training", kind: "binary", lag: 0, thing: "Gym day", phrase: "On gym days", x: (d) => (d.trained ? 1 : 0), outcomes: [...FEEL, KCAL], more: ["gym days", "rest days"] },
    { id: "gym-next", group: "gym-next", area: "training", kind: "binary", lag: 1, thing: "Day after the gym", phrase: "The day after the gym", x: (d) => (d.trained ? 1 : 0), outcomes: FEEL, more: ["gym days", "rest days"] },
    { id: "volume", group: "gym-next", area: "training", kind: "dose", lag: 1, thing: "Training volume", phrase: "tonne lifted", x: (d) => d.volumeKg / 1000, outcomes: FEEL },
    { id: "late-eat", group: "late-eat", area: "food", kind: "binary", lag: 1, thing: "Eating after 21:00", phrase: "The day after eating past 21:00", x: (d) => (d.kcal == null ? null : d.lateEat ? 1 : 0), outcomes: FEEL, more: ["days eating past 21:00", "days without late eating"] },
    { id: "protein", group: "protein", area: "food", kind: "dose", lag: 1, thing: "Protein", phrase: "30 g of protein", x: (d) => (d.proteinG == null ? null : d.proteinG / 30), outcomes: FEEL },
    { id: "weekend", group: "weekend", area: "food", kind: "binary", lag: 0, thing: "Weekend", phrase: "On weekends", x: (d) => (d.weekend ? 1 : 0), outcomes: [KCAL], adjustWeekend: false },
  ];
  if (usualKcal) qs.push({ id: "kcal-dev", group: "kcal-dev", area: "food", kind: "dose", lag: 1, thing: "Calories vs your usual", phrase: "500 kcal above your usual", x: (d) => (d.kcal == null ? null : (d.kcal - usualKcal) / 500), outcomes: FEEL });
  // Every supplement, paused or out included: out-of-stock days are exactly the "off" days that answer the question.
  for (const s of supplements) {
    qs.push({ id: `supp-${s.id}`, group: `supp-${s.id}`, area: "stack", kind: "binary", lag: 1, thing: s.name, phrase: `The day after taking ${s.name}`, x: (d) => (!d.stackAnswered ? null : d.taken.has(s.id) ? 1 : 0), outcomes: FEEL, more: [`days taking ${s.name}`, `days skipping ${s.name}`] });
  }
  return qs;
}

export type Result = {
  q: Question; o: Outcome;
  n: number; nOn: number; nOff: number;
  /** Adjusted effect (binary: on − off; dose: per unit), its 95% range, p. Null when not enough data. */
  b: number | null; lo: number; hi: number; p: number; sigma: number;
  meanOn: number; meanOff: number;
  replicated: boolean;
  enough: boolean;
  /** More days needed to settle it (with / without, or pairs). */
  need: number;
  status: "found" | "none" | "checking";
};

/** One question × outcome, before the family-wide correction. */
export function answer(q: Question, o: Outcome, facts: DayFacts[]): Omit<Result, "status"> {
  const rows: { x: number; y: number; prev: number | null; w: number; t: number }[] = [];
  facts.forEach((d, i) => {
    const j = i + q.lag, dj = facts[j];
    if (!dj) return;
    const x = q.x(d), y = o.get(dj);
    if (x == null || y == null) return;
    rows.push({ x, y, prev: j > 0 ? o.get(facts[j - 1]) : null, w: dj.weekend ? 1 : 0, t: j / facts.length });
  });
  const n = rows.length, nOn = rows.filter((r) => r.x > 0).length, nOff = n - nOn;
  const on = rows.filter((r) => r.x > 0).map((r) => r.y), off = rows.filter((r) => r.x === 0).map((r) => r.y);
  const base = { q, o, n, nOn, nOff, meanOn: mean(on), meanOff: mean(off) };
  const enough = q.kind === "binary" ? nOn >= MIN_EACH && nOff >= MIN_EACH : n >= MIN_PAIRS && nOn >= 5;
  const spread = (() => { const ys = rows.map((r) => r.y); const m = mean(ys); return Math.sqrt(ys.reduce((a, y) => a + (y - m) ** 2, 0) / Math.max(1, ys.length - 1)) || 1; })();
  // Days needed to see a clearly noticeable effect (2 × the smallest one worth telling) reliably.
  const needFor = (sigma: number) => (q.kind === "binary" ? Math.max(MIN_EACH, perGroupFor(2 * o.minEffect, sigma)) - Math.min(nOn, nOff) : Math.max(0, MIN_PAIRS - n));
  if (!enough) return { ...base, b: null, lo: NaN, hi: NaN, p: 1, sigma: spread, replicated: false, enough, need: Math.max(1, needFor(spread)) };

  const yMean = mean(rows.map((r) => r.y));
  const adjustW = q.adjustWeekend !== false;
  const design = (r: (typeof rows)[number], full: boolean) => [1, r.x, ...(adjustW ? [r.w] : []), ...(full ? [r.prev ?? yMean, r.t] : [])];
  const fit = ols(rows.map((r) => design(r, true)), rows.map((r) => r.y)) ?? ols(rows.map((r) => design(r, false)), rows.map((r) => r.y));
  if (!fit) return { ...base, b: null, lo: NaN, hi: NaN, p: 1, sigma: spread, replicated: false, enough: false, need: 1 };
  const b = fit.coef[1], se = fit.se[1], tc = tCrit(fit.df);
  // Replication: the same direction in each half of the days (simpler model: fewer rows).
  const half = Math.floor(n / 2);
  const halves = [rows.slice(0, half), rows.slice(half)].map((h) => ols(h.map((r) => design(r, false)), h.map((r) => r.y)));
  const replicated = halves.every((h) => h != null && Math.sign(h.coef[1]) === Math.sign(b));
  return { ...base, b, lo: b - tc * se, hi: b + tc * se, p: fit.p[1], sigma: fit.sigma, replicated, enough, need: Math.max(0, needFor(fit.sigma)) };
}

/** Every question, the false-alarm correction across all of them, and the verdicts. */
export function runAll(qs: Question[], facts: DayFacts[], q = 0.1): Result[] {
  const raw = qs.flatMap((qq) => qq.outcomes.map((o) => answer(qq, o, facts)));
  const tested = raw.filter((r) => r.b != null);
  const pass = bh(tested.map((r) => r.p), q);
  return raw.map((r) => {
    const i = tested.indexOf(r);
    const small = r.b != null && Math.abs(r.b) >= r.o.minEffect;
    if (i >= 0 && pass[i] && small && r.replicated) return { ...r, status: "found" };
    if (r.b != null && r.lo > -r.o.minEffect && r.hi < r.o.minEffect) return { ...r, status: "none" };
    return { ...r, status: "checking" };
  });
}

const f1 = (v: number) => Math.abs(v).toFixed(1);
const r10 = (v: number) => Math.round(Math.abs(v) / 10) * 10;

function title(r: Result): string {
  const b = r.b!, dir = b > 0 ? "higher" : "lower";
  if (r.o.key === "kcal") return `${r.q.phrase}, you eat about ${r10(b)} kcal ${b > 0 ? "more" : "less"}`;
  if (r.q.kind === "binary") return `${r.q.phrase}, your ${r.o.name} is ${f1(b)} points ${dir}`;
  return `Each ${r.q.phrase} goes with ${r.q.lag ? "next-day" : "same-day"} ${r.o.name} ${f1(b)} ${r.o.unit} ${dir}`;
}

export function toFinding(r: Result): Finding {
  const b = r.b!, sure = Math.min(99, Math.round((1 - r.p) * 100));
  const unit = r.o.key === "kcal" ? "kcal" : "points";
  const fmt = (v: number) => (r.o.key === "kcal" ? Math.round(v).toLocaleString("en-GB") : v.toFixed(1));
  const range = `${r.lo >= 0 ? "+" : "−"}${fmt(Math.abs(r.lo))} to ${r.hi >= 0 ? "+" : "−"}${fmt(Math.abs(r.hi))}`;
  return {
    id: `fx-${r.q.id}-${r.o.key}`, area: r.q.area, title: title(r),
    value: `${b >= 0 ? "+" : "−"}${fmt(Math.abs(b))}`, unit: r.q.kind === "dose" ? `${unit} per ${r.q.phrase.split(/ of | \(| lifted| above/)[0]}` : unit,
    detail: r.q.kind === "binary"
      ? `${fmt(r.meanOn)} vs ${fmt(r.meanOff)} on average, compared fairly: weekends, the day before and slow changes over time are taken out.`
      : `Across ${r.n} days, compared fairly: weekends, the day before and slow changes over time are taken out.`,
    evidence: `${r.q.kind === "binary" ? `${r.nOn} days with, ${r.nOff} without` : `${r.n} days`} · 95% range ${range} · ${sure}% sure · held up in both halves of your data`,
    sure: `${sure}% sure`,
    weight: 0.6 + Math.min(0.25, Math.abs(b) / r.o.minEffect / 20),
    chart: r.q.kind === "binary" ? { kind: "compare", labels: ["with", "without"], values: [r.meanOn, r.meanOff], ns: [r.nOn, r.nOff], unit } : undefined,
  };
}

export type EffectReport = { found: Finding[]; none: Quiet[]; checking: Checking[] };

/** Findings (the stronger of two answers to the same thing), quiet "no effect"s, and what to do next. */
export function effectFindings(facts: DayFacts[], supplements: Supplement[]): EffectReport {
  const usual = (() => { const k = facts.map((d) => d.kcal).filter((x): x is number => x != null); return k.length >= 7 ? median(k) : null; })();
  const results = runAll(questions(supplements, usual), facts);
  const best = new Map<string, Result>();
  for (const r of results.filter((x) => x.status === "found")) {
    const key = `${r.q.group}:${r.o.key}`;
    if (!best.has(key) || r.p < best.get(key)!.p) best.set(key, r);
  }
  // One card per cause: the strongest outcome leads, the others are listed on it (eating is its own card).
  const cards = new Map<string, Result[]>();
  for (const r of best.values()) { const k = `${r.q.group}:${r.o.key === "kcal" ? "kcal" : "feel"}`; cards.set(k, [...(cards.get(k) ?? []), r]); }
  const found = [...cards.values()].map((rs) => {
    const sorted = [...rs].sort((a, b) => Math.abs(b.b!) / b.o.minEffect - Math.abs(a.b!) / a.o.minEffect);
    const lead = toFinding(sorted[0]);
    const others = sorted.slice(1).map((r) => `${r.o.name} ${r.b! > 0 ? "+" : "−"}${Math.abs(r.b!).toFixed(1)}${r.q.id !== sorted[0].q.id ? ` (${r.q.kind === "dose" ? `per ${r.q.phrase}` : r.q.thing.toLowerCase()})` : ""}`);
    return { ...lead, id: `fx-${sorted[0].q.group}-${sorted[0].o.key}`, covers: rs.map((r) => `fx-${r.q.id}-${r.o.key}`), detail: others.length ? `Also ${others.join(", ")}. ${lead.detail}` : lead.detail };
  });
  const none = results.filter((r) => r.status === "none" && !best.has(`${r.q.group}:${r.o.key}`) && r.q.kind === "binary")
    .map((r) => ({ id: `none-${r.q.id}-${r.o.key}`, text: `${r.q.thing} → ${r.q.lag ? "next-day " : ""}${r.o.name}: no effect bigger than ${(Math.max(Math.abs(r.lo), Math.abs(r.hi))).toFixed(r.o.key === "kcal" ? 0 : 1)} ${r.o.unit} (${r.n} days)` }));
  // Still checking: the closest few, each with what would settle it; ratings are the usual gap.
  const rated = facts.filter((d) => d.energy != null || d.mood != null || d.focus != null || d.stress != null).length;
  const checking: Checking[] = [];
  if (rated < 2 * MIN_EACH + 4) checking.push({ id: "fx-ratings", area: "stack", question: "What moves your energy, mood, focus and stress?", progress: rated / (2 * MIN_EACH + 4), missing: `rate your day on ${2 * MIN_EACH + 4 - rated} more evenings — most answers unlock from there` });
  else {
    const open = results.filter((r) => r.status === "checking" && r.need > 0 && r.q.kind === "binary" && r.o.key !== "kcal" && !best.has(`${r.q.group}:${r.o.key}`));
    const byQ = new Map<string, Result>();
    for (const r of open) if (!byQ.has(r.q.id) || r.need < byQ.get(r.q.id)!.need) byQ.set(r.q.id, r);
    // The shortcut first: a supplement you take every day can only be answered by skipping it a bit.
    const stuck = (r: Result) => r.q.id.startsWith("supp-") && r.nOff < r.nOn;
    const pick = [...byQ.values()].sort((a, b) => Number(stuck(b)) - Number(stuck(a)) || a.need - b.need).slice(0, 3);
    for (const r of pick) {
      const few = Math.min(r.nOn, r.nOff), side = r.nOff < r.nOn ? 1 : 0;
      const days = (n: number, what: string) => `${n} more ${n === 1 ? what.replace(/^days|^evenings/, (w) => w.slice(0, -1)) : what}`;
      const how = stuck(r) ? `${r.need} days without ${r.q.thing} — skip it on days you choose; it's the only way to see what it does` : r.q.more ? days(r.need, r.q.more[side]) : `${r.need} more days`;
      checking.push({ id: `fx-${r.q.id}`, area: r.q.area, question: `${r.q.thing}: does it change how you feel?`, progress: Math.min(0.95, few / (few + r.need)), missing: how });
    }
  }
  return { found, none, checking };
}
