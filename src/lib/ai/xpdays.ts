/**
 * An experiment's days (PLAN 189; owner, 3 Nov: "It should follow up every morning on last days experiment- if i did it or
 * not. If not it should skip that day from experiment. Like i cant guarantee I'll do 14 days w no phone at night").
 *
 * Each morning asks about the day before: did you do it? A day you didn't is left out of the test and the experiment runs a
 * day longer, so "14 days" means 14 days done — at most twice its days in all, then it ends with what it has. A day with
 * no answer counts (nothing said against it), so experiments from before this keep their days. A day is asked about for
 * 3 days; the end waits for the last day's answer that long, so a "didn't" on the last day isn't missed. Pure.
 */

import type { Experiment } from "../store";
import { addDays } from "../time";

export const XP = { askBack: 3, stretch: 2, from: 4 } as const;

/** The days you said you didn't do it, oldest first. */
export const xpSkipped = (x: Pick<Experiment, "did" | "start">) => Object.keys(x.did ?? {}).filter((d) => x.did![d] === false && d >= x.start).sort();

/** The first day after it: its days, one more for each you didn't do, at most twice its days. */
export const xpEnd = (x: Pick<Experiment, "did" | "start" | "days">) => addDays(x.start, Math.min(x.days + xpSkipped(x).length, x.days * XP.stretch));

const between = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000));

/** The days that counted before `upto` (not included): the days in it, less the ones left out. */
export function xpCounted(x: Pick<Experiment, "did" | "start" | "days">, upto: string): number {
  const stop = [upto, xpEnd(x)].sort()[0];
  return between(x.start, stop) - xpSkipped(x).filter((d) => d < stop).length;
}

/** What the morning asks: the days of it in the last 3, before today, not answered yet — newest first. */
export function xpToAsk(x: Experiment, today: string): string[] {
  if (x.ended || x.verdict) return [];
  const end = xpEnd(x), out: string[] = [];
  for (let k = 1; k <= XP.askBack; k++) {
    const d = addDays(today, -k);
    if (d >= x.start && d < end && x.did?.[d] == null) out.push(d);
  }
  return out;
}

/** It has had its days: past its end, and its last day answered (or past being asked). */
export const xpOver = (x: Experiment, today: string) => xpEnd(x) <= (x.ended ?? today) && (!!x.ended || !xpToAsk(x, today).length);
