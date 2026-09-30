/**
 * Noticed: the findings engine. Detectors turn your logs into a few plain sentences, each with its
 * number, its evidence and how sure it is — or, when the data isn't there yet, a "still checking"
 * line saying what's missing. Rules (PLAN, Noticed doc):
 *  - a finding needs its minimum data; below it, it's "still checking", never a guess;
 *  - an estimate shows its 90% range; a claim about a change needs its range to exclude zero;
 *  - numbers come from here (tested), never from AI.
 */

import type { Entry, Goals } from "./types";
import { bodyDays, realBurn, weightTrend, BURN_MIN, KCAL_PER_KG, TREND_MIN, type BodyDay } from "./tdee";
import { addDays, localDay } from "./time";

export type Area = "body" | "food" | "caffeine" | "stack" | "training";

export type Finding = {
  id: string;
  area: Area;
  /** The sentence you read first. */
  title: string;
  /** The number, big. */
  value: string; unit: string;
  /** One or two sentences of what it means for you. */
  detail: string;
  /** n, range, method — the fine print, always shown. */
  evidence: string;
  /** "clear" / "likely" for claims; "±140" for estimates. */
  sure: string;
  /** Ranking: higher shows first. */
  weight: number;
  chart?: { kind: "trend"; pts: [number, number][]; fit: [[number, number], [number, number]]; unit: string; firstDay: string };
};

export type Checking = { id: string; area: Area; question: string; progress: number; missing: string };
export type Report = { found: Finding[]; checking: Checking[] };

const f0 = (v: number) => Math.round(v).toLocaleString("en-GB");
const kgwk = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;

/** Smallest weekly weight change worth telling you about, and the "holding steady" band. */
const TREND_WORTH = 0.15, STEADY_BAND = 0.25;

/** Weight trend and real burn, from the last 28 days. */
export function bodyFindings(days: BodyDay[], goals: Goals): Report {
  const found: Finding[] = [], checking: Checking[] = [];
  const trend = weightTrend(days);
  const weighIns = days.filter((d) => d.kg != null).length;
  const firstDay = days[0]?.day ?? "";

  if (!trend) {
    const firstW = days.findIndex((d) => d.kg != null);
    const span = firstW < 0 ? 0 : days.length - firstW;
    checking.push({
      id: "weight-trend", area: "body", question: "Where is your weight really heading?",
      progress: Math.min(weighIns / TREND_MIN.weighIns, span / TREND_MIN.spanDays, 1),
      missing: `${weighIns} of ${TREND_MIN.weighIns} weigh-ins${span < TREND_MIN.spanDays ? `, over at least ${TREND_MIN.spanDays} days` : ""}`,
    });
  } else {
    // 95% here, not 90%: day-to-day intake makes weight wander a little even with no real trend.
    const wk = trend.perDay * 7, half = 1.96 * trend.se * 7;
    const lo = wk - half, hi = wk + half;
    const chart = { kind: "trend" as const, pts: trend.pts, fit: trend.fit, unit: "kg", firstDay };
    const odd = trend.dropped.length ? ` · ${trend.dropped.length} odd weigh-in${trend.dropped.length > 1 ? "s" : ""} left out (${trend.dropped.map((p) => p[1]).join(", ")} kg)` : "";
    const evidence = `${trend.n} weigh-ins over ${trend.spanDays} days · 95% range ${kgwk(lo)} to ${kgwk(hi)} kg/week${odd}`;
    if ((lo > 0 || hi < 0) && Math.abs(wk) >= TREND_WORTH) {
      found.push({
        id: "weight-trend", area: "body",
        title: `Your weight is ${wk > 0 ? "going up" : "going down"} about ${Math.abs(wk).toFixed(2)} kg a week`,
        value: kgwk(wk), unit: "kg/week",
        detail: `Trend weight today: ${trend.nowKg.toFixed(1)} kg. The scale bounces day to day; this line doesn't.`,
        evidence, sure: Math.abs(wk) / (trend.se * 7) >= 3 ? "clear" : "likely", weight: 0.8, chart,
      });
    } else if (lo > -STEADY_BAND && hi < STEADY_BAND) {
      found.push({
        id: "weight-trend", area: "body", title: `Your weight is holding steady at about ${trend.nowKg.toFixed(1)} kg`,
        value: trend.nowKg.toFixed(1), unit: "kg trend",
        detail: `Any change is smaller than ${STEADY_BAND} kg a week either way.`, evidence, sure: "clear", weight: 0.5, chart,
      });
    } else {
      checking.push({ id: "weight-trend", area: "body", question: "Where is your weight really heading?", progress: 0.8, missing: "the weigh-ins are too spread out to tell yet — a few more mornings will settle it" });
    }
  }

  const burn = realBurn(days);
  if (!burn) {
    const food = days.filter((d) => d.kcal != null).length;
    checking.push({
      id: "real-burn", area: "body", question: "How many calories do you actually burn?",
      progress: Math.min(food / BURN_MIN.foodDays, weighIns / TREND_MIN.weighIns, 1),
      missing: [food < BURN_MIN.foodDays && `${food} of ${BURN_MIN.foodDays} days of food logged`, !trend && `${weighIns} of ${TREND_MIN.weighIns} weigh-ins`].filter(Boolean).join(", ") || "a steadier weight trend",
    });
  } else {
    const gap = goals.kcal - burn.kcal;
    const atGoal = (gap * 7) / KCAL_PER_KG;
    const detail = Math.abs(gap) < 100
      ? `Your ${f0(goals.kcal)} kcal goal matches it: eating to goal should hold your weight.`
      : `Your ${f0(goals.kcal)} kcal goal is ${f0(Math.abs(gap))} ${gap > 0 ? "above" : "below"} it: hitting it every day means about ${kgwk(atGoal)} kg a week.`;
    found.push({
      id: "real-burn", area: "body", title: `You burn about ${f0(burn.kcal)} kcal a day`,
      value: f0(burn.kcal), unit: "kcal/day", detail,
      evidence: `${burn.days} logged days (avg ${f0(burn.intake)} kcal) and your weight trend · 90% range ${f0(burn.lo)}–${f0(burn.hi)}${burn.partial ? ` · ${burn.partial} partly logged day${burn.partial > 1 ? "s" : ""} left out` : ""}`,
      sure: `±${f0((burn.hi - burn.lo) / 2)}`, weight: 0.9,
    });
  }
  return { found, checking };
}

export const WINDOW_DAYS = 28;

/** Everything Noticed has to say today. Today's food is left out (the day isn't over). */
export function notice(entries: Entry[], goals: Goals, now: number): Report {
  const today = localDay(now);
  const days = bodyDays(entries, addDays(today, -(WINDOW_DAYS - 1)), today);
  days[days.length - 1] = { ...days[days.length - 1], kcal: null };
  const parts = [bodyFindings(days, goals)];
  return {
    found: parts.flatMap((p) => p.found).sort((a, b) => b.weight - a.weight),
    checking: parts.flatMap((p) => p.checking).sort((a, b) => b.progress - a.progress),
  };
}
