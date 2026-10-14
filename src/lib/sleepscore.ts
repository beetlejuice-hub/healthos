/**
 * A night out of 100 (PLAN 97; owner, 14 Oct: "should do a 100/… pointing for my sleep based on all the sleep data, length,
 * etc i get and also add in my rating"; then "double check if this is a good way to calculate sleep score … can check net
 * for reference"). Pure. Made of parts you can see, each with its points and why:
 *
 *   Length 35      asleep against your need: full from NEED_H (7 h — the adult minimum the sleep societies recommend), 12.5
 *                  a missing hour; past 10 h a little off. The biggest part, as in Fitbit's (time asleep, 50 of 100).
 *   Continuity 15  the National Sleep Foundation's agreed signs of good sleep (Ohayon 2017): awake in the night (7: full
 *                  within 20 min, none from 60), wakings over 5 min (3: full at one or none, none from 4), and the share
 *                  of time in bed asleep (5: full from 85 %, none at 65 %).
 *   Fell asleep 5  full within 30 min (the same report), none from 60.
 *   Deep 7, REM 8  their share of the time asleep: full from 13 % and 20 %. Kept small: wrist bands get stages wrong a
 *                  fair amount, worse on bad nights, and the NSF found no agreement on stages as a sign of good sleep.
 *   Timing 10      when you fell asleep and woke against your usual, the two averaged: full within 45 min, none from
 *                  2 h 15 — regular sleep goes with health at least as strongly as long sleep does (Windred 2023, 61,000
 *                  people). Both ends, as regularity is measured: 2 h late to bed and up as usual is an hour off.
 *   Heart 5        HRV that morning against your usual (full at it, none at 80 % of it) — or, without HRV, the lowest
 *                  heart rate asleep against your usual (full at or under it, none 8 bpm over).
 *   Your rating 15 what you said the next morning, out of 10 — no wearable has this; you asked for it.
 *
 * "Your usual" is the 28 nights before this one. A part that isn't known (no rating yet, no stages, under 5 of those nights) is left out and the rest scaled to 100 —
 * and `left` says which, so the number never quietly means something else. Words as Fitbit's bands: 90+ great, 80+ good,
 * 60+ fair, under that rough.
 */

import { clockH, usual, type Night } from "./sleep";
import { addDays } from "./time";

