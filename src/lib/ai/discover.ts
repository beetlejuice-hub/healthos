/**
 * Discoveries (PLAN 187 phase 1; owner, 3 Nov: "I like the app trying out new things, finding new studies, random ones,
 * random supplement studies related to fat loss, brain fog, trainign etc. or reddit forums that talk ab things that
 * changed their lives, random posts, etc. one or 2 for each day. completely random. like it sent me the kiwi study and i
 * am trying it rn. can be health, brain, body, training etc.").
 *
 * Each read — morning and evening — carries one, so two a day. The app picks its topic and kind at random (the same pick
 * for a read written again that day), never a topic of the last few; the AI searches for one of that kind and says why it
 * might be worth it for him. A forum post is one person's story and says so. One with something to try for a few weeks
 * carries it, and "Try it" starts a watch (lib/watch) — its evening question, his data, what it showed. Pure.
 */

import type { Sure } from "./tasks";
import { CAUSES, FEELS } from "../watch";

export const TOPICS = [
  { id: "fat-loss", words: "fat loss — appetite, keeping muscle while cutting, what helps a deficit stick" },
  { id: "brain-fog", words: "brain fog, focus and mental energy" },
  { id: "training", words: "strength training — technique, programming, getting stronger, recovering between sessions" },
  { id: "sleep", words: "sleep — falling asleep faster, deeper sleep, waking up rested" },
  { id: "supplement", words: "a supplement — what a trial found for fat loss, the brain, training or sleep (one that isn't in their stack)" },
  { id: "food", words: "a food or an eating habit — a fruit, a timing, a swap — with an effect someone measured" },
  { id: "mood", words: "mood, stress and motivation" },
  { id: "recovery", words: "recovery — after hard training, after a night out, heart rate variability" },
  { id: "body", words: "the body — skin, gut, heart, hormones: something they'd want to know" },
  { id: "longevity", words: "staying strong for decades — habits with good evidence" },
  { id: "weird", words: "a weird-but-true finding about the body or brain, the kind you'd tell a friend" },
] as const;
export const KINDS = [
  { id: "study", w: 5, words: "a study from the last two years (a trial beats a survey)" },
  { id: "forum", w: 3, words: "a Reddit or forum post where someone says a thing changed their life, their body or their training — a real thread; it's one person's story" },
  { id: "classic", w: 2, words: "an older study that's still surprising" },
] as const;
export type TopicId = (typeof TOPICS)[number]["id"];
export type KindId = (typeof KINDS)[number]["id"];
export type Slot = "morning" | "evening";

/** What to try for a few weeks, as a watch would take it (lib/ai/propose "watch"). */
export type DiscoveryTry = { what: string; question: string; options: string[]; days: number; cause_kind?: string; cause_name?: string; feel?: string };
export type Discovery = { topic: TopicId; kind: KindId; title: string; text: string; why: string; sure: Sure; source: { title: string; url: string; checked?: boolean }; try?: DiscoveryTry };
/** As kept: which read brought it, and what he did with it. */
export type KeptDiscovery = Discovery & { id: string; day: string; slot: Slot; at: number; tried?: number; watchId?: string; no?: number };

export const DISCOVER = { avoid: 5, keep: 60 } as const;

