/**
 * How often a supplement is taken (PLAN 190; owner, 3 Nov: "Should be able to set supplements not as daily but cycling,
 * taking only when needing it like l theanine so i should have rhe option to log it but not every day i need it").
 *   - every day (no schedule): on the daily list, ticked, reminded, asked about the next morning;
 *   - when needed: never on the daily list — logged with "+ name" when taken, never asked about, never reminded;
 *   - a cycle: `on` days taken, then `off` days not, from `from`: on the list on its on days only.
 * Nothing changes for the engines: a day it isn't logged on still counts as not taken (lib/suppdays), so a when-needed
 * one's days without it, and a cycle's off days, are the "without" days the comparisons need. Pure.
 */

import type { Supplement } from "./types";
import { addDays, dayLabel } from "./time";

export type Schedule = { kind: "needed" } | { kind: "cycle"; on: number; off: number; from: string };
export const CYCLES: { on: number; off: number; label: string }[] = [
  { on: 5, off: 2, label: "5 days on · 2 off" },
  { on: 21, off: 7, label: "3 weeks on · 1 off" },
  { on: 56, off: 28, label: "8 weeks on · 4 off" },
];

const daysFrom = (from: string, day: string) => Math.round((Date.parse(day) - Date.parse(from)) / 86_400_000);

/** Where a cycle is on `day`: on or off, which day of that stretch (1 = the first), and the first day of the next stretch. */
export function cycleOn(c: Extract<Schedule, { kind: "cycle" }>, day: string): { on: boolean; dayOf: number; of: number; next: string } {
  const n = c.on + c.off, k = ((daysFrom(c.from, day) % n) + n) % n, on = k < c.on;
  return { on, dayOf: on ? k + 1 : k - c.on + 1, of: on ? c.on : c.off, next: addDays(day, on ? c.on - k : n - k) };
}

/** On the daily list that day: every day, or a cycle's on days; never one taken when needed. */
export function dueOn(s: Pick<Supplement, "schedule">, day: string): boolean {
  const c = s.schedule;
  return !c ? true : c.kind === "needed" ? false : cycleOn(c, day).on;
}

const words = (n: number) => (n % 7 === 0 && n >= 14 ? `${n / 7} weeks` : n === 7 ? "1 week" : `${n} day${n === 1 ? "" : "s"}`);
/** "every day" · "when needed" · "5 days on, 2 off" */
export function scheduleWords(s: Pick<Supplement, "schedule">): string {
  const c = s.schedule;
  return !c ? "every day" : c.kind === "needed" ? "when needed" : `${words(c.on)} on, ${words(c.off)} off`;
}

/** Where it stands today, for the stack: "on — day 2 of 5" · "off until Mon 9 Nov" · "log it when you take it". */
export function scheduleToday(s: Pick<Supplement, "schedule">, day: string): string {
  const c = s.schedule;
  if (!c) return "";
  if (c.kind === "needed") return "log it when you take it";
  const w = cycleOn(c, day);
  return w.on ? `on — day ${w.dayOf} of ${w.of}` : `off — back on ${dayLabel(new Date(`${w.next}T12:00`).getTime())}`;
}
