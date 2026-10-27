/**
 * The calorie goal from what you burn (PLAN 95; owner, 14 Oct: "My calorie intake should be calculated based on how
 * much i burn too"; 15 Oct, the goal: "lose fat and gain some muscles why being lean, in like 2-3 months? or faster
 * even"). Goal = your burn − the deficit for the pace you pick. The burn is your measured one (lib/tdee: what you ate
 * against your weight trend) when there's enough of it, else the band's average day. The two-week check-in (his ±150
 * rule) stays on as the guard rail: it fires only when the loss leaves 0.3–0.7 kg a week, and its step is kept here as
 * an offset on top of the burn. Pure; Settings shows it, useEnergyGoal writes it into the goals.
 */

import type { Entry, Goals } from "./types";
import { bodyDays, realBurn, weightTrend, BURN_MIN, KCAL_PER_KG, TREND_MIN, type Burn } from "./tdee";
import { median, mean } from "./stats";
import { guessedKcal, usualIntake } from "./foodgaps";

export { usualIntake };
import { addDays } from "./time";

export type Energy = { mode: "fixed" | "burn" | "eat"; /** kg a week */ pace: number; /** kcal the check-ins added (+) or cut (−) */ offset: number;
  /** "eat": the day it was turned on — its weeks count from that Monday. */ since?: string;
  /** Moved from "burn" to "eat" once (27 Oct, his "1a"); a later pick of "burn" stays. */ moved?: boolean };

/** Paces inside the owner's 0.3–0.7 kg/week rule, with room either side so the check-in doesn't fire on noise. */
export const PACES = [
  { kg: 0.35, name: "Slow", why: "the most room to build muscle" },
  { kg: 0.5, name: "Steady", why: "the middle of your 0.3–0.7 rule" },
  { kg: 0.65, name: "Fast", why: "the top of your rule — watch your lifts" },
] as const;
export const DEFAULT_ENERGY: Energy = { mode: "fixed", pace: 0.5, offset: 0 };

/**
 * maxCut: the deficit never goes past a quarter of your burn. floor: nor the goal under 1,500. bandDays/bandMin: the
 * band's average day over the last 14 full days, from 5 of them. step: smaller changes than this don't move the goal.
 */
export const ENERGY = { maxCut: 0.25, floor: 1500, bandDays: 14, bandMin: 5, step: 50, measuredDays: 28 };

export type BurnNow =
  | { from: "measured"; kcal: number; burn: Burn }
  | { from: "band"; kcal: number; days: number };

/** Your measured burn over the last 4 weeks, today left out (the day isn't over) — the same window Noticed uses. */
export function measuredBurn(entries: Entry[], today: string): Burn | null {
  // a day you didn't log that you said how you ate counts at your usual × that (lib/foodgaps; owner, 27 Oct: unlogged
  // weekends of eating more made the burn look low)
  const days = bodyDays(entries, addDays(today, -(ENERGY.measuredDays - 1)), today).map((d) => ({ ...d, kcal: guessedKcal(entries, d.day, d.kcal) }));
  days[days.length - 1] = { ...days[days.length - 1], kcal: null };
  return realBurn(days);
}

/**
 * The band's average burned day: the last 14 full days (today isn't), a day under half the usual left out (the band
 * was off, or the day only half synced). Null under 5 days.
 */
export function bandBurn(kcal: Record<string, number> | undefined, today: string): { kcal: number; days: number } | null {
  if (!kcal) return null;
  const got: number[] = [];
  for (let i = 1; i <= ENERGY.bandDays; i++) { const v = kcal[addDays(today, -i)]; if (v != null && Number.isFinite(v) && v > 0) got.push(v); }
  if (!got.length) return null;
  const mid = median(got), full = got.filter((v) => v >= mid * 0.5);
  return full.length >= ENERGY.bandMin ? { kcal: Math.round(mean(full) / 10) * 10, days: full.length } : null;
}

export type Goal = {
  kcal: number;
  /** kcal a day under your burn, and the kg a week that comes to */
  cut: number; perWeek: number;
  /** the pace asked more than a quarter of your burn / the goal hit the floor */
  capped: boolean; floored: boolean;
};

/** Burn − pace × 7,700 / 7 + the check-ins' offset; the cut capped at a quarter of the burn, the goal at 1,500. */
export function goalFrom(burn: number, pace: number, offset = 0): Goal {
  const want = (pace * KCAL_PER_KG) / 7;
  const cut = Math.min(want, burn * ENERGY.maxCut);
  let kcal = Math.round((burn - cut + offset) / 10) * 10;
  const floored = kcal < ENERGY.floor;
  if (floored) kcal = ENERGY.floor;
  return { kcal, cut: burn - kcal, perWeek: ((burn - kcal) * 7) / KCAL_PER_KG, capped: want - cut > 1, floored };
}

/** Calories move with carbs (150 kcal ≈ 38 g); protein and fat stay where you set them. */
export const carbsG = (delta: number) => Math.sign(delta) * Math.round(Math.abs(delta) / 4);

/** The goals with the new calorie goal, carbs moved with it; null when it's under 50 kcal off (nothing to change). */
export function withKcal(goals: Goals, kcal: number): Goals | null {
  const delta = kcal - goals.kcal;
  if (Math.abs(delta) < ENERGY.step) return null;
  return { ...goals, kcal, c: Math.max(0, goals.c + carbsG(delta)) };
}

