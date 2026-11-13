/**
 * Today's brief (owner, 13 Nov: "A A A … make theese better and smarter"; canvas Today A "the morning brief"). The top
 * of Today: last night and this morning in one or two lines — sleep and its score, HRV against your usual, readiness —
 * one thing to watch, and the few things to do now. Every number from an engine that already exists (lib/sleepscore,
 * lib/readiness, the caffeine curve); this file only picks and words them. A part that isn't known is left out; with
 * none known, no line. Pure.
 */

import type { Moment } from "./moment";

export const BRIEF = { cafWatchMg: 50, hrvNear: 0.05, usualDays: 28, usualMin: 7, checkInH: 4 } as const;

export type BriefIn = {
  moment: Moment;
  /** last night: minutes asleep and the sleep score (null: no band night yet) */
  night: { asleepMin: number; score: number } | null;
  /** this morning's HRV and your usual (the median of the 28 mornings before) */
  hrv: { today: number; usual: number } | null;
  ready: { score: number; word: string } | null;
  /** caffeine still in you at tonight's bedtime (mg), and that bedtime as a clock */
  cafBed: number; bedClock: string;
};

const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}`;
export const GREET: Record<Moment, string> = { morning: "Good morning", day: "Today so far", evening: "This evening" };

/** "Slept 7 h 30, score 88. HRV 50, above your usual 46. Readiness 86: ready." — or null when nothing is known. */
export function briefLine(b: BriefIn): string | null {
  // by evening, last night and this morning's readiness are old news: the brief is about tonight then (briefWatch)
  if (b.moment === "evening") return null;
  const parts: string[] = [];
  if (b.night) parts.push(`Slept ${hm(b.night.asleepMin)}, score ${Math.round(b.night.score)}.`);
  if (b.hrv) {
    const d = (b.hrv.today - b.hrv.usual) / b.hrv.usual, t = Math.round(b.hrv.today), u = Math.round(b.hrv.usual);
    parts.push(Math.abs(d) < BRIEF.hrvNear ? `HRV ${t}, your usual.` : `HRV ${t}, ${d > 0 ? "above" : "below"} your usual ${u}.`);
  }
  if (b.ready) parts.push(`Readiness ${Math.round(b.ready.score)}: ${b.ready.word}.`);
  return parts.length ? parts.join(" ") : null;
}

/** One thing to watch today, or null: caffeine that would still be in you at bedtime. */
export function briefWatch(b: BriefIn): string | null {
  if (b.cafBed >= BRIEF.cafWatchMg) return `About ${Math.round(b.cafBed / 10) * 10} mg of caffeine will still be in you at ${b.bedClock}, your bedtime.`;
  if (b.moment === "evening") return `Bed by ${b.bedClock} keeps your week regular.`;
  return null;
}

/** Your usual HRV: the median of up to 28 mornings before today, with 7 at least. */
export function usualOf(byDay: Record<string, number> | undefined, today: string, days: number = BRIEF.usualDays): number | null {
  const v = Object.entries(byDay ?? {}).filter(([d]) => d < today).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, days).map(([, x]) => x).filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length < BRIEF.usualMin) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Ask for a check-in when the last was this many hours ago or more (or never today). */
export const checkInDue = (lastFeel: number | null, now: number) => lastFeel == null || now - lastFeel >= BRIEF.checkInH * 3600_000;
