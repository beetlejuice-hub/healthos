/**
 * Caffeine habit, learned instead of configured (owner: "usual caffeine mg should come from data …
 * tell me if I have a large tolerance"). From the last 28 days: how much a day, per kg of body
 * weight, your usual drink, and when your first and last caffeine usually are.
 */

import type { Entry } from "../types";
import type { Checking, Finding } from "../findings";
import { median } from "../stats";
import { addDays, localDay, minuteOfDay } from "../time";

export const HABIT_MIN = { loggedDays: 10, caffeineDays: 5 };

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m) % 60).padStart(2, "0")}`;

/**
 * Habitual-intake bands in mg per kg of body weight a day. Regular intake builds tolerance to the
 * alertness effect; around 5+ mg/kg daily that adaptation is substantial for most people.
 */
export function level(mgPerKg: number): { word: "light" | "moderate" | "high"; note: string } {
  if (mgPerKg < 2) return { word: "light", note: "Light enough that a cup should still feel like a real lift." };
  if (mgPerKg < 5) return { word: "moderate", note: "Regular intake like this builds some tolerance: the lift from a cup is smaller than for a non-drinker." };
  return { word: "high", note: "High habitual intake: your body has most likely adapted, so a cup mostly restores normal alertness, and skipping it can bring a headache or a slump." };
}

export function caffeineFindings(entries: Entry[], today: string, bodyKg: number, windowDays = 28): { found: Finding[]; checking: Checking[] } {
  const from = addDays(today, -windowDays), to = addDays(today, -1); // full days only
  const inWindow = entries.filter((e) => { const d = localDay(e.at); return d >= from && d <= to; });
  const logged = new Set(inWindow.filter((e) => e.kind === "food" || e.kind === "drink").map((e) => localDay(e.at)));
  const drinks = inWindow.filter((e): e is Extract<Entry, { kind: "drink" }> => e.kind === "drink" && e.caffeineMg > 0);
  if (!drinks.length) return { found: [], checking: [] }; // doesn't log caffeine: nothing to say
  const perDay = new Map<string, number>();
  for (const d of drinks) perDay.set(localDay(d.at), (perDay.get(localDay(d.at)) ?? 0) + d.caffeineMg);
  if (logged.size < HABIT_MIN.loggedDays || perDay.size < HABIT_MIN.caffeineDays) {
    return { found: [], checking: [{
      id: "caffeine-habit", area: "caffeine", question: "What's your real caffeine habit — and your tolerance?",
      progress: Math.min(logged.size / HABIT_MIN.loggedDays, perDay.size / HABIT_MIN.caffeineDays, 1),
      missing: `${logged.size} of ${HABIT_MIN.loggedDays} logged days`,
    }] };
  }
  // A logged day without caffeine really was a caffeine-free day.
  const daily = [...logged].map((d) => perDay.get(d) ?? 0);
  const mg = Math.round(median(daily) / 5) * 5;
  const perKg = mg / bodyKg;
  const lv = level(perKg);
  const cup = Math.round(median(drinks.map((d) => d.caffeineMg)));
  const byDay = [...perDay.keys()].map((d) => drinks.filter((x) => localDay(x.at) === d).map((x) => minuteOfDay(x.at)));
  const first = median(byDay.map((m) => Math.min(...m))), last = median(byDay.map((m) => Math.max(...m)));
  const over = mg > 400 ? " That's above the 400 mg a day health agencies consider fine for most healthy adults." : "";
  return {
    found: [{
      id: "caffeine-habit", area: "caffeine",
      title: `You take about ${mg} mg of caffeine a day — ${lv.word} for your weight`,
      value: String(mg), unit: "mg/day",
      detail: `${perKg.toFixed(1)} mg per kg. ${lv.note}${over} Usually first at ${hm(first)}, last at ${hm(last)}; a typical drink has ${cup} mg.`,
      evidence: `median of ${logged.size} logged days (${logged.size - perDay.size} without caffeine count as 0) · ${drinks.length} drinks · body weight ${bodyKg.toFixed(1)} kg`,
      sure: `${logged.size} days`, weight: 0.7,
    }],
    checking: [],
  };
}
