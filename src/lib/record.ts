/**
 * The record (PLAN 188 phase 3; owner, 3 Nov: "the app should find these connections autonomusly and then start tracking
 * them, and see if it was right or no"). Every connection the app tells you — a lead ("worth a look"), a Noticed finding —
 * is kept with the day it was first said, and from then on re-checked on the days since, and only those: data it was
 * never found on. The same adjusted test as Noticed (lib/detectors/effects answer: weekends, the day before and slow drift
 * taken out), on the new days alone:
 *   - checking — not enough new days yet (8 with and 8 without, or 20 for an amount);
 *   - held — the same way, and clear (its 95 % range doesn't cross zero);
 *   - didn't hold — gone the other way or to nothing, or too small to matter (its range inside the smallest effect worth
 *     telling);
 *   - holding so far — the same way, not clear yet.
 * Worked out fresh each day from all the days since, not stopped at the first good day (that would let chance through).
 * Measured (record.audit.test): the old "held 5 of 6 days since" called a chance lead confirmed about as often as a real
 * one; this one calls real ones held and chance ones not. Pure.
 */

import type { DayFacts } from "./insights";
import type { Supplement } from "./types";
import { answer, questions, type Outcome, type Question } from "./detectors/effects";
import { signals, type Pattern, type Signal } from "./scout";
import type { Finding } from "./findings";
import { difference, mean, median } from "./stats";
import type { GlanceDay } from "./glance";
import { FEATURES as PATTERN_FEATURES, type Row as PatternRow } from "./patterns";
import { addDays, dayLabel } from "./time";

/** What the app said: where it came from, the two things, which way, and the day it first said it. */
export type Claim = {
  id: string; from: "lead" | "noticed" | "pattern"; text: string;
  /** the first day it was said (it was found on the days before) */ said: string;
  /** lead: the two signals' ids; noticed: the question's id and the outcome's key */ x: string; y: string; lag: 0 | 1;
  sign: 1 | -1;
  /** a best/worst-days claim (PLAN 188): x the feature, y "worst" or "best", and the mood cut it was found with */
  cut?: number;
};
export type ClaimState = "checking" | "holding" | "held" | "didn't hold";
export type Recheck = { state: ClaimState; days: number; on: number; off: number; b: number | null; lo: number; hi: number; need: number; meanOn: number; meanOff: number; binary: boolean;
  /** the outcome's name, and the cause's (for an amount: "more alcohol than usual") */ name: string; cause: string; minEffect: number };
export const RECORD = { keep: 200, /** a best/worst-days claim: days on each side since it was said before it can say */ patternSide: 5 } as const;
export const STATE_WORDS: Record<ClaimState, string> = { checking: "checking", holding: "holding so far", held: "held", "didn't hold": "didn't hold" };

/** A lead as a claim (its id is the pattern's: the same pair stays the same claim). */
export const leadClaim = (p: Pattern, said: string): Claim => ({ id: `lead:${p.id}`, from: "lead", text: p.text, said, x: p.a.id, y: p.b.id, lag: p.lag, sign: p.sign });
/** A Noticed finding as a claim: its card (by cause and outcome) and the question it leads with (the first it covers). */
export function noticedClaim(f: Finding, said: string): Claim | null {
  const card = /^fx-(.+)-(energy|mood|focus|stress|kcal|sleep)$/.exec(f.id), q = /^fx-(.+)-(energy|mood|focus|stress|kcal|sleep)$/.exec(f.covers?.[0] ?? f.id);
  if (!card || !q) return null;
  return { id: `noticed:${card[1]}:${card[2]}`, from: "noticed", text: f.title, said, x: q[1], y: q[2], lag: 0, sign: f.value.startsWith("−") ? -1 : 1 };
}

/** A best/worst-days row as a claim: "before your lowest days, the sleep rating that morning is lower" (PLAN 188). */
export const patternClaim = (side: "worst" | "best", r: PatternRow, cut: number, said: string): Claim =>
  ({ id: `pattern:${side}:${r.f.k}`, from: "pattern", text: `Before your ${side === "worst" ? "lowest" : "best"} days: ${r.f.name.charAt(0).toLowerCase()}${r.f.name.slice(1)} ${r.diff!.value >= 0 ? "higher" : "lower"}`, said, x: r.f.k, y: side, lag: 0, sign: r.diff!.value >= 0 ? 1 : -1, cut });