/** A small seeded random from a string: the same day and read pick the same thing, a new day something else. */
function rand(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

/** This read's random topic and kind: never a topic of the last few discoveries. */
export function pickDiscovery(day: string, slot: Slot, recent: TopicId[]): { topic: (typeof TOPICS)[number]; kind: (typeof KINDS)[number] } {
  const r = rand(`${day}:${slot}`), avoid = new Set(recent.slice(-DISCOVER.avoid));
  const open = TOPICS.filter((t) => !avoid.has(t.id)), from = open.length ? open : TOPICS;
  const topic = from[Math.floor(r() * from.length)];
  const total = KINDS.reduce((a, k) => a + k.w, 0);
  let x = r() * total, kind: (typeof KINDS)[number] = KINDS[0];
  for (const k of KINDS) { if (x < k.w) { kind = k; break; } x -= k.w; }
  return { topic, kind };
}

/** What the read is told: the pick, and what's been shown, so it brings something new. */
export function discoveryLines(day: string, slot: Slot, kept: KeptDiscovery[] = []): string[] {
  const p = pickDiscovery(day, slot, kept.map((d) => d.topic));
  return [
    `## Today's discovery (picked at random by the app — topic "${p.topic.id}", kind "${p.kind.id}")`,
    `- topic: ${p.topic.words}`,
    `- kind: ${p.kind.words}`,
    ...(kept.length ? ["## Discoveries already shown (don't bring these again)", ...kept.slice(-30).map((d) => `- ${d.title}`)] : []),
  ];
}

const line = (x: unknown, n: number) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** The read's discovery, kept only when it's whole: a topic and kind it was asked for, words, and a real link. */
export function checkDiscovery(raw: unknown): Discovery | null {
  const d = raw as Partial<Discovery> | null | undefined;
  if (!d || typeof d !== "object") return null;
  const topic = TOPICS.find((t) => t.id === d.topic)?.id, kind = KINDS.find((k) => k.id === d.kind)?.id;
  const title = line(d.title, 90), text = line(d.text, 420), why = line(d.why, 200), url = line(d.source?.url, 500);
  if (!topic || !kind || !title || !text || !/^https:\/\/\S+$/.test(url)) return null;
  // a forum post is one person's story, whatever the AI called it
  const sure: Sure = kind === "forum" ? "anecdote" : d.sure === "strong" || d.sure === "some" || d.sure === "anecdote" ? d.sure : "some";
  const t = d.try, opts = Array.isArray(t?.options) ? t!.options.map((o) => line(o, 30)).filter(Boolean) : [];
  const tryIt = t && line(t.what, 60) && line(t.question, 120) && opts.length >= 2 && opts.length <= 4
    ? { what: line(t.what, 60), question: line(t.question, 120), options: opts, days: Math.min(28, Math.max(7, Math.round(Number(t.days) || 14))),
      ...(line(t.cause_kind, 20) ? { cause_kind: line(t.cause_kind, 20) } : {}), ...(line(t.cause_name, 40) ? { cause_name: line(t.cause_name, 40) } : {}), ...(line(t.feel, 10) ? { feel: line(t.feel, 10) } : {}) }
    : undefined;
  return { topic, kind, title, text, why, sure, source: { title: line(d.source?.title, 90) || "Source", url }, ...(tryIt ? { try: tryIt } : {}) };
}

/**
 * The watch "Try it" asks for (lib/ai/propose "watch" checks it like any other): the thing, its question, where it came
 * from. `plain`: without what ties it to his data — for when that part doesn't fit (a supplement not in the stack yet).
 */
export function watchInput(d: Discovery, plain = false): Record<string, unknown> | null {
  if (!d.try) return null;
  const t = d.try, cause = !plain && t.cause_kind && (CAUSES as readonly string[]).includes(t.cause_kind) && t.cause_name ? { cause_kind: t.cause_kind, cause_name: t.cause_name } : {};
  const feel = !plain && t.feel && (FEELS as readonly string[]).includes(t.feel) ? { feel: t.feel } : {};
  return {
    change: "watch", what: t.what, note: `Trying it from a ${d.kind === "forum" ? "forum post" : "study"}: ${d.title}`.slice(0, 400),
    question: t.question, options: t.options, days: t.days, ...cause, ...feel,
    found: [{ text: d.text.slice(0, 200), sure: d.sure, title: d.source.title, url: d.source.url }],
    why: d.why || "you wanted to try it",
  };
}

/** A read's discovery into the list, newest last: a read written again replaces its own — unless you tried it or said no. */
export function keepDiscovery(list: KeptDiscovery[] = [], raw: Discovery | null | undefined, day: string, slot: Slot, at: number): KeptDiscovery[] {
  // checked here as well as on the server: what's kept is always whole, a forum post always an anecdote
  const d = checkDiscovery(raw);
  if (!d) return list;
  const mine = list.find((x) => x.day === day && x.slot === slot);
  if (mine && (mine.tried || mine.no)) return list;
  return [...list.filter((x) => x !== mine), { ...d, id: `${day}:${slot}`, day, slot, at }].slice(-DISCOVER.keep);
}
