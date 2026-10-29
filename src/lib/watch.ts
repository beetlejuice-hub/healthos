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
 * the reads and the pattern finder see them like any other. Stop ends it.
 *
 * Phase 2 (owner: "phase2"): what it's about — a supplement in the stack, gym sessions, cardio, a food or drink, or what a
 * check-in says you were up to — ties it to the data. Your data on it: the evening answers on days it happened against
 * days it didn't (Welch, lib/stats difference), and for a feeling, the check-in after each time against the one before
 * (paired, t). Each says early (too few), not clear, or clear. And a watch can ask right after the thing itself (30 minutes
 * after a walk) instead of each evening. Pure.
 */

import type { Entry, Workout } from "./types";
import { addDays, dayLabel, localDay } from "./time";
import type { Sure } from "./ai/tasks";
import { difference, mean, paired } from "./stats";
import { phraseOf } from "./feel";

export type WatchFind = { text: string; sure: Sure; source?: { title: string; url: string } };
export const CAUSES = ["supplement", "workout", "cardio", "food", "drink", "doing"] as const;
/** What it's about in the data: a supplement in the stack (its id), gym sessions, cardio ("walk"), a food or drink by name, or a check-in's "up to" tag. */
export type WatchCause = { kind: (typeof CAUSES)[number]; name: string; suppId?: string };
export const FEELS = ["mood", "energy", "focus", "stress"] as const;
export type WatchFeel = (typeof FEELS)[number];
export type Watch = {
  id: string; at: number; /** the first day */ start: string;
  /** "Creatine → fuller muscles" */ what: string;
  /** your words */ note: string;
  /** asked each evening */ question: string; options: string[];
  days: number;
  /** what's out there, with how sure */ found: WatchFind[];
  stopped?: number;
  /** what it's about in the data (phase 2) */ cause?: WatchCause;
  /** the check-in feeling it should move, if one: "better after a walk" → energy or mood */ feel?: WatchFeel;
  /** when it asks: each evening (the default), or this many minutes after each time it happened */ afterMin?: number;
};
export const WATCH = { minDays: 7, maxDays: 28, days: 14, from: 18, max: 6, options: [2, 4], after: 30, afterMax: 180, window: 3 * 60, history: 60, gap: 10 } as const;
const MIN = 60_000, DAY = 86_400_000;
export type WatchData = { entries: Entry[]; workouts: Workout[] };
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const has = (s: string | undefined, q: string) => !!s && fold(s).includes(fold(q));
const ANY_SESSION = /^(gym|workout|training|lifting|session|a session|sessions)$/i;

export const watchKey = (w: Pick<Watch, "id">) => `watch:${w.id}`;
/** Which day of it this is: 1 on the first. */
export const watchDay = (w: Pick<Watch, "start">, now: number) => Math.round((new Date(`${localDay(now)}T12:00`).getTime() - new Date(`${w.start}T12:00`).getTime()) / 86_400_000) + 1;
export const watchLive = (w: Watch, now: number) => !w.stopped && watchDay(w, now) <= w.days;
export const watchAnswers = (w: Pick<Watch, "id">, entries: Entry[]) =>
  entries.filter((e): e is Extract<Entry, { kind: "answer" }> => e.kind === "answer" && e.key === watchKey(w)).sort((a, b) => a.at - b.at);

/** Each time it happened, start to end: a supplement taken, a session, a cardio session, a food or drink, a check-in that says so. */
export function causeSpans(c: WatchCause, d: WatchData): [number, number][] {
  const t: [number, number][] = [];
  if (c.kind === "supplement") for (const e of d.entries) { if (e.kind === "supp" && e.status === "taken" && e.suppId === c.suppId) t.push([e.at, e.at]); }
  if (c.kind === "workout") for (const w of d.workouts) { if (w.endedAt && w.kind !== "cardio" && (ANY_SESSION.test(c.name.trim()) || has(w.template, c.name))) t.push([w.startedAt, w.endedAt]); }
  if (c.kind === "cardio") for (const w of d.workouts) { if (w.endedAt && w.kind === "cardio" && (has(w.cardio?.what ?? w.template, c.name) || has(w.template, c.name))) t.push([w.startedAt, w.endedAt]); }
  if (c.kind === "food" || c.kind === "drink") for (const e of d.entries) { if (e.kind === c.kind && has(e.name, c.name)) t.push([e.at, e.at]); }
  if (c.kind === "doing") for (const e of d.entries) { if (e.kind === "feel" && e.doing?.some((x) => has(x, c.name) || has(phraseOf(x), c.name))) t.push([e.at, e.at]); }
  return t.sort((a, b) => a[1] - b[1]);
}
/** …when each ended. */
export const causeTimes = (c: WatchCause, d: WatchData): number[] => causeSpans(c, d).map((x) => x[1]);

/**
 * Its question is due. Each evening: still running, from 18:00, not answered today. After the thing: from 30 minutes
 * after the latest time it happened (within 3 hours), once for that time.
 */
export function watchDue(w: Watch, entries: Entry[], now: number, workouts: Workout[] = []): boolean {
  if (!watchLive(w, now)) return false;
  const as = watchAnswers(w, entries);
  if (w.afterMin && w.cause) {
    const last = causeTimes(w.cause, { entries, workouts }).filter((t) => t >= w.at - DAY && now - t >= w.afterMin! * MIN && now - t <= WATCH.afterMax * MIN).at(-1);
    return last != null && !as.some((a) => a.at > last);
  }
  if (new Date(now).getHours() < WATCH.from) return false;
  const today = localDay(now);
  return !as.some((a) => localDay(a.at) === today);
}
/** The time an after-ask is about, for its card: "you logged a walk at 17:05". */
export const watchAfterOf = (w: Watch, d: WatchData, now: number) => (w.afterMin && w.cause ? causeTimes(w.cause, d).filter((t) => t <= now - w.afterMin! * MIN).at(-1) ?? null : null);

