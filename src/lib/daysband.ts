/**
 * The band's side of a day for the pattern finder (owner, 27 Oct: connections with "feeling weak"): minutes asleep the
 * night that ended that morning, and the day's steps (only days the band was worn enough — lib/steps). Days stay as they
 * were without a band. Pure; worked out once per band load (every Leads card and its chart share it — computing nights
 * per card made Insights slow enough to fail the Heart page's e2e, 27 Oct). Minutes asleep don't need the heart rate.
 */

import type { BandData } from "./band";
import type { DayFacts } from "./insights";
import { clockH, nights } from "./sleep";
import { stepsByDay } from "./steps";
import { walkByDay, type HealthSample } from "./healthimport";

const cache = new WeakMap<BandData, { today: string; slept: Map<string, number>; steps: Map<string, number>; late: Map<string, number> }>();

function ofBand(band: BandData, today: string) {
  const hit = cache.get(band);
  if (hit && hit.today === today) return hit;
  const ns = nights(band.sleep, [], band.rhr, band.hrv), beds = ns.map((n) => clockH(n.bed, n.eve)).sort((a, b) => a - b), usual = beds.length ? beds[(beds.length - 1) >> 1] : 0;
  // bed past your usual, by the evening it began (PLAN 188: "bed an hour or more past your usual" → the next day)
  const v = { today, slept: new Map(ns.map((n) => [n.day, n.asleep])), steps: stepsByDay(band.steps ?? [], band.hr, today), late: new Map(beds.length >= 14 ? ns.map((n) => [n.eve, clockH(n.bed, n.eve) - usual]) : []) };
  cache.set(band, v);
  return v;
}

/**
 * …and Apple Health's side (PLAN 184 phase 2; owner, 29 Oct, his Health app's list — walking speed "may go with tired
 * days"): the day's walking speed. Days stay as they were without any.
 */
export function withHealth(days: DayFacts[], samples: HealthSample[]): DayFacts[] {
  const walk = walkByDay(samples);
  if (!walk.size || !days.length) return days;
  return days.map((d) => ({ ...d, walkKmh: walk.get(d.day) ?? null }));
}

export function withBand(days: DayFacts[], band: BandData | null, today: string): DayFacts[] {
  if (!band || !days.length) return days;
  const { slept, steps, late } = ofBand(band, today);
  return days.map((d) => ({ ...d, asleepMin: slept.get(d.day) ?? null, steps: steps.get(d.day) ?? null, bedLateH: late.get(d.day) ?? null }));
}
