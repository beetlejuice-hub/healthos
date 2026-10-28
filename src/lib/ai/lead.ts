/**
 * Today's lead (PLAN 176; owner, 27 Oct: "Rn it just summarizes my day and tells me to eat more protein and sleep better
 * basically" · "really have to make ai smarter. more likely for graphs and connections between things and research/studies").
 * The app's own tested links (lib/scout: rank correlations across food, caffeine, alcohol, training, supplements and
 * feelings, weekday/weekend adjusted, p < 0.005, with how often they held) reached the AI only as "could be chance" lines
 * deep in its context. Now the strongest one not featured in the last three weeks is handed to the morning read to
 * explain, research and chart. Pure.
 */

import { ownSignal, type Pattern, type Signal } from "../scout";
import type { DayFacts } from "../insights";
import { addDays } from "../time";
import type { LeadRef } from "./tasks";

export type { LeadRef };

/**
 * rest: days before a featured lead can be featured again. maxP: only a link this strong leads — scout flags at p < 0.005
 * and, testing ~200 pairs, flags a chance one for about half of people with nothing real in their data; at p < 0.0002 that's
 * ~3 in 100, while a planted next-day effect of 2 points still leads 94 times in 100 over 90 days (measured 27 Oct, lead.test).
 */
export const LEAD = { rest: 21, maxP: 0.0002 };
export type LeadMark = { id: string; day: string };

/** How strong a link is to lead with: its rank correlation × how often it held. */
export const leadStrength = (p: Pattern) => Math.abs(p.r) * (p.of ? p.held / p.of : 0.5);

/** The strongest tested link not featured in the last three weeks, or null. */
export function pickLead(patterns: Pattern[], featured: LeadMark[] = [], today: string): Pattern | null {
  const resting = new Set(featured.filter((f) => f.day > addDays(today, -LEAD.rest)).map((f) => f.id));
  return [...patterns].filter((p) => (p.q ?? p.p) < LEAD.maxP && !resting.has(p.id)).sort((x, y) => leadStrength(y) - leadStrength(x))[0] ?? null;
}

export const leadRef = (p: Pattern): LeadRef => ({ id: p.id, a: p.a.id, b: p.b.id, lag: p.lag });

const num = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-GB") : v.toFixed(1));

/** For the morning read's context: the link, its numbers, and what to do with it. */
export function leadLines(p: Pattern): string[] {
  const avgs = p.onAvg != null && p.offAvg != null ? `; ${p.b.name} averaged ${num(p.onAvg)} on ${p.a.yes ?? `high-${p.a.name}`} days vs ${num(p.offAvg)} otherwise` : "";
  return [
    "## Today's lead — a link the app found and tested in their own data (the morning's \"pattern\" item is about THIS one, as a \"connection\")",
    `- ${p.text}`,
    `- How strong: rank correlation ${p.r.toFixed(2)} over ${p.n} days (p ${(p.q ?? p.p) < 0.0001 ? "< 0.0001" : (p.q ?? p.p).toFixed(4)}, allowing for how many pairs were checked), weekdays and weekends compared apart; it held on ${p.held} of ${p.of} days${avgs}. ${p.lag ? `${p.a.name} one day, ${p.b.name} the next.` : "The same day."} The app checks ~200 pairs and only leads with one this strong — chance alone gets there about 1 time in 30, so "sure": "yours", but say it's their data, not a study.`,
    `- The item: say it plainly with these numbers ("goes with", never "causes"; "sure": "yours"). Search the web for WHY it might happen — a mechanism or a study — and cite it as its "source". Give the "chain" from ${p.a.name} to ${p.b.name}, each link with how sure it is. The "tip" tests it: what to do (or skip) on the next days, and that the app is watching ${p.b.name}. Leave "measure" out — the app draws both, ${p.a.name} over ${p.b.name}, for 14 days.`,
  ];
}

/** The lead's chart: `a` on each of the last `n` days to yesterday, and `b` that day (or the next, with a lag). */
export function leadSeries(ref: LeadRef, facts: DayFacts[], signals: Signal[], yesterday: string, n = 14):
  { days: string[]; a: { name: string; vals: (number | null)[]; yes: boolean; unit?: string }; b: { name: string; vals: (number | null)[]; unit?: string; body?: boolean } } | null {
  // your own body word ("knee pain") isn't among the signals when it's not in these 14 days: rebuilt from its id
  const sa = signals.find((s) => s.id === ref.a), sb = signals.find((s) => s.id === ref.b) ?? (ref.b.startsWith("felt-") ? ownSignal(ref.b.slice(5)) : undefined);
  if (!sa || !sb) return null;
  const by = new Map(facts.map((f) => [f.day, f]));
  const days = Array.from({ length: n }, (_, i) => addDays(yesterday, i - n + 1 - ref.lag));
  const at = (s: Signal, d: string) => { const f = by.get(d); return f ? s.get(f) : null; };
  return {
    days,
    a: { name: sa.name, vals: days.map((d) => at(sa, d)), yes: !!sa.yes, unit: sa.unit },
    b: { name: sb.name, vals: days.map((d) => at(sb, addDays(d, ref.lag))), unit: sb.unit, body: !!sb.outcomeOnly },
  };
}

