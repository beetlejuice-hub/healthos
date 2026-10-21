/**
 * The weekly deep dive (PLAN 160; owner, 21 Oct: "do 2, 1, 3, 4" and "3: ai" — the AI picks the topic). Once a week, from
 * Sunday 09:00 (or the first time the app is opened after that, that week), the AI picks one question worth a deep look
 * from your data, researches it — studies on the web, your own numbers from the app's look-ups — and answers it with a
 * verdict and one experiment to try. "Pick another" asks again, at most twice a week, never a topic it's done. Pure.
 */

import { addDays, localDay } from "../time";
import type { Entry } from "../types";

export const DIVE = { fromHour: 9, repicks: 2, keep: 12, minDays: 10 } as const;

/** The week a dive belongs to: the Sunday it's due from (before Sunday 09:00, the Sunday before). */
export function diveKey(now: number): string {
  const d = new Date(now), today = localDay(now), dow = d.getDay();
  const back = dow === 0 && d.getHours() < DIVE.fromHour ? 7 : dow;
  return addDays(today, -back);
}

/** Due when this week's isn't written yet — and there's enough of you to dig into (10 days with something logged in the last 4 weeks). */
export function diveDue(now: number, last: { key: string } | null | undefined, entries: Pick<Entry, "at">[]): string | null {
  const key = diveKey(now);
  if (last?.key === key) return null;
  const from = now - 28 * 86_400_000, days = new Set(entries.filter((e) => e.at >= from && e.at <= now).map((e) => localDay(e.at)));
  return days.size >= DIVE.minDays ? key : null;
}

/** What the dive is told besides your data: its topics so far (never again), and — on "pick another" — the one to leave. */
export function diveBrief(past: { topic: string }[], skip: string[] = []): string[] {
  return [
    "## This week's deep dive (the app's ask)",
    "- Pick ONE question from their own data worth a deep look — something unsettled for them: a pattern the app found likely but not clear, a note they keep writing, a supplement they take with no clear effect yet, a sleep, energy, training or food question their numbers raise. Not a generic topic.",
    ...(past.length ? [`- Topics already done — never again: ${past.slice(-DIVE.keep).map((p) => p.topic).join(" | ")}`] : []),
    ...(skip.length ? [`- They asked for another topic: not ${skip.map((t) => `"${t}"`).join(", not ")} — pick something different.`] : []),
  ];
}
