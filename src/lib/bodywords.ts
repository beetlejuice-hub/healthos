/**
 * How your body felt, from the notes on your check-ins (owner, 27 Oct: "make sure it can find connections between things i
 * log like feeling weak and what I've been doing"). A short list of body words, matched as whole words — "weak", not
 * "weekend" — so a check-in note "felt weak after lunch" makes that day "a day you felt weak", and the pattern finder
 * (lib/scout) can set it against sleep, food, drinks, training, steps and supplements. Pure.
 */

import { tagsOf } from "./feel";
import type { Entry, EntryOf } from "./types";

export type BodyWord = { id: string; name: string; yes: string; say: string; re: RegExp; /** On its chip. */ chip: string };

export const BODY_WORDS: BodyWord[] = [
  { id: "weak", chip: "weak", name: "feeling weak", yes: "a day you felt weak", say: "you felt weak", re: /\b(weak|weakness|shaky)\b/i },
  { id: "tired", chip: "tired", name: "feeling tired", yes: "a day you felt tired", say: "you felt tired", re: /\b(tired|exhausted|drained|fatigued?|knackered|wiped)\b/i },
  { id: "headache", chip: "headache", name: "headaches", yes: "a headache day", say: "you had a headache", re: /\b(headaches?|migraines?|head hurts?)\b/i },
  { id: "sore", chip: "sore", name: "soreness", yes: "a sore day", say: "you were sore", re: /\b(sore|soreness|aching|achy|aches)\b/i },
  { id: "dizzy", chip: "dizzy", name: "dizziness", yes: "a dizzy day", say: "you felt dizzy", re: /\b(dizzy|dizziness|light-?headed)\b/i },
  { id: "bloated", chip: "bloated", name: "bloating", yes: "a bloated day", say: "you felt bloated", re: /\b(bloated|bloating)\b/i },
  { id: "nauseous", chip: "queasy", name: "nausea", yes: "a day you felt sick to your stomach", say: "you felt sick to your stomach", re: /\b(nause(a|ous|ated)|queasy)\b/i },
  { id: "sick", chip: "ill", name: "feeling ill", yes: "a day you felt ill", say: "you felt ill", re: /\b(sick(?!\s+of\b)|ill|unwell|flu)\b/i },
  { id: "foggy", chip: "foggy", name: "brain fog", yes: "a foggy day", say: "your head felt foggy", re: /\b(foggy|brain ?fog)\b/i },
];

