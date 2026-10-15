/**
 * The calorie goal from what you burn (PLAN 95; owner, 14 Oct: "My calorie intake should be calculated based on how
 * much i burn too"; 15 Oct, the goal: "lose fat and gain some muscles why being lean, in like 2-3 months? or faster
 * even"). Goal = your burn − the deficit for the pace you pick. The burn is your measured one (lib/tdee: what you ate
 * against your weight trend) when there's enough of it, else the band's average day. The two-week check-in (his ±150
 * rule) stays on as the guard rail: it fires only when the loss leaves 0.3–0.7 kg a week, and its step is kept here as
 * an offset on top of the burn. Pure; Settings shows it, useEnergyGoal writes it into the goals.
 */

import type { Entry, Goals } from "./types";
import { bodyDays, realBurn, BURN_MIN, KCAL_PER_KG, TREND_MIN, type Burn } from "./tdee";
import { median, mean } from "./stats";
import { addDays } from "./time";

export type Energy = { mode: "fixed" | "burn"; /** kg a week */ pace: number; /** kcal the check-ins added (+) or cut (−) */ offset: number };

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
  const days = bodyDays(entries, addDays(today, -(ENERGY.measuredDays - 1)), today);
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

export type EnergyPlan = { burn: BurnNow | null; goal: Goal | null; need: string | null };

/** Everything the Settings card and the goal writer need. `need` says what's missing while there's no burn. */
export function energyPlan(entries: Entry[], bandKcal: Record<string, number> | undefined, today: string, e: Energy): EnergyPlan {
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
