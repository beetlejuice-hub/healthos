/**
 * "A pattern, with today on it" (owner, 28 Oct: "Now the today page feels too empty" · "I liked charts and connecting
 * dots, trying to find patterns in a lot of data points"; picked "A pattern with today on it", then "Today's pattern card").
 * One of the app's own tested links (lib/scout — only ones that cleared its bar) as a scatter: each dot a day, the first
 * thing across, the second up (the same day or the next, as the link was found), a line through them, and today placed
 * on it — where today is so far, and what the line goes with there. Up to 3, strongest first, the ones today can be put
 * on before the others. Pure.
 */

import type { Pattern } from "./scout";
import type { DayFacts } from "./insights";
import { leadGrade, leadStrength } from "./ai/lead";
import { mean, slope } from "./stats";

export const PATTERN = { days: 60, cards: 3 } as const;

export type PatternCard = {
  id: string;
  title: string;
  /** each day: [the first thing, the second] */
  pts: [number, number][];
  days: string[];
  fit: { slope: number; at: (x: number) => number } | null;
  yes: boolean;
  /** today so far, on the first thing; null when today has nothing for it yet */
  today: number | null;
  /** the line at today's value */
  onLine: number | null;
  text: string;
  grade: "strong" | "early";
  a: { name: string; unit?: string; yes?: string };
  b: { name: string; unit?: string };
  lag: 0 | 1;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One link as a card: the last 60 days' pairs (the second thing only once its day is over), the line, today on it. */
export function patternCard(p: Pattern, facts: DayFacts[], today: string): PatternCard {
  const done = facts.filter((f) => f.day < today).sort((x, y) => (x.day < y.day ? -1 : 1)).slice(-PATTERN.days - p.lag);
  const pts: [number, number][] = [], days: string[] = [];
  done.forEach((d, i) => {
    const e = done[i + p.lag]; if (!e) return;
    const x = p.a.get(d), y = p.b.get(e);
    if (x == null || y == null) return;
    pts.push([x, y]); days.push(d.day);
  });
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]), k = slope(xs, ys);
  const fit = Number.isFinite(k) ? { slope: k, at: (x: number) => mean(ys) + k * (x - mean(xs)) } : null;
  const todayFacts = facts.find((f) => f.day === today), t = todayFacts ? p.a.get(todayFacts) : null;
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const onLine = t != null && fit ? Math.max(lo, Math.min(hi, fit.at(t))) : null;
  return {
    id: p.id, title: `${cap(p.a.name)} → ${p.b.name}${p.lag ? " the next day" : ""}`, pts, days, fit, yes: !!p.a.yes, today: t ?? null, onLine,
    text: p.text, grade: leadGrade(p), a: { name: p.a.name, unit: p.a.unit, yes: p.a.yes }, b: { name: p.b.name, unit: p.b.unit }, lag: p.lag,
  };
}

/** The cards for Today: strongest first, the ones with today on them before the rest; enough days to draw. */
export function patternCards(patterns: Pattern[], facts: DayFacts[], today: string): PatternCard[] {
  return [...patterns].sort((x, y) => leadStrength(y) - leadStrength(x)).map((p) => patternCard(p, facts, today))
    .filter((c) => c.pts.length >= 10)
    .sort((x, y) => Number(y.today != null) - Number(x.today != null))
    .slice(0, PATTERN.cards);
}

const num = (v: number, unit?: string) => {
  const r = Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-GB") : Math.round(v * 10) / 10;
  return unit ? `${r} ${unit}` : String(r);
};

/** "Today: 80 mg so far — on the line, that goes with sleep 6.4 h the next day." */
export function todayWords(c: PatternCard): string {
  if (c.today == null) return `Today: no ${c.a.name} logged yet.`;
  const now = c.yes ? (c.today > 0 ? `${c.a.yes ?? `${c.a.name}`} so far` : `no ${c.a.name} so far`) : `${num(c.today, c.a.unit)} so far`;
  return c.onLine == null ? `Today: ${now}.` : `Today: ${now} — on the line, that goes with ${c.b.name} ${num(c.onLine, c.b.unit)}${c.lag ? " the next day" : ""}.`;
}