/** The body words in one note ("so tired, bit of a headache" → tired, headache). "not tired" doesn't count. */
export function bodyWords(note: string | undefined | null): string[] {
  if (!note) return [];
  return BODY_WORDS.filter((w) => {
    const m = note.match(w.re);
    if (!m || m.index == null) return false;
    // "not tired", "no headache", "wasn't sore": said, but not felt
    return !/\b(not|no|never|wasn'?t|isn'?t|didn'?t|without)\s+(\w+\s+)?$/i.test(note.slice(Math.max(0, m.index - 24), m.index));
  }).map((w) => w.id);
}

/* ---- the check-in's body chips (owner, 28 Oct, picked C: "chips with how much — tap twice") ---- */


/** On the check-in, always, in this order (the canvas's): the rest, and your own words, join once you've used them. */
export const BODY_CHIPS = ["weak", "tired", "sore", "headache", "bloated", "dizzy", "foggy"] as const;
export type Level = 1 | 2;
/** One tap a bit, two a lot, a third clears it. */
export const nextLevel = (l: Level | undefined): Level | undefined => (l == null ? 1 : l === 1 ? 2 : undefined);
export const DOTS: Record<Level, string> = { 1: "●", 2: "●●" };
export const HOW: Record<Level, string> = { 1: "a bit", 2: "a lot" };

/** A body word's chip label, or your own word as you wrote it ("knee-pain" → "knee pain"). */
export const bodyLabel = (key: string) => BODY_WORDS.find((w) => w.id === key)?.chip ?? key.replace(/-/g, " ");

/**
 * Feeling good, said as a body word (owner, 3 Nov: "Make sure if i put a custom tag for body saying good or awesome it
 * means in a positive way yk"): "good", "awesome", "strong", "feeling fresh" — and a complaint said not felt ("not
 * tired"). "not good" isn't. Everything else is how your body was, as before (the seven chips, "knee pain").
 */
const GOOD = /^(?:feeling-|feel-|felt-)?(good|great|awesome|amazing|fantastic|excellent|perfect|fine|ok|okay|strong|stronger|fresh|refreshed|rested|well-rested|energi[sz]ed|energetic|pumped|sharp|light|loose|relaxed|calm|recovered|motivated|happy|solid|alive|unstoppable|on-fire|epic|super|lit|goated|peak)$/;
const NOT = /^(?:not|no|never|isn-?t|wasn-?t|don-?t|didn-?t|hardly)-(?:so-|very-|that-|too-|really-|feeling-|feel-|felt-)?/;
export const bodyGood = (key: string): boolean => {
  if (BODY_WORDS.some((w) => w.id === key)) return false;
  const not = key.match(NOT), core = not ? key.slice(not[0].length) : key;
  if (GOOD.test(core)) return !not;
  // "not tired", "no headache": a complaint, said not felt
  return !!not && (BODY_WORDS.some((w) => w.id === core) || bodyWords(core.replace(/-/g, " ")).length > 0);
};
/** How a good one is said: "feeling-fresh" → "fresh", "not-tired" → "not tired". */
export const goodWord = (key: string) => bodyLabel(key).replace(/^(feeling|feel|felt) /, "");

/**
 * Your own words, as keys: each part ("knee pain and nausea" → two) is a body word when it says one ("exhausted" → tired,
 * "nausea" → queasy — so it counts with the same chip), else your word kept.
 */
export function bodyKeys(text: string): string[] {
  return [...new Set(tagsOf(text).map((t) => bodyWords(t.replace(/-/g, " "))[0] ?? t))];
}

/** The chips to show: the seven, then the other words you've used in the last 60 days, most used first. */
export function bodyOrder(entries: Entry[], now: number): string[] {
  const since = now - 60 * 86_400_000, count = new Map<string, number>();
  for (const e of entries) if (e.kind === "feel" && e.at >= since) for (const k of Object.keys(e.body ?? {})) count.set(k, (count.get(k) ?? 0) + 1);
  const extra = [...count.keys()].filter((k) => !(BODY_CHIPS as readonly string[]).includes(k)).sort((a, b) => count.get(b)! - count.get(a)! || a.localeCompare(b));
  return [...BODY_CHIPS, ...extra];
}

/** "weak ●●, tired ●" — or in words for the AI and the log: "weak (a lot), tired (a bit)". */
export function bodyLine(body: Record<string, Level> | undefined, words = false): string {
  // for the AI, a good one says so — "awesome (a lot)" next to "sore (a bit)" read as one more complaint (3 Nov)
  return Object.entries(body ?? {}).map(([k, l]) => `${bodyLabel(k)} ${words ? `(${HOW[l]}${bodyGood(k) ? ", a good feeling" : ""})` : DOTS[l]}`).join(", ");
}

/**
 * How your body felt on a day, from its check-ins: each word at its strongest — a chip's 1 or 2, a word in a note 1 (it
 * says that you felt it, not how much). Null with no check-in that day (unknown, not "fine").
 */
export function feltOn(feels: EntryOf<"feel">[]): Record<string, number> | null {
  if (!feels.length) return null;
  const out: Record<string, number> = {};
  for (const f of feels) {
    for (const w of bodyWords(f.note)) out[w] = Math.max(out[w] ?? 0, 1);
    for (const [k, l] of Object.entries(f.body ?? {})) out[k] = Math.max(out[k] ?? 0, l);
  }
  return out;
}