/**
 * A best/worst-days claim on the days since it was said: the days with mood past the same cut against the rest, the
 * feature's difference with its range (Welch) — held when the same way and clear, didn't hold the other way or too small.
 */
export function recheckPattern(c: Claim, days: GlanceDay[]): Recheck | null {
  const f = PATTERN_FEATURES.find((x) => x.k === c.x);
  if (!f || c.cut == null) return null;
  const since = days.map((d, i) => ({ d, prev: days[i - 1] })).filter((x) => x.d.day >= c.said && x.d.mood != null);
  const inG = (m: number) => (c.y === "worst" ? m <= c.cut! : m >= c.cut!);
  const a = since.filter((x) => inG(x.d.mood!)).map((x) => f.get(x.d, x.prev)).filter((v): v is number => v != null);
  const b = since.filter((x) => !inG(x.d.mood!)).map((x) => f.get(x.d, x.prev)).filter((v): v is number => v != null);
  const all = [...a, ...b], m = all.length ? all.reduce((s, v) => s + v, 0) / all.length : 0, spread = Math.sqrt(all.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, all.length - 1)) || 1;
  const base = { days: since.length, on: a.length, off: b.length, need: Math.max(0, RECORD.patternSide - Math.min(a.length, b.length)), meanOn: mean(a), meanOff: mean(b), binary: true, name: f.name.charAt(0).toLowerCase() + f.name.slice(1), cause: c.y === "worst" ? "lowest" : "best", minEffect: 0.2 * spread };
  if (a.length < RECORD.patternSide || b.length < RECORD.patternSide) return { ...base, state: "checking", b: null, lo: NaN, hi: NaN };
  const d = difference(a, b)!, way = d.value * c.sign, clear = c.sign > 0 ? d.lo > 0 : d.hi < 0, small = d.lo > -base.minEffect && d.hi < base.minEffect;
  return { ...base, b: d.value, lo: d.lo, hi: d.hi, state: way > 0 && clear ? "held" : way <= 0 || small ? "didn't hold" : "holding" };
}

/**
 * New claims join with the day they were first said — today, unless it's known to be earlier (a lead's first showing,
 * kept since before the record) — and one already kept keeps its day. Newest last, at most RECORD.keep.
 */
export function remember(kept: Claim[], found: Claim[], today: string): Claim[] {
  const have = new Set(kept.map((c) => c.id)), add = found.filter((c) => !have.has(c.id)).map((c) => ({ ...c, said: c.said && c.said < today ? c.said : today }));
  return add.length ? [...kept, ...add].slice(-RECORD.keep) : kept;
}

const sd = (v: number[]) => { const m = mean(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, v.length - 1)); };

/** The claim as a question for the adjusted test, with the days before it was said setting the scale. */
function asQuestion(c: Claim, before: DayFacts[], supplements: Supplement[], sigs: Signal[]): { q: Question; o: Outcome } | null {
  if (c.from === "noticed") {
    const usual = (() => { const k = before.map((d) => d.kcal).filter((v): v is number => v != null); return k.length >= 7 ? median(k) : null; })();
    const q = questions(supplements, usual).find((x) => x.id === c.x), o = q?.outcomes.find((x) => x.key === c.y);
    return q && o ? { q, o } : null;
  }
  const a = sigs.find((s) => s.id === c.x), b = sigs.find((s) => s.id === c.y);
  if (!a || !b) return null;
  const ys = before.map(b.get).filter((v): v is number => v != null), xs = before.map(a.get).filter((v): v is number => v != null);
  if (ys.length < 7 || (!a.yes && xs.length < 7)) return null;
  // an amount per its usual spread; the smallest effect worth telling: a fifth of the outcome's spread
  const xm = mean(xs), xsd = sd(xs) || 1;
  const x = a.yes ? (d: DayFacts) => { const v = a.get(d); return v == null ? null : v > 0 ? 1 : 0; } : (d: DayFacts) => { const v = a.get(d); return v == null ? null : (v - xm) / xsd; };
  return { q: { id: c.id, area: "food", kind: a.yes ? "binary" : "dose", lag: c.lag, thing: a.name, phrase: a.yes ?? a.name, x, outcomes: [], group: c.id }, o: { key: b.id, name: b.name, get: b.get, minEffect: 0.2 * (sd(ys) || 1), unit: b.unit ?? "" } };
}