export type WatchFinding = { text: string; label: "early" | "not clear" | "clear" };
const r1 = (n: number) => String(Math.round(n * 10) / 10);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * Your data on a watch (phase 2). Days: its evening answers on days it happened against days it didn't — 3 of each before
 * anything is said. Check-ins: for a feeling, the check-in within 3 hours after each time against the one within 3 hours
 * before (for a check-in tag, the one before it), over the last 60 days — 3 times before anything is said.
 */
export function watchFindings(w: Watch, d: WatchData, now: number): WatchFinding[] {
  const out: WatchFinding[] = [];
  if (!w.cause) return out;
  const spans = causeSpans(w.cause, d), times = spans.map((x) => x[1]), name = w.cause.name.toLowerCase();
  // the evening answers: on its days against the rest
  const as = watchAnswers(w, d.entries), top = w.options.length - 1;
  if (!w.afterMin && as.length) {
    const days = new Set(times.map(localDay));
    const on = as.filter((a) => days.has(localDay(a.at))).map((a) => w.options.indexOf(a.answer)).filter((v) => v >= 0);
    const off = as.filter((a) => !days.has(localDay(a.at))).map((a) => w.options.indexOf(a.answer)).filter((v) => v >= 0);
    const r = difference(on, off);
    if (!r) out.push({ label: "early", text: off.length === 0 && on.length >= 3 ? `${plural(on.length, "answer")}, all on ${name} days — nothing to compare yet` : `${plural(as.length, "answer")}: ${on.length} on ${name} days, ${off.length} without — 3 of each before it can say` });
    else out.push({ label: r.clear ? "clear" : "not clear", text: `on ${name} days you answered “${w.options[Math.round(mean(on))]}” (${r1(mean(on))} of ${top}), without “${w.options[Math.round(mean(off))]}” (${r1(mean(off))})` });
  }
  // check-ins around each time
  if (w.feel) {
    const f = w.feel, checks = d.entries.filter((e): e is Extract<Entry, { kind: "feel" }> => e.kind === "feel" && typeof e[f] === "number").sort((a, b) => a.at - b.at);
    const diffs: number[] = [];
    const tag = w.cause.kind === "doing"; // the check-in that says so is the "after"; the one before it, within 6 hours
    for (const [a, b] of spans.filter(([, e]) => e >= now - WATCH.history * DAY && e <= now)) {
      const after = tag ? checks.find((c) => c.at === b) : checks.find((c) => c.at > b + WATCH.gap * MIN && c.at <= b + WATCH.window * MIN);
      const before = [...checks].reverse().find((c) => c.at < a && c.at >= a - WATCH.window * MIN * (tag ? 2 : 1));
      if (after && before) diffs.push(after[f]! - before[f]!);
    }
    const r = paired(diffs);
    const by = `${r ? r.value >= 0 ? "+" : "−" : ""}${r ? r1(Math.abs(r.value)) : ""}`;
    if (!r) out.push({ label: "early", text: tag ? `${plural(diffs.length, "check-in")} that said “${name}” with one before it so far — 3 before it can say` : `${plural(diffs.length, "time")} with a check-in before and after ${name} so far — 3 before it can say` });
    else out.push({ label: r.clear ? "clear" : "not clear", text: tag ? `on ${r.n} check-ins that said “${name}”, ${f} was ${by} against the check-in before` : `after ${plural(r.n, name.replace(/s$/, ""))}, ${f} at your next check-in was ${by} against the one before` });
  }
  return out;
}

/** "Day 6 of 14 · 5 answers so far". */
export function watchProgress(w: Watch, entries: Entry[], now: number): string {
  const n = watchAnswers(w, entries).length, d = Math.min(watchDay(w, now), w.days);
  return `Day ${d} of ${w.days}${n ? ` · ${n} answer${n > 1 ? "s" : ""} so far` : ""}`;
}

/** Each answer as its place among the options (0 = the first), oldest first — the list's little bars. */
export const watchSteps = (w: Watch, entries: Entry[]) => watchAnswers(w, entries).map((a) => Math.max(0, w.options.indexOf(a.answer)));

/** For the AI: each watch, its days, its answers by day, your data on it, and what's out there. */
export function watchLines(watches: Watch[], d: WatchData, now: number): string[] {
  return watches.filter((w) => !w.stopped && watchDay(w, now) <= w.days + 7).map((w) => {
    const as = watchAnswers(w, d.entries).slice(-10).map((a) => `${dayLabel(a.at).split(" ").slice(0, 2).join(" ")} ${a.answer}`), fs = watchFindings(w, d, now);
    const done = watchDay(w, now) > w.days;
    return `${w.what} — my note: "${w.note}"; ${done ? `ended ${dayLabel(new Date(`${addDays(w.start, w.days - 1)}T12:00`).getTime())}` : `day ${watchDay(w, now)} of ${w.days}`}, asks "${w.question}" (${w.options.join(" / ")}) ${w.afterMin && w.cause ? `${w.afterMin} min after each ${w.cause.name.toLowerCase()}` : "each evening"}; answers: ${as.length ? as.join(", ") : "none yet"}${fs.length ? `; my data (the app's test): ${fs.map((f) => `${f.text} (${f.label})`).join("; ")}` : ""}${w.found.length ? `; found before: ${w.found.map((f) => `${f.text} (${f.sure})`).join("; ")}` : ""}`;
  });
}
