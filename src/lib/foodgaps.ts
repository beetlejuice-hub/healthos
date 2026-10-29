/**
 * Days you didn't log food — not days you didn't eat (owner, 27 Oct: "i had this weekend skipped fully... make sure app can
 * still assume some things or recognize that im not logging anything, that means im still eating, and living just not
 * logging" — then "2 yes" to: a day with almost nothing logged counts as not logged everywhere, and the app asks once how
 * you ate). A day is a gap when its food is under half of what you usually eat: nothing, a coffee, only a breakfast. What
 * you say ("like usual", "more", "less") is kept as a guess: the burn counts the day at your usual × that; your usual and
 * the weekly goal still go by what you logged. Pure.
 */

import type { Entry } from "./types";
import { bodyDays } from "./tdee";
import { median } from "./stats";
import { addDays, atMinute } from "./time";

/**
 * lookBack: days before today the question looks at; usualDays: what's usual comes from these; share: under this × usual
 * is a gap; meal: yesterday with at least this × usual (a meal or so) is left to the morning catch-up's "No dinner logged
 * yesterday · Log it" — asked here from the day after.
 */
export const GAP = { lookBack: 7, usualDays: 28, share: 0.5, meal: 0.25, minFull: 7 };
export type Ate = "usual" | "more" | "less" | "unsure";
export const ATE: Record<Ate, { label: string; said: string; factor: number | null }> = {
  usual: { label: "As usual", said: "ate about as usual", factor: 1 },
  more: { label: "More", said: "ate more than usual", factor: 1.25 },
  less: { label: "Less", said: "ate less than usual", factor: 0.75 },
  // "Don't remember", like the other questions about yesterday (reform T1)
  unsure: { label: "Don't remember", said: "doesn't remember how they ate", factor: null },
};
export const ateKey = (day: string) => `ate:${day}`;
export const ATE_QUESTION = "How did you eat on a day you didn't log?";

/** What you usually eat in [from, to]: the median of fully logged days (7 at least), and how many there were. */
export function usualIntake(entries: Entry[], from: string, to: string, minFull = GAP.minFull): { kcal: number | null; full: number } {
  const logged = bodyDays(entries, from, to).map((d) => d.kcal).filter((k): k is number => k != null && k > 0);
  if (!logged.length) return { kcal: null, full: 0 };
  const mid = median(logged), full = logged.filter((k) => k >= mid * GAP.share);
  return { kcal: full.length >= minFull ? Math.round(median(full) / 10) * 10 : null, full: full.length };
}

/** Your usual day in the four weeks before `day`. */
export const usualBefore = (entries: Entry[], day: string) => usualIntake(entries, addDays(day, -GAP.usualDays), addDays(day, -1)).kcal;

/** A day's food is a gap: nothing logged, or under half your usual. */
export const isGap = (kcal: number | null | undefined, usual: number) => kcal == null || kcal < usual * GAP.share;

/** What you said about the days you didn't log, by day (the latest answer wins). */
export function ateSaid(entries: Entry[]): Map<string, Ate> {
  const out = new Map<string, Ate>();
  for (const e of [...entries].sort((a, b) => a.at - b.at)) if (e.kind === "answer" && e.key.startsWith("ate:") && e.answer in ATE) out.set(e.key.slice(4), e.answer as Ate);
  return out;
}

/** The answer entries for these days: one each, at noon. */
export const ateEntries = (days: string[], ate: Ate) => days.map((d) => ({ kind: "answer" as const, at: atMinute(d, 12 * 60), key: ateKey(d), question: ATE_QUESTION, answer: ate }));

/**
 * For Today's question: the latest run of days not logged in the week before today, none of them answered yet. Null when
 * there's none, or no usual day to judge by (under 7 fully logged days in four weeks). `answered`: keep days already
 * answered here (ghost logging drafts them either way — saying "ate as usual" doesn't log the coffee).
 */
export function openGap(entries: Entry[], today: string, opts: { answered?: boolean } = {}): { days: string[]; usual: number; kcal: (number | null)[] } | null {
  const usual = usualBefore(entries, today);
  if (usual == null) return null;
  const from = addDays(today, -GAP.lookBack), days = bodyDays(entries, from, addDays(today, -1)), said = ateSaid(entries);
  const run: typeof days = [], yday = addDays(today, -1);
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i], gap = isGap(d.kcal, usual) && (opts.answered || !said.has(d.day));
    if (!run.length && d.day === yday && gap && (d.kcal ?? 0) >= usual * GAP.meal) continue; // the catch-up's, this morning
    if (gap) run.unshift(d);
    else if (run.length) break;
  }
  return run.length ? { days: run.map((d) => d.day), usual, kcal: run.map((d) => d.kcal) } : null;
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Sat 25 – Sun 26 Oct", "yesterday", "Fri 23 Oct" — the same on every phone (Chrome writes "Sun, 26 Oct"). */
export function daysWords(days: string[], today: string): string {
  const f = (d: string, month = true) => `${WD[new Date(`${d}T12:00:00`).getDay()]} ${Number(d.slice(8))}${month ? ` ${MON[Number(d.slice(5, 7)) - 1]}` : ""}`;
  if (days.length === 1) return days[0] === addDays(today, -1) ? "yesterday" : f(days[0]);
  const a = days[0], z = days[days.length - 1];
  return `${f(a, a.slice(5, 7) !== z.slice(5, 7))} – ${f(z)}`;
}

/** For the burn: days you didn't log that you said how you ate, counted at your usual × that. */
export function guessedKcal(entries: Entry[], day: string, kcal: number | null): number | null {
  const ate = ateSaid(entries).get(day), usual = ate ? usualBefore(entries, day) : null;
  if (!ate || usual == null || ATE[ate].factor == null || !isGap(kcal, usual)) return kcal;
  return Math.round(usual * ATE[ate].factor!);
}

