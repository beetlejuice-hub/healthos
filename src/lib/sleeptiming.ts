/**
 * Sleep timing (PLAN 227; owner, 24 Nov: "3" — sleep debt, a bedtime window, chronotype). From the band's nights only.
 *
 *  - **Need**: the hours-asleep window your next days went best with when that's clear or likely (lib/sleepneed); else
 *    7½ h, said as a default (adults 7–9 h). Never "you need".
 *  - **Debt**: over the last 14 nights the band has, each night's shortfall against the need, a recent night counting
 *    more (weights from 1 last night down to ½ a fortnight ago, as Rise does with its 14 nights); a long night pays some
 *    back (half its surplus). In hours, never under 0.
 *  - **Tonight's window**: your usual wake on the coming morning's kind of day (a weekday or the weekend: the median of
 *    the last 4 weeks), minus the need, your usual time to fall asleep, and up to 30 min more when there's 3 h+ debt;
 *    ±15 min.
 *  - **Chronotype** (Roenneberg's MCTQ, from tracked nights — ropensci/mctq): the middle of your sleep on free mornings
 *    (Sat/Sun), corrected for catching up (MSFsc = MSF − (SDf − SDweek)/2 when you sleep longer on free days); words
 *    from population studies (most Europeans between about 03:30 and 05:00), "earlier/later than most". Needs 4+ free
 *    and 6+ work mornings. Pure.
 */

import type { Night } from "./sleep";
import { atMinute } from "./time";

export const TIMING = { need: 7.5, nights: 14, weightOld: 0.5, payback: 0.5, extraDebtH: 3, extraMin: 30, half: 15, wakeDays: 28, minFree: 4, minWork: 6 } as const;
const H = 3_600_000;
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
/** Minutes after the evening's midnight-before (so 23:30 = 1410, 00:30 = 1470): clock times that cross midnight compare. */
const eveMin = (t: number, eve: string) => (t - atMinute(eve, 0)) / 60_000;
/** The day of the week a morning is (0 Sunday … 6 Saturday). */
const dow = (day: string) => new Date(`${day}T12:00:00`).getDay();
export const freeMorning = (day: string) => dow(day) === 0 || dow(day) === 6;
const hm = (min: number) => { const m = Math.round(((min % 1440) + 1440) % 1440); return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

/** Sleep debt in hours over the last nights before `now`. */
export function sleepDebt(ns: Night[], needH: number, now: number): { hours: number; nights: number } | null {
  const last = ns.filter((n) => !n.nap || n.asleep >= 180).filter((n) => n.up <= now && n.up > now - TIMING.nights * 24 * H).sort((a, b) => b.up - a.up);
  if (last.length < 5) return null;
  let debt = 0;
  for (const n of last) {
    const age = Math.min(TIMING.nights - 1, Math.floor((now - n.up) / (24 * H))), w = 1 - (1 - TIMING.weightOld) * (age / (TIMING.nights - 1));
    const gap = needH - n.asleep / 60;
    debt += w * (gap > 0 ? gap : gap * TIMING.payback);
  }
  return { hours: Math.max(0, Math.round(debt * 10) / 10), nights: last.length };
}

/** Tonight's bedtime window for the morning of `morningDay`; null without 5+ nights of that kind in the last 4 weeks. */
export function bedWindow(ns: Night[], needH: number, debtH: number, morningDay: string, now: number): { from: string; to: string; target: string; wake: string } | null {
  const free = freeMorning(morningDay);
  const like = ns.filter((n) => n.up <= now && n.up > now - TIMING.wakeDays * 24 * H && freeMorning(n.day) === free && n.asleep >= 180);
  if (like.length < 5) return null;
  const wake = median(like.map((n) => eveMin(n.wake, n.eve))), latency = median(like.map((n) => n.latency));
  const extra = debtH >= TIMING.extraDebtH ? TIMING.extraMin : 0;
  const target = wake - needH * 60 - latency - extra;
  return { from: hm(target - TIMING.half), to: hm(target + TIMING.half), target: hm(target), wake: hm(wake) };
}

export type Chronotype = { msf: string; msfsc: string; word: "earlier than most" | "about average" | "later than most"; free: number; work: number; jetlagMin: number };
/** Your chronotype from tracked nights (MCTQ); null without enough of both kinds of morning. */
export function chronotype(ns: Night[]): Chronotype | null {
  const ok = ns.filter((n) => n.asleep >= 180);
  const free = ok.filter((n) => freeMorning(n.day)), work = ok.filter((n) => !freeMorning(n.day));
  if (free.length < TIMING.minFree || work.length < TIMING.minWork) return null;
  const mid = (n: Night) => (eveMin(n.onset, n.eve) + eveMin(n.wake, n.eve)) / 2;
  const msf = median(free.map(mid)), msw = median(work.map(mid));
  const sdf = median(free.map((n) => n.asleep)), sdw = median(work.map((n) => n.asleep)), sdweek = (5 * sdw + 2 * sdf) / 7;
  const msfsc = sdf > sdw ? msf - (sdf - sdweek) / 2 : msf;
  // MSFsc on the clock: 1440 = 00:00 of the morning; most Europeans ~03:30–05:00 (Roenneberg 2007, n ≈ 55,000)
  const clock = msfsc - 1440, word = clock < 3.5 * 60 ? "earlier than most" : clock > 5 * 60 ? "later than most" : "about average";
  return { msf: hm(msf), msfsc: hm(msfsc), word, free: free.length, work: work.length, jetlagMin: Math.round(Math.abs(msf - msw)) };
}
