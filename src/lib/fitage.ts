/**
 * Fitness age (PLAN 177, body lab 4; owner, 27 Oct: fitness age "yes", "men"): the age at which the average healthy man
 * (or woman) has your VO2 max — the idea from Norway's HUNT study (NTNU). The norms are HUNT 3's treadmill-tested healthy
 * adults (Loe et al. 2013, PLoS ONE 8:e64319, Table 2: 1,929 men and 1,881 women, 20–90): each decade's mean VO2 max set
 * at its middle year (20–29 → 25 … 70+ → 75), and a straight line through them by least squares — about 3.7 mL/kg/min a
 * decade for men, near the paper's "approximately 3.5". A line, not the decade means joined up: the means wobble (men in
 * their 30s 49.1, 40s 47.2), and joining them would make a point of VO2 max worth 5 years at 40 and 2 at 30.
 *
 * Your band's VO2 max is Fitbit's estimate from your heart rate, not a treadmill test, and HUNT's volunteers were a fit,
 * healthy group — a high bar. So the number is a rough one; the trend, the same estimate week on week, is the part to
 * trust. What moved it: the change split as lib/vo2 splits it — fitness at the same weight, and the kilos (it's per kg) —
 * in years; resting heart rate and cardio over the same weeks alongside, without years (they go with it, nothing more). Pure.
 */

import { minutesOf, type CardioSpan } from "./cardio";
import { addDays, localDay } from "./time";
import { vo2Trend, vo2Week, type Vo2Day } from "./vo2";

export type Sex = "male" | "female";

/** HUNT 3, Loe et al. 2013, Table 2: mean VO2 max (mL/kg/min) by decade, at the decade's middle year. */
export const HUNT: Record<Sex, [age: number, vo2: number][]> = {
  male: [[25, 54.4], [35, 49.1], [45, 47.2], [55, 42.6], [65, 39.2], [75, 35.3]],
  female: [[25, 43.0], [35, 40.0], [45, 38.4], [55, 34.4], [65, 31.1], [75, 28.3]],
};

/** Ages the study covers (20–90); `weeks` drawn; `cardio` weeks averaged for "alongside". */
export const FITAGE = { min: 20, max: 90, weeks: 12, cardio: 4, rhrMin: 3 } as const;

/** The least-squares line through a sex's decade means: VO2 max = at + perYear × (age − mid). */
function line(rows: [number, number][]): { mid: number; at: number; perYear: number } {
  const mx = rows.reduce((s, [x]) => s + x, 0) / rows.length, my = rows.reduce((s, [, y]) => s + y, 0) / rows.length;
  const sxy = rows.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0), sxx = rows.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  return { mid: mx, at: my, perYear: sxy / sxx };
}
export const NORM: Record<Sex, { mid: number; at: number; perYear: number }> = { male: line(HUNT.male), female: line(HUNT.female) };

/** The age on the line at which the average has this VO2 max (not held to the study's ages). */
export const ageAt = (vo2: number, sex: Sex) => NORM[sex].mid + (vo2 - NORM[sex].at) / NORM[sex].perYear;
/** The average VO2 max at an age, on the same line. */
export const vo2At = (age: number, sex: Sex) => NORM[sex].at + NORM[sex].perYear * (age - NORM[sex].mid);
/** Years younger for each +1 of VO2 max (men ≈ 2.7). */
export const perPoint = (sex: Sex) => -1 / NORM[sex].perYear;

export type FitNum = { age: number; under: boolean; over: boolean };
/** Your fitness age, held to 20–90 — past those, "under 20" / "over 90" (the study has nobody there). */
export function fitnessAge(vo2: number, sex: Sex): FitNum {
  const a = ageAt(vo2, sex);
  return { age: Math.min(FITAGE.max, Math.max(FITAGE.min, a)), under: a < FITAGE.min, over: a > FITAGE.max };
}
export const fitWords = (f: FitNum) => (f.under ? `under ${FITAGE.min}` : f.over ? `over ${FITAGE.max}` : String(Math.round(f.age)));
const inside = (f: FitNum) => !f.under && !f.over;

export type FitWeek = { end: string; vo2: number; age: number };
export type FitChange = {
  weeks: 4 | 8; then: number; thenFit: FitNum;
  /** lib/vo2's word: under 1 point of VO2 max either way is "steady" — within the band's week-to-week wobble. */
  word: "up" | "down" | "steady";
  /** Years younger now than then, as the two ages show (whole years); null when either is past the study's ages. */
  years: number | null;
  /** Of those, at the same weight (fitness) and the kilos; null without weights logged at both ends. */
  fitness: number | null; kg: number | null; kgLost: number | null;
};
export type FitAge = {
  sex: Sex; vo2: number; fit: FitNum; you: number | null; est: boolean; per: number;
  /** Weekly medians, oldest first, the last 12 weeks that had 3+ days of VO2 max. */
  weeks: FitWeek[];
  change: FitChange | null;
  /** Over the same weeks, without years: resting heart rate (that week's median) and cardio minutes a week (4-week average). */
  rhr: [then: number, now: number] | null;
  cardio: [then: number, now: number] | null;
};

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
function rhrWeek(rhr: Record<string, number>, end: string): number | null {
  const from = addDays(end, -6), v = Object.entries(rhr).filter(([d, x]) => d >= from && d <= end && x > 25 && x < 140).map(([, x]) => x);
  return v.length >= FITAGE.rhrMin ? median(v) : null;
}
function cardioWeek(cardio: Record<string, number>, end: string): number {
  const from = addDays(end, -(7 * FITAGE.cardio - 1));
  return Object.entries(cardio).filter(([d]) => d >= from && d <= end).reduce((s, [, m]) => s + m, 0) / FITAGE.cardio;
}

