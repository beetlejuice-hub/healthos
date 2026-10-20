/**
 * Overall strength, one line (PLAN 143; owner, 20 Oct: "can we add more tracking to it so possibly a graph of my overall
 * strength computed from kgs lifted and reps how its evolving? Make it smart").
 *
 * Each lift's best estimated 1-rep max a week (kg and reps, Epley, working sets of 1–12 reps). The line moves each week
 * by the average change of the lifts done that week, each against its own last value — chain-linked, like a stock index:
 * a 16 kg lateral raise and a 100 kg squat count alike, and a lift added later doesn't make it jump. A change over 20 % in
 * one week is capped (a "315 instead of 31.5" typo moves it 20 % up and 20 % back, not tenfold). Whether he's stronger is
 * read from every lift's 8-week trend pooled with its 90 % range (lib/liftstrength, the muscle rows' maths), not from the
 * line's last point — so a good day isn't progress. Kg lifted a week beside it. Pure.
 */

import { e1rm, working, type LoggedSet } from "./training";
import { liftRates, pooled, weekStart, MUSCLE_DAYS, type MuscleState } from "./liftstrength";
import { DAY } from "./time";

export const OVERALL = { capPct: 20, gapWeeks: 8 };

export type StrengthWeek = { week: number; index: number; lifts: number; kg: number };
export type Overall = {
  weeks: StrengthWeek[];
  /** The line's change since its first week, %. */
  change: number | null;
  /** Every lift's 8-week trend pooled: % a week, its 90 % range, and what it says. */
  perWeek: number | null; lo: number | null; hi: number | null; state: MuscleState | null; lifts: number;
};

export function overallStrength(sets: LoggedSet[], now: number): Overall {
  const done = working(sets).filter((s) => s.at <= now && s.kg > 0 && s.reps >= 1);
  const best = new Map<number, Map<string, number>>(), kg = new Map<number, number>();
  for (const s of done) {
    const w = weekStart(s.at);
    kg.set(w, (kg.get(w) ?? 0) + s.kg * s.reps);
    if (s.reps > 12) continue;
    const m = best.get(w) ?? new Map<string, number>();
    m.set(s.exercise, Math.max(m.get(s.exercise) ?? 0, e1rm(s.kg, s.reps)));
    best.set(w, m);
  }
  const cap = Math.log(1 + OVERALL.capPct / 100), last = new Map<string, { week: number; v: number }>(), weeks: StrengthWeek[] = [];
  let logI = 0;
  for (const w of [...best.keys()].sort((a, b) => a - b)) {
    const m = best.get(w)!, ch: number[] = [];
    for (const [ex, v] of m) {
      const p = last.get(ex);
      // against its own last value — unless that's more than 8 weeks back: then it starts afresh
      if (p && w - p.week <= OVERALL.gapWeeks * 7 * DAY + DAY) ch.push(Math.max(-cap, Math.min(cap, Math.log(v / p.v))));
      last.set(ex, { week: w, v });
    }
    if (ch.length) logI += ch.reduce((a, b) => a + b, 0) / ch.length;
    weeks.push({ week: w, index: 100 * Math.exp(logI), lifts: m.size, kg: kg.get(w) ?? 0 });
  }
  const rates = [...liftRates(sets, now, MUSCLE_DAYS).values()], p = pooled(rates);
  return { weeks, change: weeks.length > 1 ? weeks[weeks.length - 1].index - 100 : null,
    perWeek: p?.perWeek ?? null, lo: p?.lo ?? null, hi: p?.hi ?? null, state: p?.state ?? null, lifts: rates.length };
}

/** "Stronger: about +0.8 % a week" — the verdict in words. */
export function overallWords(o: Overall): string {
  if (o.state == null || o.perWeek == null) return "Needs 3 sessions of a lift in the last 8 weeks to say.";
  const pw = `${o.perWeek >= 0 ? "+" : "−"}${Math.abs(o.perWeek).toFixed(1)} % a week`;
  return o.state === "stronger" ? `Getting stronger: about ${pw} across ${o.lifts} lift${o.lifts === 1 ? "" : "s"}, clear beyond day-to-day ups and downs.`
    : o.state === "dropping" ? `Getting weaker: about ${pw} across ${o.lifts} lift${o.lifts === 1 ? "" : "s"}, clear beyond day-to-day ups and downs.`
      : o.state === "holding" ? `Holding steady across ${o.lifts} lift${o.lifts === 1 ? "" : "s"} (within ±0.25 % a week).`
        : `Not clear yet (${pw}, but the sessions vary too much to tell) — a few more weeks will say.`;
}
