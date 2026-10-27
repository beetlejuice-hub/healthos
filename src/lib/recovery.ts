/**
 * The recovery clock (PLAN 177; owner, 27 Oct: "recovery clock after a night out" — "YES"). The morning after a night out:
 * what it did to last night (sleeping heart rate, HRV, deep sleep against your usual nights), when you're likely back to
 * usual — from your own past nights out: how long until HRV and resting heart rate were back in your usual range — and,
 * once there are enough of them, what got you back faster (a walk before noon, protein early, coffee by 13:00) and how
 * your lifts went the day after. Only your own history; nothing it can't back with your numbers. Pure.
 */

import type { HrMinute, StepBucket } from "./band";
import { alcoholDoses, caffeineDoses } from "./insights";
import type { Night } from "./sleep";
import { firstAt, usual, type Range } from "./sleep";
import { SMOKE_MID, smokeSaid } from "./smoke";
import { median, quantile } from "./stats";
import { atMinute, localDay, minuteOfDay } from "./time";
import type { Entry } from "./types";

/**
 * drinksG: 2 standard drinks of alcohol make it a night out; lateBedH: or a smoking day with bed this much past your
 * usual. base: the usual is the normal nights (not nights out) among the last this many. minPast: past nights out
 * before the app gives a "back by"; minEach: nights with and without a factor before it names it; gainH: the least gain
 * worth saying; within: mornings looked at for "back to usual".
 */
export const RECOVERY = { drinksG: 28, lateBedH: 2, base: 30, minPast: 2, minEach: 2, gainH: 3, within: 4, walkSteps: 2000, proteinG: 30, coffeeBy: 13 * 60 } as const;

/** What the evening held, by its day (`Night.eve`): alcohol grams and the drinks as logged (4 beers are 4, not 5.7 standard drinks), cigarettes as answered. */
export type EveningOut = { alcoholG: number; drinks: number; cigs: number | null };
/** The morning after, by its day (`Night.day`): steps before noon, protein before 11:00, the last coffee's minute of day. */
export type DayAfter = { stepsBeforeNoon: number | null; proteinBefore11: number | null; lastCoffeeMin: number | null };

const H = 3_600_000;
const bedHour = (n: Night) => { const d = new Date(n.bed); const h = d.getHours() + d.getMinutes() / 60; return h < 12 ? h + 24 : h; };

/** A night out: 2+ drinks that evening, or a smoking day with bed 2 h or more past your usual. */
export function isNightOut(n: Night, ev: EveningOut | undefined, usualBedH: number | null): boolean {
  if (!ev) return false;
  if (ev.alcoholG >= RECOVERY.drinksG) return true;
  return (ev.cigs ?? 0) > 0 && usualBedH != null && bedHour(n) - usualBedH >= RECOVERY.lateBedH;
}

export type Usual = { hrv: Range | null; rhr: Range | null; meanHr: Range | null; deep: Range | null; bedH: number | null;
  /** Where 8 in 10 of your usual mornings sit: HRV at least this, resting HR at most this. */ hrvFloor: number | null; rhrCeil: number | null };

/**
 * Your usual nights: the last 30 that weren't a night out or one of the 2 after one (still recovering isn't usual) —
 * quartiles of HRV, resting HR, sleeping HR and deep sleep, and the 10th / 90th percentile "back to usual" is judged by.
 */
export function usualNights(ns: Night[], out: Set<string>): Usual {
  const sorted = [...ns].sort((a, b) => a.bed - b.bed), after = new Set<string>();
  sorted.forEach((n, i) => { if (out.has(n.id)) for (let k = 1; k <= 2 && i + k < sorted.length; k++) after.add(sorted[i + k].id); });
  const normal = sorted.filter((n) => !out.has(n.id) && !after.has(n.id)).slice(-RECOVERY.base);
  const beds = normal.map(bedHour), hrvs = normal.flatMap((n) => (n.hrv == null ? [] : [n.hrv])), rhrs = normal.flatMap((n) => (n.rhr == null ? [] : [n.rhr]));
  return { hrv: usual(hrvs), rhr: usual(rhrs), meanHr: usual(normal.map((n) => n.meanHr)), deep: usual(normal.map((n) => n.deep)), bedH: beds.length >= 5 ? median(beds) : null,
    hrvFloor: hrvs.length >= 5 ? quantile(hrvs, 0.1) : null, rhrCeil: rhrs.length >= 5 ? quantile(rhrs, 0.9) : null };
}

/**
 * A morning back to usual: HRV and resting HR where 8 in 10 of your usual mornings are (whichever are known) — not the
 * quartiles: a quarter of ordinary mornings sit outside those, and half of them would never count as "back" (27 Oct).
 */