/** How a claim has done on the days since it was said. Null when it can't be asked any more (a supplement gone, say). */
export function recheck(c: Claim, facts: DayFacts[], supplements: Supplement[], sigs: Signal[] = signals(supplements, facts)): Recheck | null {
  if (c.from === "pattern") return null; // its own days: recheckPattern
  const before = facts.filter((d) => d.day < c.said), after = facts.filter((d) => d.day >= c.said);
  const qo = asQuestion(c, before, supplements, sigs);
  if (!qo) return null;
  const r = answer(qo.q, qo.o, after), binary = qo.q.kind === "binary";
  // an amount: the days above its usual against the rest (the test itself uses the amount as it is)
  const split = binary ? null : (() => {
    const ps = after.flatMap((d, i) => { const e = after[i + qo.q.lag], x = qo.q.x(d), y = e ? qo.o.get(e) : null; return x == null || y == null ? [] : [[x, y] as const]; });
    const hi = ps.filter(([x]) => x > 0).map(([, y]) => y), lo = ps.filter(([x]) => x <= 0).map(([, y]) => y);
    return { on: hi.length, off: lo.length, meanOn: mean(hi), meanOff: mean(lo) };
  })();
  const base = { days: after.length, on: split?.on ?? r.nOn, off: split?.off ?? r.nOff, b: r.b, lo: r.lo, hi: r.hi, need: r.need, meanOn: split?.meanOn ?? r.meanOn, meanOff: split?.meanOff ?? r.meanOff, binary, name: qo.o.name, cause: qo.q.thing.toLowerCase(), minEffect: qo.o.minEffect };
  if (r.b == null || !r.enough) return { ...base, state: "checking" };
  const way = r.b * c.sign, min = qo.o.minEffect;
  const clear = c.sign > 0 ? r.lo > 0 : r.hi < 0, small = r.lo > -min && r.hi < min;
  return { ...base, state: way > 0 && clear ? "held" : way <= 0 || small ? "didn't hold" : "holding" };
}

/**
 * "Said Tue 3 Nov · since: 9 days with, 11 without — energy 6.1 vs 6.9 · held"; an amount: "11 days with more alcohol than
 * usual, 30 with less — mood 4.6 vs 7.0". `state`: false where a chip already says it.
 */
export function recheckWords(c: Claim, r: Recheck, state = true): string {
  const when = `Said ${dayLabel(new Date(`${c.said}T12:00`).getTime())}`;
  if (c.from === "pattern") {
    if (r.state === "checking") return `${when} · checking it on the days since (${r.on} ${r.cause} days, ${r.off} others — ${RECORD.patternSide} of each before it can say)`;
    const g = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-GB") : v.toFixed(1));
    return `${when} · since: ${r.on} of your ${r.cause} days, ${r.off} others — ${r.name} ${g(r.meanOn)} vs ${g(r.meanOff)}${state ? ` · ${STATE_WORDS[r.state]}` : ""}`;
  }
  if (r.state === "checking") return `${when} · checking it on the days since (${r.binary ? `${r.on} with, ${r.off} without — 8 of each` : `${r.days} days — 20`} before it can say)`;
  const f = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-GB") : v.toFixed(1));
  const what = r.binary ? `${r.on} days with, ${r.off} without` : `${r.on} days with more ${r.cause} than usual, ${r.off} with less`;
  return `${when} · since: ${what} — ${r.name} ${f(r.meanOn)} vs ${f(r.meanOff)}${state ? ` · ${STATE_WORDS[r.state]}` : ""}`;
}

/** For the AI: what the app said lately and how each has held, so it doesn't repeat one that didn't. */
export function recordLines(kept: Claim[], facts: DayFacts[], supplements: Supplement[], today: string, days?: GlanceDay[]): string[] {
  const sigs = signals(supplements, facts);
  const rows = kept.filter((c) => c.said >= addDays(today, -120)).flatMap((c) => { const r = c.from === "pattern" ? (days ? recheckPattern(c, days) : null) : recheck(c, facts, supplements, sigs); return r ? [`- "${c.text}" — ${recheckWords(c, r)}`] : []; });
  return rows.length ? ["## What the app said, re-checked on the days since (held / didn't hold / still checking)", ...rows.slice(-12)] : [];
}
