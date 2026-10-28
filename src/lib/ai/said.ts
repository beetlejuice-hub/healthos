/**
 * What the AI has told you, so it stops saying it (owner, 28 Oct: "in the last liike 7 days it only recommended me to
 * take in more protein w breakfast, it gets boring, it can repeat sometimes but not every day dude...should keep a log of
 * what it said, what it thinks of me, what it should dive in more, what it should research etc, so it doesnt forget
 * things it already said a million trimes").
 *  - said: every piece of advice a read gives — an item (its title and tip), a "Tomorrow, maybe" — under a topic the AI
 *    names ("protein-breakfast"), reusing the name for the same advice in other words. The reads see it by topic, and a
 *    topic said in the last 5 days is dropped by the app whatever the AI wrote ("high-protein-breakfast" is the same
 *    topic: one's words inside the other's).
 *  - what it thinks of you: the memory it already keeps (Settings → AI).
 *  - to look into: what a read wanted to dig into and had no room for; the deep dive picks from it first, and a read
 *    that covers one closes it.
 * Pure.
 */

import { dayLabel } from "../time";

export type SaidFrom = "morning" | "evening";
export type Said = { topic: string; text: string; at: number; from: SaidFrom };
export type Thread = { id: string; text: string; at: number };
export const SAID = { rest: 5, days: 30, keep: 150, lines: 25, threads: 10, threadDays: 30 } as const;
const DAY = 86_400_000;
const STOP = new Set(["the", "and", "for", "with", "your", "you", "more", "less", "before", "after", "into", "from", "that", "this", "try", "tip", "day", "days", "has", "have", "was", "are", "its", "got", "why", "what", "how", "not", "now"]);

const slug = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
/** A topic's name: the AI's, cleaned ("Protein breakfast" → "protein-breakfast"); without one, the title's first words that carry meaning. */
export function topicKey(raw: unknown, fallback = ""): string {
  const k = typeof raw === "string" ? slug(raw).slice(0, 40).replace(/-+$/, "") : "";
  if (k.length >= 3) return k;
  return slug(fallback).split("-").filter((w) => w.length > 2 && !STOP.has(w)).slice(0, 3).join("-") || "other";
}
const words = (k: string) => new Set(k.split("-").filter((w) => w.length > 2 && !STOP.has(w)));
/** The same topic in other words: one's words all in the other's ("protein-breakfast" / "high-protein-breakfast"). */
export function sameTopic(a: string, b: string): boolean {
  if (a === b) return true;
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return false;
  const [small, big] = x.size <= y.size ? [x, y] : [y, x];
  return [...small].every((w) => big.has(w));
}

type Item = { title: string; tip?: string; topic?: string };
type Change = { what: string; topic?: string };
/** The advice in a read, to keep: each item (title — tip) and each change, under its topic. */
export function adviceOf(a: { items?: Item[]; change?: Change[] }, from: SaidFrom, at: number): Said[] {
  return [
    ...(a.items ?? []).map((i) => ({ topic: topicKey(i.topic, i.title), text: i.tip ? `${i.title} — ${i.tip}` : i.title, at, from })),
    ...(a.change ?? []).map((c) => ({ topic: topicKey(c.topic, c.what), text: c.what, at, from })),
  ];
}
/** The log with a read's advice added: the last 30 days, at most 150. */
export const keepSaid = (said: Said[], add: Said[], now: number): Said[] => [...said, ...add].filter((s) => now - s.at < SAID.days * DAY).slice(-SAID.keep);

/** What's resting: a topic said in the last 5 days. */
const resting = (said: Said[], now: number) => said.filter((s) => now - s.at < SAID.rest * DAY).map((s) => s.topic);

/** A read's items or changes without the topics that are resting, and without a topic twice in one read. */
export function dropSaid<T extends { topic?: string }>(xs: T[], said: Said[], now: number, title: (x: T) => string): { kept: T[]; dropped: T[] } {
  const rest = resting(said, now), seen: string[] = [], kept: T[] = [], dropped: T[] = [];
  for (const x of xs) {
    const k = topicKey(x.topic, title(x));
    if (rest.some((r) => sameTopic(r, k)) || seen.some((s) => sameTopic(s, k))) dropped.push(x);
    else { seen.push(k); kept.push({ ...x, topic: k }); }
  }
  return { kept, dropped };
}

/** What's been said, by topic, newest first: how often, the first and last time, and until when it rests. */
export function saidTopics(said: Said[], now: number): { topic: string; n: number; first: number; last: Said; restUntil: number | null }[] {
  const by = new Map<string, Said[]>();
  for (const s of said) if (now - s.at < SAID.days * DAY) by.set(s.topic, [...(by.get(s.topic) ?? []), s]);
  return [...by.entries()].sort((a, b) => b[1].at(-1)!.at - a[1].at(-1)!.at).slice(0, SAID.lines).map(([topic, ss]) => {
    const last = ss.at(-1)!, until = last.at + SAID.rest * DAY;
    return { topic, n: ss.length, first: ss[0].at, last, restUntil: until > now ? until : null };
  });
}
/** …as lines for the reads. */
export const saidLines = (said: Said[], now: number): string[] => saidTopics(said, now).map((t) =>
  `${t.topic} — ${t.n}× since ${dayLabel(t.first)}, last ${dayLabel(t.last.at)} (${t.last.from}): "${t.last.text.slice(0, 120)}"${t.restUntil ? ` — resting until ${dayLabel(t.restUntil)}` : ""}`);

/** The to-look-into list with a read's new ones (no doubles, at most 10, a month each). */
export function addThreads(threads: Thread[], texts: unknown, now: number, id: () => string): Thread[] {
  const live = threads.filter((t) => now - t.at < SAID.threadDays * DAY);
  const add = (Array.isArray(texts) ? texts : []).filter((t): t is string => typeof t === "string" && t.trim().length > 8).map((t) => t.trim().slice(0, 200))
    .filter((t, i, all) => all.indexOf(t) === i && !live.some((x) => x.text.toLowerCase() === t.toLowerCase())).slice(0, 2);
  return [...live, ...add.map((text) => ({ id: id(), text, at: now }))].slice(-SAID.threads);
}
/** …without the ones a read or the deep dive says it covered. */
export const closeThreads = (threads: Thread[], ids: unknown): Thread[] => {
  const done = new Set((Array.isArray(ids) ? ids : []).filter((x): x is string => typeof x === "string").map((x) => x.replace(/^\[?t:|\]$/g, "")));
  return done.size ? threads.filter((t) => !done.has(t.id)) : threads;
};
export const threadLines = (threads: Thread[], now: number): string[] =>
  threads.filter((t) => now - t.at < SAID.threadDays * DAY).map((t) => `[t:${t.id}] ${t.text} (since ${dayLabel(t.at)})`);