export function backToUsual(n: Night, u: Usual): boolean | null {
  const hrv = n.hrv != null && u.hrvFloor != null ? n.hrv >= u.hrvFloor : null, rhr = n.rhr != null && u.rhrCeil != null ? n.rhr <= u.rhrCeil : null;
  if (hrv == null && rhr == null) return null;
  return (hrv ?? true) && (rhr ?? true);
}

/**
 * Hours from bed on the night out to waking on the first morning back to usual — that night itself (it shrugged it off)
 * or one of the next 4; null when it isn't known, or another night out came first.
 */
export function recoveryHours(i: number, ns: Night[], out: Set<string>, u: Usual): number | null {
  const e = ns[i];
  for (let k = i; k < Math.min(ns.length, i + 1 + RECOVERY.within); k++) {
    if (k > i && out.has(ns[k].id)) return null;
    const b = backToUsual(ns[k], u);
    if (b == null) return null;
    if (b) return (ns[k].wake - e.bed) / H;
  }
  return null;
}

export type Hit = { meanHr: number | null; hrv: number | null; hrvUsual: number | null; deep: number | null; deepUsual: number | null };
const r0 = (v: number) => Math.round(v);
/** Last night against your usual: sleeping heart rate (+bpm), HRV and deep sleep with their usuals. */
export const hitOf = (n: Night, u: Usual): Hit => ({
  meanHr: n.meanHr != null && u.meanHr ? r0(n.meanHr - u.meanHr.mid) : null,
  hrv: n.hrv != null ? r0(n.hrv) : null, hrvUsual: u.hrv ? r0(u.hrv.mid) : null,
  deep: n.deep != null ? r0(n.deep) : null, deepUsual: u.deep ? r0(u.deep.mid) : null,
});

export type Factor = { id: "walk" | "protein" | "coffee"; name: string; gainH: number; with: number; without: number };
const FACTORS: { id: Factor["id"]; name: string; has: (d: DayAfter) => boolean | null }[] = [
  { id: "walk", name: "A walk before noon", has: (d) => (d.stepsBeforeNoon == null ? null : d.stepsBeforeNoon >= RECOVERY.walkSteps) },
  { id: "protein", name: "30 g+ protein before 11:00", has: (d) => (d.proteinBefore11 == null ? null : d.proteinBefore11 >= RECOVERY.proteinG) },
  { id: "coffee", name: "Last coffee by 13:00", has: (d) => (d.lastCoffeeMin == null ? null : d.lastCoffeeMin <= RECOVERY.coffeeBy) },
];

export type Recovery = {
  night: Night; drinks: number; cigs: number | null; hit: Hit;
  /** Hours from bed to back to usual, typical for you (null: fewer than 2 past nights out to go by). */
  typicalH: number | null; past: number;
  /** When you're likely back to usual, and how far along you are now (0–1). Null with no typical. */
  backAt: number | null; done: number | null;
  /** Already back this morning: last night didn't knock you off your usual. */
  shrugged: boolean;
  factors: Factor[];
  /** Your lifts the day after a night out, against your other sessions (% of your trend), from 2+ such sessions. */
  lifts: { pct: number; n: number } | null;
  /** Every night out held (ids): your usual night heart rate is drawn without them. */
  out: string[];
};

/**
 * The morning after: null unless the newest night woke you `today` and its evening was a night out. `evenings` by the
 * night's eve, `after` by its day; `sessions`: each workout's day and its strength against your trend (lib/liftstrength).
 */
