/**
 * Insights → Sleep and Intake & body (approved prototype v2, phase 5a). Small pure helpers on top of
 * the day rows (lib/glance) and the weight trend (lib/tdee); the components only draw.
 */

import type { GlanceDay } from "./glance";
import type { BodyDay } from "./tdee";
import { CAF_SLEEP } from "./caffeine-sleep";
import { mean } from "./stats";

/** Each day's average of the weigh-ins in the 7 days ending that day; null with fewer than 3. */
export function avg7(days: BodyDay[]): (number | null)[] {
  return days.map((_, i) => { const xs = days.slice(Math.max(0, i - 6), i + 1).flatMap((d) => (d.kg == null ? [] : [d.kg])); return xs.length >= 3 ? mean(xs) : null; });
}

/** A night: the evening of `day`, rated the next morning. */
export type Night = { day: string; rating: number | null; cafBed: number | null; drinks: boolean; lateCaffeine: boolean; trained: boolean };

/** Nights in `days` (oldest → newest). The sleep rating given on day i+1 belongs to day i's night. */
export function nights(days: GlanceDay[]): Night[] {
  return days.slice(0, -1).map((d, i) => ({ day: d.day, rating: days[i + 1].sleep, cafBed: d.cafBed, drinks: (d.drinks ?? 0) > 0, lateCaffeine: d.lateCaffeine, trained: d.trained }));
}

export type Tier = "low" | "possible" | "higher";
/** The bedtime caffeine tiers the rest of the app uses (lib/caffeine-sleep). */
export const tierOfMg = (mg: number): Tier => (mg < CAF_SLEEP.lowBelowMg ? "low" : mg < CAF_SLEEP.higherFromMg ? "possible" : "higher");

export type DrinkWeek = { start: string; drinks: number | null; loggedDays: number };
/**
 * Drinks per 7-day block, newest block ending on the last day. A block with fewer than 4 days of
 * anything logged says null ("not enough logged"), not 0 — no drinks logged isn't no drinks.
 */
export function drinkWeeks(days: GlanceDay[], weeks: number): DrinkWeek[] {
  const out: DrinkWeek[] = [];
  for (let k = weeks - 1; k >= 0; k--) {
    const end = days.length - 1 - 7 * k, block = days.slice(Math.max(0, end - 6), end + 1);
    if (!block.length) continue;
    const logged = block.filter((d) => d.drinks != null);
    out.push({ start: block[0].day, drinks: logged.length >= 4 ? logged.reduce((a, d) => a + d.drinks!, 0) : null, loggedDays: logged.length });
  }
  return out;
}
