/**
 * Today's lead (PLAN 176; owner, 27 Oct: "Rn it just summarizes my day and tells me to eat more protein and sleep better
 * basically" · "really have to make ai smarter. more likely for graphs and connections between things and research/studies").
 * The app's own tested links (lib/scout: rank correlations across food, caffeine, alcohol, training, supplements and
 * feelings, weekday/weekend adjusted, p < 0.005, with how often they held) reached the AI only as "could be chance" lines
 * deep in its context. Now the strongest one not featured in the last three weeks is handed to the morning read to
 * explain, research and chart. Pure.
 */

import type { Pattern, Signal } from "../scout";
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
  return [...patterns].filter((p) => p.p < LEAD.maxP && !resting.has(p.id)).sort((x, y) => leadStrength(y) - leadStrength(x))[0] ?? null;
}

export const leadRef = (p: Pattern): LeadRef => ({ id: p.id, a: p.a.id, b: p.b.id, lag: p.lag });

const num = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-GB") : v.toFixed(1));

/** For the morning read's context: the link, its numbers, and what to do with it. */
export function leadLines(p: Pattern): string[] {
  const avgs = p.onAvg != null && p.offAvg != null ? `; ${p.b.name} averaged ${num(p.onAvg)} on ${p.a.yes ?? `high-${p.a.name}`} days vs ${num(p.offAvg)} otherwise` : "";
  return [
    "## Today's lead — a link the app found and tested in their own data (the morning's \"pattern\" item is about THIS one, as a \"connection\")",
    `- ${p.text}`,
    `- How strong: rank correlation ${p.r.toFixed(2)} over ${p.n} days (p ${p.p < 0.0001 ? "< 0.0001" : p.p.toFixed(4)}), weekdays and weekends compared apart; it held on ${p.held} of ${p.of} days${avgs}. ${p.lag ? `${p.a.name} one day, ${p.b.name} the next.` : "The same day."} The app checks ~200 pairs and only leads with one this strong — chance alone gets there about 1 time in 30, so "sure": "yours", but say it's their data, not a study.`,
    `- The item: say it plainly with these numbers ("goes with", never "causes"; "sure": "yours"). Search the web for WHY it might happen — a mechanism or a study — and cite it as its "source". Give the "chain" from ${p.a.name} to ${p.b.name}, each link with how sure it is. The "tip" tests it: what to do (or skip) on the next days, and that the app is watching ${p.b.name}. Leave "measure" out — the app draws both, ${p.a.name} over ${p.b.name}, for 14 days.`,
  ];
}

/** The lead's chart: `a` on each of the last `n` days to yesterday, and `b` that day (or the next, with a lag). */
export function leadSeries(ref: LeadRef, facts: DayFacts[], signals: Signal[], yesterday: string, n = 14):
  { days: string[]; a: { name: string; vals: (number | null)[]; yes: boolean; unit?: string }; b: { name: string; vals: (number | null)[]; unit?: string } } | null {
  const sa = signals.find((s) => s.id === ref.a), sb = signals.find((s) => s.id === ref.b);
  if (!sa || !sb) return null;
  const by = new Map(facts.map((f) => [f.day, f]));
  const days = Array.from({ length: n }, (_, i) => addDays(yesterday, i - n + 1 - ref.lag));
  const at = (s: Signal, d: string) => { const f = by.get(d); return f ? s.get(f) : null; };
  return {
    days,
    a: { name: sa.name, vals: days.map((d) => at(sa, d)), yes: !!sa.yes, unit: sa.unit },
    b: { name: sb.name, vals: days.map((d) => at(sb, addDays(d, ref.lag))), unit: sb.unit },
  };
}

/** The answer's item that explains the lead — its first connection, else its pattern — with the lead attached. */
export function withLead<T extends { type: string; lead?: LeadRef }>(items: T[], p: Pattern | null): T[] {
  if (!p) return items;
  const k = items.findIndex((i) => i.type === "connection") >= 0 ? items.findIndex((i) => i.type === "connection") : items.findIndex((i) => i.type === "pattern");
  return k < 0 ? items : items.map((i, n) => (n === k ? { ...i, lead: leadRef(p) } : i));
}