export function recoveryNow(ns: Night[], evenings: Map<string, EveningOut>, after: Map<string, DayAfter>, sessions: { day: string; pct: number | null }[], today: string, now: number): Recovery | null {
  const sorted = [...ns].sort((a, b) => a.bed - b.bed), last = sorted.at(-1);
  if (!last || last.day !== today) return null;
  const pre = usualNights(sorted, new Set());
  const out = new Set(sorted.filter((n) => isNightOut(n, evenings.get(n.eve), pre.bedH)).map((n) => n.id));
  if (!out.has(last.id)) return null;
  const u = usualNights(sorted, out), ev = evenings.get(last.eve)!;
  // past nights out, each with its hours back to usual
  const past = sorted.slice(0, -1).map((n, i) => ({ n, h: out.has(n.id) ? recoveryHours(i, sorted, out, u) : null })).filter((x): x is { n: Night; h: number } => x.h != null);
  // the lower middle, an hours-back one of them actually took: back to usual is only seen on waking, and the plain median
  // of a 29.5 h and a 53.5 h night out is an evening no morning was ever back on
  const typicalH = past.length >= RECOVERY.minPast ? [...past.map((x) => x.h)].sort((a, b) => a - b)[Math.floor((past.length - 1) / 2)] : null;
  const shrugged = backToUsual(last, u) === true;
  const backAt = typicalH != null && !shrugged ? last.bed + typicalH * H : null;
  const done = backAt != null ? Math.max(0, Math.min(1, (now - last.bed) / (backAt - last.bed))) : null;
  // what got you back faster: past nights out with it vs without, each side 2+, a gain of 3 h or more
  const factors: Factor[] = FACTORS.flatMap((f) => {
    const w: number[] = [], wo: number[] = [];
    for (const x of past) { const d = after.get(x.n.day), has = d ? f.has(d) : null; if (has === true) w.push(x.h); else if (has === false) wo.push(x.h); }
    if (w.length < RECOVERY.minEach || wo.length < RECOVERY.minEach) return [];
    const gainH = median(wo) - median(w);
    return gainH >= RECOVERY.gainH ? [{ id: f.id, name: f.name, gainH: Math.round(gainH), with: w.length, without: wo.length }] : [];
  }).sort((a, b) => b.gainH - a.gainH);
  const outDays = new Set(sorted.filter((n) => out.has(n.id)).map((n) => n.day));
  const afterOut = sessions.filter((s) => s.pct != null && outDays.has(s.day) && s.day !== today), others = sessions.filter((s) => s.pct != null && !outDays.has(s.day));
  const lifts = afterOut.length >= 2 && others.length >= 2 ? { pct: Math.round(median(afterOut.map((s) => s.pct!)) - median(others.map((s) => s.pct!))), n: afterOut.length } : null;
  return { night: last, drinks: ev.drinks, cigs: ev.cigs, hit: hitOf(last, u), typicalH, past: past.length, backAt, done, shrugged, factors, lifts, out: [...out] };
}

/**
 * What each night's evening held and what the morning after did, from the log and the band. Drinks from noon on the
 * evening to bed (the Sleep grid's window); cigarettes as answered (the middle of the band), unknown when not asked.
 * Steps before noon only when the band was worn that morning (an hour of heart rate between 08:00 and 12:00); protein
 * before 11:00 only on a day with food logged (nothing before 11 is then 0 g); the last coffee only on a day with
 * anything logged (none that day counts as by 13:00).
 */
export function recoveryInputs(ns: Night[], entries: Entry[], steps: StepBucket[], hr: HrMinute[]): { evenings: Map<string, EveningOut>; after: Map<string, DayAfter> } {
  const drinks = alcoholDoses(entries), smoke = smokeSaid(entries), cafs = caffeineDoses(entries);
  const logged = new Set<string>(), food = new Map<string, { at: number; p: number }[]>();
  for (const e of entries) {
    const d = localDay(e.at);
    if (e.kind !== "answer") logged.add(d);
    if (e.kind === "food") (food.get(d) ?? food.set(d, []).get(d)!).push({ at: e.at, p: e.macros.p });
  }
  // steps before noon by day, in one pass (the band can send a bucket a minute: 130k over 90 days)
  const morning = new Map<string, number>();
  for (const [t, , c] of steps) if (minuteOfDay(t) < 12 * 60) { const d = localDay(t); morning.set(d, (morning.get(d) ?? 0) + c); }
  const evenings = new Map<string, EveningOut>(), after = new Map<string, DayAfter>();
  for (const n of ns) {
    const from = atMinute(n.eve, 12 * 60), b = smoke.get(n.eve);
    const had = drinks.filter((d) => d.at >= from && d.at < n.bed);
    evenings.set(n.eve, { alcoholG: had.reduce((a, d) => a + d.g, 0), drinks: had.length, cigs: b != null ? SMOKE_MID[b] : null });
    const d = n.day, noon = atMinute(d, 12 * 60);
    let worn = 0;
    for (let j = firstAt(hr, atMinute(d, 8 * 60)); j < hr.length && hr[j][0] < noon; j++) worn++;
    const fs = food.get(d), cs = cafs.filter((c) => localDay(c.at) === d);
    after.set(d, {
      stepsBeforeNoon: worn >= 60 ? morning.get(d) ?? 0 : null,
      proteinBefore11: fs ? fs.filter((f) => f.at < atMinute(d, 11 * 60)).reduce((a, f) => a + f.p, 0) : null,
      lastCoffeeMin: logged.has(d) ? (cs.length ? Math.max(...cs.map((c) => minuteOfDay(c.at))) : 0) : null,
    });
  }
  return { evenings, after };
}