export const NEED_H = 7;
/** Nights before this one that make your usual (bedtime, waking, HRV, lowest heart rate). */
export const USUAL_NIGHTS = 28;
export type Part = { id: "length" | "continuity" | "onset" | "deep" | "rem" | "timing" | "heart" | "rating"; name: string; got: number; max: number; why: string };
export type SleepScore = { score: number; parts: Part[]; left: { id: Part["id"]; name: string; max: number }[]; word: string };

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}`;
/** "1 h 10 later than usual", "35 min earlier than usual". */
const offBy = (hours: number) => { const m = Math.round(Math.abs(hours) * 60); return `${m >= 60 ? hm(m) : `${m} min`} ${hours > 0 ? "later" : "earlier"} than usual`; };

export const scoreWord = (s: number) => (s >= 90 ? "great" : s >= 80 ? "good" : s >= 60 ? "fair" : "rough");

/** Wakings of more than 5 minutes between falling asleep and waking for good, from the stages (null without them). */
export function longWakings(n: Pick<Night, "stages" | "onset" | "wake">): number | null {
  if (!n.stages?.length) return null;
  return n.stages.filter((s) => s.type === "awake" && s.start >= n.onset && s.end <= n.wake && s.end - s.start > 5 * 60_000).length;
}

/** This night's score, against your other nights (for the usual bedtime, HRV and lowest heart rate). */
export function sleepScore(n: Night, rating: number | null | undefined, others: Night[], opts: { needH?: number } = {}): SleepScore {
  // your usual: the 28 nights before this one — the same nights on every screen, and a night's score doesn't move later
  const need = opts.needH ?? NEED_H, rest = others.filter((x) => x.id !== n.id && x.day < n.day && x.day >= addDays(n.day, -USUAL_NIGHTS));
  const parts: Part[] = [], left: SleepScore["left"] = [];
  // unknown, or not a number at all (a measure the band didn't send): left out and named, never a NaN score
  const part = (id: Part["id"], name: string, max: number, frac: number | null, why: string) => {
    if (frac == null || !Number.isFinite(frac)) left.push({ id, name, max });
    else parts.push({ id, name, max, got: Math.round(max * clamp(frac) * 10) / 10, why });
  };
  const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
  const h = n.asleep / 60;
  part("length", "Length", 35, (1 - Math.max(0, need - h) / 2.8) - (h > 10 ? Math.min(5, (h - 10) * 5) / 35 : 0), `${hm(n.asleep)} asleep · ${need} h is full`);
  // continuity: awake in the night, wakings over 5 min, and the share of time in bed asleep — each from what's known
  const inBed = ok(n.up) && ok(n.bed) ? (n.up - n.bed) / 60_000 : null, eff = inBed && inBed > 0 && ok(n.asleep) ? n.asleep / inBed : null, lw = longWakings(n);
  const subs: [number, number | null][] = [[7, ok(n.awake) ? 1 - Math.max(0, n.awake - 20) / 40 : null], [3, lw == null ? null : 1 - Math.max(0, lw - 1) / 3], [5, eff == null ? null : (eff - 0.65) / 0.2]];
  const known = subs.filter(([, f]) => f != null && Number.isFinite(f)) as [number, number][];
  part("continuity", "Continuity", 15, known.length ? known.reduce((a, [w, f]) => a + w * clamp(f), 0) / known.reduce((a, [w]) => a + w, 0) : null,
    [ok(n.awake) && `${Math.round(n.awake)} min awake`, lw != null && `${lw} waking${lw === 1 ? "" : "s"} over 5 min`, eff != null && `${Math.round(eff * 100)} % of bed asleep`].filter(Boolean).join(" · "));
  part("onset", "Fell asleep", 5, ok(n.latency) ? 1 - Math.max(0, n.latency - 30) / 30 : null, `in ${Math.round(n.latency)} min`);
  const share = (m: number | null) => (!ok(m) || !ok(n.asleep) || n.asleep <= 0 ? null : m / n.asleep);
  const deep = share(n.deep), rem = share(n.rem);
  part("deep", "Deep", 7, deep == null ? null : deep / 0.13, deep == null ? "" : `${Math.round(n.deep!)} min · ${Math.round(deep * 100)} %`);
  part("rem", "REM", 8, rem == null ? null : rem / 0.2, rem == null ? "" : `${Math.round(n.rem!)} min · ${Math.round(rem * 100)} %`);
  // regularity: falling asleep and waking against your usual, both ends (late to bed and up as usual is half as far off)
  const at = (t: number, x: Night) => (ok(t) ? clockH(t, x.eve) : null);
  const uOn = usual(rest.map((x) => at(x.onset, x))), uUp = usual(rest.map((x) => at(x.wake, x)));
  const on0 = at(n.onset, n), up0 = at(n.wake, n), dOn = uOn && on0 != null ? on0 - uOn.mid : null, dUp = uUp && up0 != null ? up0 - uUp.mid : null;
  const said = (d: number, what: string) => `${what} ${Math.abs(d) < 1 / 12 ? "at your usual time" : offBy(d)}`;
  part("timing", "Timing", 10, dOn == null || dUp == null ? null : 1 - Math.max(0, (Math.abs(dOn) + Math.abs(dUp)) / 2 - 0.75) / 1.5,
    dOn == null || dUp == null ? "" : `${said(dOn, "asleep")} · ${said(dUp, "up")}`);
  const uh = usual(rest.map((x) => x.hrv)), ul = usual(rest.map((x) => x.low));
  if (n.hrv != null && uh) part("heart", "Heart", 5, (n.hrv / uh.mid - 0.8) / 0.2, `HRV ${Math.round(n.hrv)} ms · usual ${Math.round(uh.mid)}`);
  else if (n.low != null && ul) part("heart", "Heart", 5, 1 - Math.max(0, n.low - ul.mid) / 8, `lowest ${Math.round(n.low)} bpm · usual ${Math.round(ul.mid)}`);
  else part("heart", "Heart", 5, null, "");
  part("rating", "Your rating", 15, rating == null ? null : rating / 10, rating == null ? "" : `${rating}/10`);
  const got = parts.reduce((a, p) => a + p.got, 0), max = parts.reduce((a, p) => a + p.max, 0);
  const score = max ? Math.round((got / max) * 100) : 0;
  return { score, parts, left, word: scoreWord(score) };
}