/**
 * The goal from what you eat (PLAN 173; owner, 27 Oct: the goal "1500 kcal … sounds way too low for me. i want it to change
 * dynamically, and smartly so it adjusts to how much i actually eat and tries to slowly nudge it down" — then "1a keep
 * lowering but also learn what i actually eat and try to help do a managable goal"). 1,500 was the floor: the burn is
 * measured as what you logged against your weight, so food you didn't log made it look low. This starts from what you
 * really eat instead, and moves once a week, on Monday, from what came before:
 *   - what you usually eat: the middle of your fully logged days in the two weeks before (a day under half of that is a
 *     gap in the log, not a fast, and is left out); 7 of them at least;
 *   - the scale: your weight trend over the 4 weeks before (kg a week);
 *   - losing 0.3–0.7 kg a week (your rule): it holds; less, or no trend: 50 lower; faster: 100 higher;
 *   - never more than 150 under what you usually eat, so it's one you can hit, nor 100 over it, so it follows what you
 *     really eat — and as you eat to it, that comes down and it follows. Never under 1,500.
 * Weeks count from the Monday of `since`. Pure.
 */
export const EAT = { window: 14, minFull: 7, trendDays: 28, down: 50, up: 100, under: 150, over: 100, hold: [0.3, 0.7] as const };

export type EatWeek = {
  /** The Monday it starts. */ from: string;
  /** What you usually ate in the two weeks before, from `full` fully logged days (null: under 7). */ usual: number | null; full: number;
  /** kg a week, + losing (null: not enough weigh-ins). */ loss: number | null;
  move: "start" | "hold" | "down" | "up" | "no-data";
  kcal: number;
  /** Kept to one you can hit (150 under what you eat), to what you eat (100 over), or to the floor. */ kept?: "under" | "over" | "floor";
};

/** Monday of a day's week. */
export const mondayOf = (day: string) => addDays(day, -((new Date(`${day}T12:00:00`).getDay() + 6) % 7));

/** Each week's goal from `since` to today's week; null until the first has what you usually eat. */
export function eatGoal(entries: Entry[], since: string, today: string): { kcal: number; weeks: EatWeek[] } | null {
  const weeks: EatWeek[] = [];
  for (let m = mondayOf(since); m <= today; m = addDays(m, 7)) {
    const u = usualIntake(entries, addDays(m, -EAT.window), addDays(m, -1));
    const t = weightTrend(bodyDays(entries, addDays(m, -EAT.trendDays), addDays(m, -1)));
    const loss = t ? Math.round(-t.perDay * 7 * 100) / 100 : null, prev = weeks.at(-1);
    // it starts on the first week that has what you usually eat
    if (!prev) { if (u.kcal == null) continue; weeks.push({ from: m, usual: u.kcal, full: u.full, loss, move: "start", kcal: Math.max(ENERGY.floor, u.kcal) }); continue; }
    if (u.kcal == null) { weeks.push({ from: m, usual: null, full: u.full, loss, move: "no-data", kcal: prev.kcal }); continue; }
    const move = loss != null && loss > EAT.hold[1] ? "up" : loss != null && loss >= EAT.hold[0] ? "hold" : "down";
    let kcal = prev.kcal + (move === "up" ? EAT.up : move === "down" ? -EAT.down : 0), kept: EatWeek["kept"];
    if (kcal < u.kcal - EAT.under) { kcal = u.kcal - EAT.under; kept = "under"; }
    if (kcal > u.kcal + EAT.over) { kcal = u.kcal + EAT.over; kept = "over"; }
    if (kcal < ENERGY.floor) { kcal = ENERGY.floor; kept = "floor"; }
    weeks.push({ from: m, usual: u.kcal, full: u.full, loss, move, kcal, ...(kept ? { kept } : {}) });
  }
  return weeks.length ? { kcal: weeks.at(-1)!.kcal, weeks } : null;
}

export type EnergyPlan = { burn: BurnNow | null; goal: Goal | null; need: string | null; eat?: { kcal: number; weeks: EatWeek[] } | null };

/** Everything the Settings card and the goal writer need. `need` says what's missing while there's no burn. */
export function energyPlan(entries: Entry[], bandKcal: Record<string, number> | undefined, today: string, e: Energy): EnergyPlan {
  if (e.mode === "eat") {
    const eat = eatGoal(entries, e.since ?? today, today);
    const u = usualIntake(entries, addDays(mondayOf(today), -EAT.window), addDays(mondayOf(today), -1));
    return { burn: null, goal: null, eat, need: eat ? null : `${EAT.minFull} fully logged days in the two weeks before Monday (${u.full} so far)` };
  }
  const m = measuredBurn(entries, today);
  const b = m ? null : bandBurn(bandKcal, today);
  const burn: BurnNow | null = m ? { from: "measured", kcal: m.kcal, burn: m } : b ? { from: "band", kcal: b.kcal, days: b.days } : null;
  if (burn) return { burn, goal: goalFrom(burn.kcal, e.pace, e.offset), need: null };
  const days = bodyDays(entries, addDays(today, -(ENERGY.measuredDays - 1)), addDays(today, -1));
  const food = days.filter((d) => d.kcal != null).length, weighs = days.filter((d) => d.kg != null).length;
  const band = bandKcal ? Object.keys(bandKcal).filter((d) => d < today && d >= addDays(today, -ENERGY.bandDays)).length : 0;
  return {
    burn: null, goal: null,
    need: `the band connected for ${ENERGY.bandMin} full days (${Math.min(band, ENERGY.bandMin)} so far), or ${BURN_MIN.foodDays} days of food and ${TREND_MIN.weighIns} weigh-ins in 4 weeks (${food} and ${weighs} so far)`,
  };
}
