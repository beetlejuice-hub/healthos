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
/**
 * rest: a topic said lately rests 5 days; worn: said in 3 reads within 30 days, it rests 30 (PLAN 194; owner, 4 Nov: "im
 * bored of the advice of adding skyr to my breakfast for protein, we talked ab this"). The log keeps 60 days, so a worn
 * topic's sayings are still there for its whole rest.
 */
export const SAID = { rest: 5, worn: 3, wornWithin: 30, wornRest: 30, days: 60, keep: 300, text: 120, lines: 25, threads: 10, threadDays: 30, never: 40, cited: 200, citedDays: 180, citedLines: 30 } as const;
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
/**
 * The same topic in other words: one's words all in the other's ("protein-breakfast" / "high-protein-breakfast") — when
 * the smaller has two words at least. A one-word topic is only itself: "sleep" said yesterday took "sleep-regularity",
 * "deep-sleep-alcohol" and every other sleep item with it (owner, 31 Oct: "the morning read has only one study/graph
 * linked instead of the 3"). "other" (no topic, no title) is never the same as anything.
 */
export function sameTopic(a: string, b: string): boolean {
  if (a === "other" || b === "other") return false;
  if (a === b) return true;
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return false;
  const [small, big] = x.size <= y.size ? [x, y] : [y, x];
  return small.size >= 2 && [...small].every((w) => big.has(w));
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
/** The log with a read's advice added: the last 60 days, at most 300, each said in 120 characters. */
export const keepSaid = (said: Said[], add: Said[], now: number): Said[] =>
  [...said, ...add.map((s) => ({ ...s, text: s.text.slice(0, SAID.text) }))].filter((s) => now - s.at < SAID.days * DAY).slice(-SAID.keep);

/** Each topic's sayings in the log, oldest first. */
const byTopic = (said: Said[], now: number) => {
  const by = new Map<string, Said[]>();
  for (const s of said) if (now - s.at < SAID.days * DAY) by.set(s.topic, [...(by.get(s.topic) ?? []), s]);
  return by;
};
/** How long a topic rests from its last saying: 5 days, or 30 once said in 3 reads within 30 days (worn out). */
function restOf(ss: Said[]): { worn: boolean; until: number } {
  const last = ss.at(-1)!.at, reads = new Set(ss.filter((s) => s.at > last - SAID.wornWithin * DAY).map((s) => s.at)).size, worn = reads >= SAID.worn;
  return { worn, until: last + (worn ? SAID.wornRest : SAID.rest) * DAY };
}
/** What's resting now. */
const resting = (said: Said[], now: number) => [...byTopic(said, now)].filter(([, ss]) => restOf(ss).until > now).map(([t]) => t);

/**
 * Never again (PLAN 194): what he's tired of, from a tap on "Not again" or his own words. `match`: words that give it away
 * in any topic or title (the built-in one's foods); a tapped one matches by its topic, as the log does, and the reads are
 * told it in words, so the same advice under another name goes too.
 */
export type Never = { topic: string; text: string; at: number; match?: string[] };
/** From his words, 4 Nov ("im bored of the advice of adding skyr to my breakfast for protein, we talked ab this"). Lifted from Settings. */
export const BORED: Never[] = [{ topic: "protein-breakfast", text: "protein at breakfast — skyr, quark or Greek yoghurt in the morning to hit the protein goal", at: new Date("2026-11-04T08:00:00").getTime(), match: ["skyr", "quark", "greek yoghurt", "greek yogurt"] }];
/** His list: the built-in ones he hasn't lifted, then his own taps. */
export const neverList = (never: Never[] | undefined, lifted: string[] | undefined): Never[] =>
  [...BORED.filter((b) => !(lifted ?? []).includes(b.topic)), ...(never ?? [])];
/** "Not again" on an item: its topic and what it said, once (at most SAID.never). */
export function addNever(never: Never[] | undefined, x: { topic?: string; title: string; tip?: string }, now: number): Never[] {
  const list = never ?? [], topic = topicKey(x.topic, x.title);
  if (list.some((n) => sameTopic(n.topic, topic))) return list;
  return [...list, { topic, text: (x.tip ? `${x.title} — ${x.tip}` : x.title).slice(0, SAID.text), at: now }].slice(-SAID.never);
}
const plain = (t: string) => ` ${t.toLowerCase().normalize("NFKD").replace(/[^a-z]+/g, " ")} `;
const has = (text: string, w: string) => plain(text).includes(` ${w}`);
/** Is this advice on the never list: the same topic, or a word that gives it away in its topic, title, tip or text. */
export function isNever(nv: Never[], topic: string, words: string): boolean {
  const all = `${topic.replace(/-/g, " ")} ${words}`;
  return nv.some((n) => sameTopic(n.topic, topic) || (n.match ?? []).some((w) => has(all, w)));
}
/** Is this item one he said "Not again" to (its topic, as the log reads it). */
export const saidNever = (nv: Never[], x: { topic?: string; title: string }): boolean => nv.some((n) => sameTopic(n.topic, topicKey(x.topic, x.title)));
/** "Not again" tapped again: lifted — a tapped one goes from the list, a built-in one is marked lifted. */
export function liftNever(never: Never[] | undefined, lifted: string[] | undefined, topic: string): { never: Never[]; neverLifted: string[] } {
  const hit = (n: Never) => sameTopic(n.topic, topic);
  return { never: (never ?? []).filter((n) => !hit(n)), neverLifted: [...new Set([...(lifted ?? []), ...BORED.filter(hit).map((b) => b.topic)])] };
}
/** …as lines for the reads. */
export const neverLines = (nv: Never[]): string[] => nv.map((n) => `${n.topic}: ${n.text}`);

/** A read's items or changes without the topics that are resting or never again, and without a topic twice in one read. */
export function dropSaid<T extends { topic?: string }>(xs: T[], said: Said[], now: number, title: (x: T) => string, never: Never[] = []): { kept: T[]; dropped: T[] } {
  const rest = resting(said, now), seen: string[] = [], kept: T[] = [], dropped: T[] = [];
  for (const x of xs) {
    const k = topicKey(x.topic, title(x)), o = x as { tip?: string; text?: string };
    if (rest.some((r) => sameTopic(r, k)) || seen.some((s) => sameTopic(s, k)) || isNever(never, k, `${title(x)} ${o.tip ?? ""} ${o.text ?? ""}`)) dropped.push(x);
    else { seen.push(k); kept.push({ ...x, topic: k }); }
  }
  return { kept, dropped };
}

/**
 * Never the same study twice (PLAN 194; owner, 4 Nov: "make sure studies are good, not the same thing"): each link a read
 * cites, kept 180 days by what identifies the paper — its PubMed id, its DOI, or its address without the query.
 */
export type Cited = { key: string; title: string; at: number };
export function sourceKey(url: string): string {
  const u = url.trim().toLowerCase();
  const pm = u.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/) ?? u.match(/[?&/]pmid[=/](\d+)/), doi = u.match(/\b(10\.\d{4,9}\/[^\s?#]+)/), pmc = u.match(/\b(pmc\d+)/);
  if (pm) return `pmid:${pm[1]}`;
  if (doi) return `doi:${decodeURIComponent(doi[1]).replace(/[/.]+$/, "")}`;
  if (pmc) return pmc[1];
  return u.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
}
/** The cited log with a read's sources added (no doubles; 180 days; at most 200). */
export function keepCited(cited: Cited[] | undefined, sources: ({ title: string; url: string } | undefined)[], now: number): Cited[] {
  const list = (cited ?? []).filter((c) => now - c.at < SAID.citedDays * DAY);
  for (const s of sources) if (s?.url && !list.some((c) => c.key === sourceKey(s.url))) list.push({ key: sourceKey(s.url), title: s.title.slice(0, 100), at: now });
  return list.slice(-SAID.cited);
}
/** Items without one citing a paper already cited (a rewrite of the same read keeps its own: `before`, its time). */
export const dropCited = <T extends { source?: { url: string } }>(xs: T[], cited: Cited[] | undefined, before: number | null = null): T[] =>
  xs.filter((x) => !x.source?.url || !(cited ?? []).some((c) => c.at !== before && c.key === sourceKey(x.source!.url)));
/** …and for the reads: the titles, newest first. */
export const citedLines = (cited: Cited[] | undefined): string[] => [...(cited ?? [])].reverse().slice(0, SAID.citedLines).map((c) => c.title);

/** The morning read's items to show: its 3, the spare standing in for one said lately; never more than 3. */
export const readItems = <T extends { topic?: string }>(xs: T[], said: Said[], now: number, title: (x: T) => string, never: Never[] = []): T[] => {
  const kept = dropSaid(xs, said, now, title, never).kept, top = kept.slice(0, 3);
  // a study every read (owner, 4 Nov: "tooday morning read had absolutely no study"): when the three hold none and a later
  // one is, it takes the third's place
  const study = (x: T) => (x as { type?: string }).type === "study";
  const spare = top.some(study) ? undefined : kept.slice(3).find(study);
  if (spare) top[top.length - 1] = spare;
  return top;
};

/**
 * What the read says about items the Worker left out over their links (PLAN 193): nothing when none were; when it was
 * the study and no study is left, that; otherwise how many. Never silent about it.
 */
export function unlinkedNote(shown: { type?: string }[], unlinked: string[] | undefined): string | null {
  if (!unlinked?.length) return null;
  if (unlinked.includes("study") && !shown.some((x) => x.type === "study")) return "The study was left out — its link didn't open, or the page was about something else.";
  const n = unlinked.length;
  return `${n} item${n > 1 ? "s" : ""} left out — ${n > 1 ? "their links" : "its link"} didn't open, or the page was about something else.`;
}

/** What's been said, by topic, newest first: how often, the first and last time, and until when it rests. */
export function saidTopics(said: Said[], now: number): { topic: string; n: number; first: number; last: Said; restUntil: number | null; worn: boolean }[] {
  return [...byTopic(said, now).entries()].sort((a, b) => b[1].at(-1)!.at - a[1].at(-1)!.at).slice(0, SAID.lines).map(([topic, ss]) => {
    const last = ss.at(-1)!, { worn, until } = restOf(ss);
    return { topic, n: ss.length, first: ss[0].at, last, restUntil: until > now ? until : null, worn: worn && until > now };
  });
}
/** …as lines for the reads. */
export const saidLines = (said: Said[], now: number): string[] => saidTopics(said, now).map((t) =>
  `${t.topic} — ${t.n}× since ${dayLabel(t.first)}, last ${dayLabel(t.last.at)} (${t.last.from}): "${t.last.text.slice(0, 120)}"${t.restUntil ? ` — ${t.worn ? "worn out, " : ""}resting until ${dayLabel(t.restUntil)}` : ""}`);

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