/** The answer's item that explains the lead — its first connection, else its pattern — with the lead attached. */
export function withLead<T extends { type: string; lead?: LeadRef }>(items: T[], p: Pattern | null): T[] {
  if (!p) return items;
  const k = items.findIndex((i) => i.type === "connection") >= 0 ? items.findIndex((i) => i.type === "connection") : items.findIndex((i) => i.type === "pattern");
  return k < 0 ? items : items.map((i, n) => (n === k ? { ...i, lead: leadRef(p) } : i));
}

/** "strong" clears the lead bar; "early" is scout's own flag — could be chance (a fluke this strong comes up often). */
export const leadGrade = (p: Pattern): "strong" | "early" => ((p.q ?? p.p) < LEAD.maxP ? "strong" : "early");

/** What a change to `a` is, in words, for the ones a person can choose to change (never "drink more", never "train less"). */
const CHANGE: Record<string, { less?: [string, string]; more?: [string, string] }> = {
  alcohol: { less: ["No alcohol", "No alcohol at all — not even one"] },
  smoke: { less: ["No cigarettes", "No cigarettes at all"] },
  caffeine: { less: ["Caffeine under 200 mg", "Keep caffeine under 200 mg a day"] },
  lateCaf: { less: ["No caffeine after 14:00", "Last coffee before 14:00"] },
  lateEat: { less: ["Done eating by 21:00", "Finish eating by 21:00"] },
  bigMeal: { less: ["No meal over 800 kcal", "Split the biggest meal — none over 800 kcal"] },
  protein: { more: ["Protein at every meal", "30 g of protein or more at every meal"] },
  gym: { more: ["Train 4 days a week", "Lift or do cardio on 4 days each week"] },
  asleep: { more: ["30 min more sleep", "In bed 30 minutes earlier every night"] },
  steps: { more: ["8,000+ steps a day", "Walk to 8,000 steps or more every day"] },
};
const GOOD_UP: Record<string, boolean> = { mood: true, energy: true, focus: true, stress: false };

/**
 * "Test it" (PLAN 176 phase 2): 14 days of changing the first thing the way the link says helps, measured on the second
 * (the app compares the 14 days before with the 14 during). Null when the second isn't a feeling the app can measure, or
 * the change isn't one to suggest.
 */
export function leadTest(p: Pattern): { name: string; how: string; days: number; measure: string } | null {
  if (!(p.b.id in GOOD_UP)) return null;
  const better = (p.sign > 0) === GOOD_UP[p.b.id];
  const c = p.a.id.startsWith("supp-") ? { more: [`${p.a.name} every day`, `Take ${p.a.name} every day`] as [string, string], less: [`Pause ${p.a.name}`, `Don't take ${p.a.name}`] as [string, string] } : CHANGE[p.a.id];
  const pick = better ? c?.more : c?.less;
  return pick ? { name: `${pick[0]} — does ${p.b.name} ${p.b.id === "stress" ? "ease" : "lift"}?`, how: pick[1], days: 14, measure: p.b.id } : null;
}

/** For the talk-back chat on a lead's card: the link, its numbers, and how to answer "why", "is it real", "what do I do". */
export function aboutLead(p: Pattern): string {
  const grade = leadGrade(p);
  return [
    "## The link this message is about (Insights → Leads: the app found and tested it in their own data)",
    ...leadLines(p).slice(1, 3),
    `- How sure: ${grade === "strong" ? "strong — the app checks ~200 pairs and chance gets one this strong about 1 time in 30" : "early — strong enough to flag, not to trust: across ~200 pairs, a fluke this strong turns up for about half of people; it's re-checked on every new day"}.`,
    "- \"Why?\": search the web for the mechanism and 1–3 studies (links, how strong). \"Is it real?\": explain the test in plain words and check it with compare or series look-ups. \"What do I do?\": one or two specific things, and offer a 14-day experiment (propose it).",
  ].join("\n");
}
