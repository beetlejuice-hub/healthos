/**
 * A night out of 100 (PLAN 97; owner, 14 Oct: "should do a 100/… pointing for my sleep based on all the sleep data, length,
 * etc i get and also add in my rating"). Pure. Made of parts you can see, each with its points and why:
 *
 *   Length 35      asleep against your need: full from NEED_H (7 h, the bottom of the 7–9 h most adults need), 12.5 a
 *                  missing hour; past 10 h a little off. The biggest part: a 5-hour night, all else perfect and unrated,
 *                  is 69 — "okay", not "good" (with 30 and 10 an hour it was 75).
 *   Deep 10        its share of the time asleep: full from 13 %.
 *   REM 10         its share: full from 20 %.
 *   Restful 10     awake in the night: full up to 15 min, none from 75.
 *   Fell asleep 5  full within 20 min, none from 60.
 *   Timing 5       bedtime against your usual: full within 45 min, none from 2 h 30.
 *   Heart 5        HRV that morning against your usual (full at it, none at 80 % of it) — or, without HRV, the lowest
 *                  heart rate asleep against your usual (full at or under it, none 8 bpm over).
 *   Your rating 20 what you said the next morning, out of 10.
 *
 * A part that isn't known (no rating yet, no stages, too few nights for a usual) is left out and the rest scaled to 100 —
 * and `left` says which, so the number never quietly means something else.
 */

import { clockH, usual, type Night } from "./sleep";

export const NEED_H = 7;
export type Part = { id: "length" | "deep" | "rem" | "restful" | "onset" | "timing" | "heart" | "rating"; name: string; got: number; max: number; why: string };
export type SleepScore = { score: number; parts: Part[]; left: { id: Part["id"]; name: string; max: number }[]; word: string };

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}`;
/** "1 h 10 later than usual", "35 min earlier than usual". */
const offBy = (hours: number) => { const m = Math.round(Math.abs(hours) * 60); return `${m >= 60 ? hm(m) : `${m} min`} ${hours > 0 ? "later" : "earlier"} than usual`; };

export const scoreWord = (s: number) => (s >= 85 ? "great" : s >= 70 ? "good" : s >= 55 ? "okay" : "rough");

/** This night's score, against your other nights (for the usual bedtime, HRV and lowest heart rate). */
export function sleepScore(n: Night, rating: number | null | undefined, others: Night[], opts: { needH?: number } = {}): SleepScore {
  const need = opts.needH ?? NEED_H, rest = others.filter((x) => x.id !== n.id);
  const parts: Part[] = [], left: SleepScore["left"] = [];
  // unknown, or not a number at all (a measure the band didn't send): left out and named, never a NaN score
  const part = (id: Part["id"], name: string, max: number, frac: number | null, why: string) => {
    if (frac == null || !Number.isFinite(frac)) left.push({ id, name, max });
    else parts.push({ id, name, max, got: Math.round(max * clamp(frac) * 10) / 10, why });
  };
  const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
  const h = n.asleep / 60;
  part("length", "Length", 35, (1 - Math.max(0, need - h) / 2.8) - (h > 10 ? Math.min(5, (h - 10) * 5) / 35 : 0), `${hm(n.asleep)} asleep · ${need} h is full`);
  const share = (m: number | null) => (!ok(m) || !ok(n.asleep) || n.asleep <= 0 ? null : m / n.asleep);
  const deep = share(n.deep), rem = share(n.rem);
  part("deep", "Deep", 10, deep == null ? null : deep / 0.13, deep == null ? "" : `${Math.round(n.deep!)} min · ${Math.round(deep * 100)} %`);
  part("rem", "REM", 10, rem == null ? null : rem / 0.2, rem == null ? "" : `${Math.round(n.rem!)} min · ${Math.round(rem * 100)} %`);
  part("restful", "Restful", 10, ok(n.awake) ? 1 - Math.max(0, n.awake - 15) / 60 : null, `${Math.round(n.awake)} min awake in the night${n.wakes ? `, ${n.wakes}× up` : ""}`);
  part("onset", "Fell asleep", 5, ok(n.latency) ? 1 - Math.max(0, n.latency - 20) / 40 : null, `in ${Math.round(n.latency)} min`);
  const ub = usual(rest.map((x) => clockH(x.bed, x.eve)));
  const dBed = ub ? clockH(n.bed, n.eve) - ub.mid : null;
  part("timing", "Timing", 5, dBed == null ? null : 1 - Math.max(0, Math.abs(dBed) - 0.75) / 1.75, dBed == null ? "" : Math.abs(dBed) < 1 / 12 ? "in bed at your usual time" : `in bed ${offBy(dBed)}`);
  const uh = usual(rest.map((x) => x.hrv)), ul = usual(rest.map((x) => x.low));
  if (n.hrv != null && uh) part("heart", "Heart", 5, (n.hrv / uh.mid - 0.8) / 0.2, `HRV ${Math.round(n.hrv)} ms · usual ${Math.round(uh.mid)}`);
  else if (n.low != null && ul) part("heart", "Heart", 5, 1 - Math.max(0, n.low - ul.mid) / 8, `lowest ${Math.round(n.low)} bpm · usual ${Math.round(ul.mid)}`);
  else part("heart", "Heart", 5, null, "");
  part("rating", "Your rating", 20, rating == null ? null : rating / 10, rating == null ? "" : `${rating}/10`);
  const got = parts.reduce((a, p) => a + p.got, 0), max = parts.reduce((a, p) => a + p.max, 0);
  const score = max ? Math.round((got / max) * 100) : 0;
  return { score, parts, left, word: scoreWord(score) };
}
