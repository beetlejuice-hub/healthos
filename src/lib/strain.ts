/**
 * HRV status and training load (PLAN 227; owner, 24 Nov: "5"). Two slow signals, each against your own normal.
 *
 *  - **HRV status** (Plews & Laursen; Kiviniemi 2007; Garmin's HRV Status): HRV as ln(ms), its 7-day average against a
 *    normal band from the 60 days before last week (the mean ± ½ SD of the daily values — the smallest change worth
 *    noticing), and how much it swings day to day (CV of the 7, against your usual 7-day CVs). Resting heart rate's
 *    7-day average against the same 60 days.
 *  - **Training load** (session RPE, Foster 2001; valid across 36 studies): each workout's "how hard, 1–10" × its
 *    minutes; this week (the last 7 days) against the 4 weeks before as a weekly average — "this week vs your normal",
 *    never an injury warning (the acute:chronic ratio is contested and coupled).
 *  - **Strain building**: HRV under its band 3+ days running, and resting heart rate 2+ bpm over its normal or the swing
 *    above its usual range. A soft note with what goes with it, never "you are overtrained": the overreaching markers
 *    rest on very few athletes, and HRV-guided training wasn't better at group level. Pure.
 */

import { addDays } from "./time";
import type { Workout } from "./types";

export const STRAIN = { baseDays: 60, gapDays: 7, minBase: 21, week: 7, minWeek: 5, band: 0.5, belowDays: 3, rhrUp: 2, loadWeeks: 4 } as const;
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v: number[]) => { const m = mean(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1)); };

export type HrvDay = { day: string; avg: number; lo: number; hi: number; where: "below" | "within" | "above" };
export type HrvStatus = { today: HrvDay; days: HrvDay[]; cv: number; cvUsual: [number, number] | null; below: number; rhr: { now: number; usual: number } | null };

const ln7 = (hrv: Record<string, number>, day: string) => { const v: number[] = []; for (let k = 0; k < STRAIN.week; k++) { const x = hrv[addDays(day, -k)]; if (x > 0) v.push(Math.log(x)); } return v; };

/** The 7-day HRV against its band on `day`; null without a week and a baseline. */
function hrvDay(hrv: Record<string, number>, day: string): (HrvDay & { week: number[]; base: number[] }) | null {
  const week = ln7(hrv, day);
  if (week.length < STRAIN.minWeek) return null;
  const base: number[] = [];
  for (let k = STRAIN.gapDays; k < STRAIN.gapDays + STRAIN.baseDays; k++) { const x = hrv[addDays(day, -k)]; if (x > 0) base.push(Math.log(x)); }
  if (base.length < STRAIN.minBase) return null;
  const m = mean(base), half = STRAIN.band * sd(base), a = mean(week);
  return { day, avg: Math.exp(a), lo: Math.exp(m - half), hi: Math.exp(m + half), where: a < m - half ? "below" : a > m + half ? "above" : "within", week, base };
}

export function hrvStatus(hrv: Record<string, number>, rhr: Record<string, number>, today: string, span = 30): HrvStatus | null {
  const t = hrvDay(hrv, today);
  if (!t) return null;
  const days: HrvDay[] = [];
  for (let k = span - 1; k >= 0; k--) { const d = hrvDay(hrv, addDays(today, -k)); if (d) days.push({ day: d.day, avg: d.avg, lo: d.lo, hi: d.hi, where: d.where }); }
  let below = 0; for (let k = days.length - 1; k >= 0 && days[k].where === "below"; k--) below++;
  const cvOf = (v: number[]) => (sd(v) / mean(v)) * 100, cv = cvOf(t.week);
  // your usual swing: the 7-day CVs across the baseline weeks
  const cvs: number[] = [];
  for (let k = STRAIN.gapDays; k + STRAIN.week <= STRAIN.gapDays + STRAIN.baseDays; k += 1) { const w = ln7(hrv, addDays(today, -k)); if (w.length >= STRAIN.minWeek) cvs.push(cvOf(w)); }
  cvs.sort((a, b) => a - b);
  // its range in the baseline weeks, lowest to highest: a swing counts only past anything those 60 days had (past their
  // 90th percentile, an HRV drop alone got a strain note in 25 % of fake people — too loose for a soft note)
  const cvUsual: [number, number] | null = cvs.length >= 10 ? [cvs[0], cvs[cvs.length - 1]] : null;
  const r7: number[] = [], rb: number[] = [];
  for (let k = 0; k < STRAIN.week; k++) { const x = rhr[addDays(today, -k)]; if (x > 0) r7.push(x); }
  for (let k = STRAIN.gapDays; k < STRAIN.gapDays + STRAIN.baseDays; k++) { const x = rhr[addDays(today, -k)]; if (x > 0) rb.push(x); }
  const rhrS = r7.length >= STRAIN.minWeek && rb.length >= STRAIN.minBase ? { now: mean(r7), usual: mean(rb) } : null;
  return { today: { day: t.day, avg: t.avg, lo: t.lo, hi: t.hi, where: t.where }, days, cv, cvUsual, below, rhr: rhrS };
}

/** Strain building: HRV under its band 3+ days, with resting heart rate up or the swing above its usual. */
export function strainBuilding(s: HrvStatus | null): { rhrUp: number | null; swing: boolean } | null {
  if (!s || s.below < STRAIN.belowDays) return null;
  const rhrUp = s.rhr && s.rhr.now - s.rhr.usual >= STRAIN.rhrUp ? s.rhr.now - s.rhr.usual : null, swing = !!s.cvUsual && s.cv > s.cvUsual[1];
  return rhrUp != null || swing ? { rhrUp, swing } : null;
}

/** Each workout's load: how hard (1–10) × minutes; null without a "how hard" or an end. */
export const sessionLoad = (w: Pick<Workout, "rpe" | "startedAt" | "endedAt">) => (w.rpe && w.endedAt ? Math.round(w.rpe * ((w.endedAt - w.startedAt) / 60_000)) : null);

/** This week's load (the 7 days to `now`) against the 4 weeks before, as a weekly average; how many workouts had no "how hard". */
export function weekLoad(ws: Workout[], now: number): { week: number; usual: number | null; rated: number; unrated: number } {
  const D = 86_400_000, inWeek = ws.filter((w) => w.endedAt && w.startedAt > now - 7 * D && w.startedAt <= now);
  const before = ws.filter((w) => w.endedAt && w.startedAt > now - (1 + STRAIN.loadWeeks) * 7 * D && w.startedAt <= now - 7 * D);
  const sum = (l: Workout[]) => l.reduce((a, w) => a + (sessionLoad(w) ?? 0), 0);
  const ratedBefore = before.filter((w) => sessionLoad(w) != null).length;
  return { week: sum(inWeek), usual: ratedBefore >= 3 ? sum(before) / STRAIN.loadWeeks : null, rated: inWeek.filter((w) => sessionLoad(w) != null).length, unrated: inWeek.filter((w) => sessionLoad(w) == null).length };
}

/** "Hard", in words: 1–10 (Borg CR10, as one tap). */
export const rpeWord = (v: number) => (v >= 10 ? "all out" : v >= 9 ? "very hard" : v >= 7 ? "hard" : v >= 5 ? "moderate" : v >= 3 ? "easy" : "very easy");
