/**
 * Watching: what you notice about yourself becomes something the app looks out for (owner, 28 Oct: "make questions
 * smarter, follow up questions for htings i note. make sure if i note like i feel creatine makes my muscles fuller, or
 * like i feel better after a walk, or better after gym, to make ai look out for these things, peoples opinions on forums
 * like reddit, and scientific papers, give me followup questions"; picked "Watch and ask later" for the AI's tools, and
 * the canvas's Watching boards: "like all, lets build it").
 *
 * A note → the AI proposes a watch (lib/ai/propose "watch"; nothing happens before you tap "Watch it"): what it's about
 * in a few words, your words, one follow-up question with 2–4 answers asked each evening for 7–28 days, and what's out
 * there — studies and forums, each with how sure. Its answers are ordinary answer entries (key "watch:<id>"), so the AI,
 * the reads and the pattern finder see them like any other. Stop ends it. Pure.
 */

import type { Entry } from "./types";
import { addDays, dayLabel, localDay } from "./time";
import type { Sure } from "./ai/tasks";

export type WatchFind = { text: string; sure: Sure; source?: { title: string; url: string } };
export type Watch = {
  id: string; at: number; /** the first day */ start: string;
  /** "Creatine → fuller muscles" */ what: string;
  /** your words */ note: string;
  /** asked each evening */ question: string; options: string[];
  days: number;
  /** what's out there, with how sure */ found: WatchFind[];
  stopped?: number;
};
export const WATCH = { minDays: 7, maxDays: 28, days: 14, from: 18, max: 6, options: [2, 4] } as const;

export const watchKey = (w: Pick<Watch, "id">) => `watch:${w.id}`;
/** Which day of it this is: 1 on the first. */
export const watchDay = (w: Pick<Watch, "start">, now: number) => Math.round((new Date(`${localDay(now)}T12:00`).getTime() - new Date(`${w.start}T12:00`).getTime()) / 86_400_000) + 1;
export const watchLive = (w: Watch, now: number) => !w.stopped && watchDay(w, now) <= w.days;
export const watchAnswers = (w: Pick<Watch, "id">, entries: Entry[]) =>
  entries.filter((e): e is Extract<Entry, { kind: "answer" }> => e.kind === "answer" && e.key === watchKey(w)).sort((a, b) => a.at - b.at);

/** Its question is due: still running, from 18:00, not answered today. */
export function watchDue(w: Watch, entries: Entry[], now: number): boolean {
  if (!watchLive(w, now) || new Date(now).getHours() < WATCH.from) return false;
  const today = localDay(now);
  return !watchAnswers(w, entries).some((a) => localDay(a.at) === today);
}

/** "Day 6 of 14 · 5 answers so far". */
export function watchProgress(w: Watch, entries: Entry[], now: number): string {
  const n = watchAnswers(w, entries).length, d = Math.min(watchDay(w, now), w.days);
  return `Day ${d} of ${w.days}${n ? ` · ${n} answer${n > 1 ? "s" : ""} so far` : ""}`;
}

/** Each answer as its place among the options (0 = the first), oldest first — the list's little bars. */
export const watchSteps = (w: Watch, entries: Entry[]) => watchAnswers(w, entries).map((a) => Math.max(0, w.options.indexOf(a.answer)));

/** For the AI: each watch, its days, its answers by day, and what's out there. */
export function watchLines(watches: Watch[], entries: Entry[], now: number): string[] {
  return watches.filter((w) => !w.stopped && watchDay(w, now) <= w.days + 7).map((w) => {
    const as = watchAnswers(w, entries).slice(-10).map((a) => `${dayLabel(a.at).split(" ").slice(0, 2).join(" ")} ${a.answer}`);
    const done = watchDay(w, now) > w.days;
    return `${w.what} — my note: "${w.note}"; ${done ? `ended ${dayLabel(new Date(`${addDays(w.start, w.days - 1)}T12:00`).getTime())}` : `day ${watchDay(w, now)} of ${w.days}`}, asks "${w.question}" (${w.options.join(" / ")}) each evening; answers: ${as.length ? as.join(", ") : "none yet"}${w.found.length ? `; found before: ${w.found.map((f) => `${f.text} (${f.sure})`).join("; ")}` : ""}`;
  });
}