/** Minutes of finished cardio by local day, for "alongside". */
export function cardioByDay(spans: CardioSpan[]): Record<string, number> {
  const by: Record<string, number> = {};
  for (const s of spans) if (!s.running) by[localDay(s.start)] = (by[localDay(s.start)] ?? 0) + minutesOf(s);
  return by;
}

const part = (n: number) => (n === 0 ? "no change" : `${Math.abs(n)} year${Math.abs(n) === 1 ? "" : "s"} ${n > 0 ? "younger" : "older"}`);
/** In a sentence, for the AI: the number, the change and its split, what went alongside. */
export function fitLine(f: FitAge): string {
  const c = f.change, who = f.sex === "male" ? "man" : "woman";
  const head = `Fitness age ${fitWords(f.fit)}${f.you != null ? ` (age ${f.you})` : ""} — the age at which the average healthy ${who} in Norway's HUNT study has this VO2 max (${f.vo2.toFixed(1)} this week, the band's estimate: trust the trend more than the number).`;
  if (!c) return head;
  const move = c.word === "steady" || c.years == null ? ` Steady over ${c.weeks} weeks (VO2 max ${c.then.toFixed(1)} → ${f.vo2.toFixed(1)}).`
    : ` ${c.weeks} weeks ago ${fitWords(c.thenFit)}: ${Math.abs(c.years)} year${Math.abs(c.years) === 1 ? "" : "s"} ${c.years > 0 ? "younger" : "older"} now${c.fitness != null ? ` — fitness at the same weight: ${part(c.fitness)}; the ${Math.abs(c.kgLost!).toFixed(1)} kg ${c.kgLost! > 0 ? "lost" : "gained"}: ${part(c.kg!)} (VO2 max is per kg)` : ""}.`;
  const along = [f.rhr && `resting heart rate ${Math.round(f.rhr[0])} → ${Math.round(f.rhr[1])} bpm`, f.cardio && `cardio ${Math.round(f.cardio[0])} → ${Math.round(f.cardio[1])} min a week`].filter(Boolean);
  return head + move + (along.length ? ` Alongside: ${along.join(", ")}.` : "");
}

/**
 * Your fitness age this week, its last 12 weeks, and what moved it over 8 weeks (4 if that's all there is). `age`: yours,
 * to set it against. `kg`: weights by day (lib/vo2 kgByDay). `rhr`: the band's resting heart rate by day. `cardio`:
 * minutes of cardio by day. Null under 3 days of VO2 max in the last week.
 */
export function fitAge(rec: Record<string, Vo2Day> | undefined, today: string, sex: Sex,
  o: { age?: number | null; kg?: Record<string, number>; rhr?: Record<string, number>; cardio?: Record<string, number> } = {}): FitAge | null {
  const t = vo2Trend(rec, today, o.kg ?? {});
  if (!t) return null;
  const fit = fitnessAge(t.now, sex), per = perPoint(sex);
  const weeks: FitWeek[] = [];
  for (let k = FITAGE.weeks - 1; k >= 0; k--) {
    const end = addDays(today, -7 * k), w = vo2Week(rec ?? {}, end);
    if (w) weeks.push({ end, vo2: w.v, age: fitnessAge(w.v, sex).age });
  }
  const c = t.changes.at(-1);
  let change: FitChange | null = null, rhr: FitAge["rhr"] = null, cardio: FitAge["cardio"] = null;
  if (c) {
    const thenFit = fitnessAge(c.then, sex), ok = inside(thenFit) && inside(fit);
    // whole years as the two ages read, so the rows add up to what's shown: the kilos' part rounded on its own (so it
    // never takes the wrong sign), fitness the rest
    const years = ok ? Math.round(thenFit.age) - Math.round(fit.age) : null;
    const kg = years != null && c.sameKg != null ? Math.round((c.delta - c.sameKg) * per) : null;
    change = { weeks: c.weeks, then: c.then, thenFit, word: c.word, years, fitness: kg != null ? years! - kg : null, kg, kgLost: c.kgLost };
    const end = addDays(today, -7 * c.weeks);
    const r0 = o.rhr ? rhrWeek(o.rhr, end) : null, r1 = o.rhr ? rhrWeek(o.rhr, today) : null;
    // only what moved: "54 → 54" says nothing (28 Oct review)
    if (r0 != null && r1 != null && Math.round(r0) !== Math.round(r1)) rhr = [r0, r1];
    if (o.cardio) { const m0 = cardioWeek(o.cardio, end), m1 = cardioWeek(o.cardio, today); if (Math.round(m0) !== Math.round(m1)) cardio = [m0, m1]; }
  }
  const you = o.age && o.age >= 12 && o.age <= 100 ? o.age : null;
  return { sex, vo2: t.now, fit, you, est: t.est, per, weeks, change, rhr, cardio };
}
