/**
 * Your own tips (owner, 28 Oct: "i will type anything in the box on today, things like music helps me focus, exercise
 * clears my head, etc - whenever my focus is low it should recommend to put on my focus music. thats just an example but
 * this is how it should work"). Read from what you type in "Noticed something?": a part of a note that says something
 * helps a feeling — "music helps me focus", "exercise clears my head", "a walk calms me down", "I focus better with music
 * on" — is a tip for that feeling. Said the other way later ("music doesn't help me focus anymore"), it's dropped.
 * When your last check-in, in the last 3 hours, has that feeling low (focus, energy or mood 4 or under; stress 7 or
 * over), Today suggests it, in your words. "Doing it" is kept as an answer (key tip:<what>), so the AI sees it and
 * whether it helps can be looked at later. Pure.
 */

import type { Entry, EntryOf } from "./types";

export type Feeling = "focus" | "energy" | "mood" | "stress";
export type Tip = { key: string; what: string; for: Feeling; said: string; at: number };

/** Low: 4 or under of 10 (stress: 7 or over); a check-in counts for 3 hours. */
export const TIPS = { low: 4, stress: 7, withinH: 3 } as const;
export const FEELING_NAME: Record<Feeling, string> = { focus: "Focus", energy: "Energy", mood: "Mood", stress: "Stress" };

// what a part of a note says it helps — the stress words only in the calming direction ("makes me anxious" isn't a tip)
const FEELS: [Feeling, RegExp][] = [
  ["focus", /\b(focus\w*|concentrat\w*|productive|clears? (my |the )?(head|mind)|clear(er)? head\w*|think(ing)? (clearly|clearer|straight)|in the zone|sharp(er)?)\b/i],
  ["energy", /\b(energ\w*|wakes? me up|awake|alert|perks? me up|less tired)\b/i],
  ["mood", /\b(mood|happ(y|ier)|cheers? me up|feel (good|better|great)|lifts? me( up)?|uplift\w*)\b/i],
  ["stress", /\b(calm\w*|relax\w*|unwind\w*|de-?stress\w*|chills? me|settles? me|less (stressed|anxious|tense)|(with|reduces|lowers|eases) (my )?(stress|anxiety))\b/i],
];
const NEG = /\b(not|never|no longer|anymore|n't|dont|doesnt|didnt|cant|lose|loses|losing|lost|worse|kills?|ruins?|breaks?|drains?|hurts?|distracts?|harder)\b|n't\b/i;
const HELPS = /^(.+?)\s+(?:(?:really|always|usually|definitely|actually|kind of|kinda|seems? to|tends? to|also|never|no longer|not|(?:does|do|did)(?:n'?t| not)?)\s+)*(helps?|helped|makes?|made|gives?|clears?|boosts?|improves?|lifts?|calms?|relax(?:es)?|wakes?|cheers?|perks?|keeps?|gets?|puts?|(?:is|are|'s) (?:good|great) for|works? for)\b(.*)$/i;
const BETTER = /\bI\s+(?:can\s+)?(focus|concentrate|think|work|feel|relax)\s+(?:much |a lot |way |so much )?(?:better|more)\s+(?:with|after|when(?: I)?|if(?: I)?|while(?: I)?)\s+(.+)$/i;
const BETTER_FOR: Record<string, Feeling> = { focus: "focus", concentrate: "focus", think: "focus", work: "focus", feel: "mood", relax: "stress" };

/** "Listening to music" → "listening to music"; leading "I think", "that", "for me" and trailing "on" go. */
function clean(what: string): string {
  return what.trim()
    .replace(/^(?:and|but|also|so|i think|i noticed|i realised|i realized|noticed|i find|i found|for me|that)\s+/i, "")
    .replace(/^(?:and|that)\s+/i, "")
    .replace(/\s+(?:on|for me|really)$/i, "")
    .replace(/^["“']|["”']$/g, "").trim();
}
export const tipKey = (what: string) => `tip:${what.toLowerCase().replace(/^(?:my|a|an|the|some)\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

/** What one note says helps: each part (split at . , ; : ! ? and new lines) with what and the feelings, and whether it's said the other way. */
export function readTips(text: string): { what: string; for: Feeling; said: string; off: boolean }[] {
  const out: { what: string; for: Feeling; said: string; off: boolean }[] = [];
  for (const part of text.split(/[.,;:!?\n]+|\s+but\s+/i).map((p) => p.trim()).filter(Boolean)) {
    const b = part.match(BETTER), h = b ? null : part.match(HELPS);
    if (!b && !h) continue;
    const what = clean(b ? b[2] : h![1]);
    // a thing, not a sentence: up to 6 words and 40 letters
    if (!what || what.length > 40 || what.split(/\s+/).length > 6 || /^(it|this|that|i|me)$/i.test(what)) continue;
    const off = NEG.test(part);
    const feels = b ? [BETTER_FOR[b[1].toLowerCase()]] : FEELS.filter(([, re]) => re.test(`${h![2]}${h![3]}`.replace(/\s+/g, " "))).map(([f]) => f);
    for (const f of new Set(feels)) out.push({ what, for: f, said: part, off });
  }
  return out;
}

/**
 * What a tip is, in its words that matter: "listening to focus music" → focus, music. Two tips for the same feeling are
 * the same tip when one's words are all in the other's (PLAN 196; owner, 4 Nov, of "Focus music helps me focus when
 * working" and "Music helps me focus": "Same thing").
 */
const TIP_STOP = new Set(["and", "with", "when", "the", "for", "some", "while", "bit", "lot"]);
function tipWords(what: string): Set<string> {
  const w = what.toLowerCase().replace(/^(?:listening to|listen to|playing|putting on|put on|having|doing|going for|a|an|the|my|some)\s+/g, "");
  return new Set(w.split(/[^a-z0-9]+/).filter((x) => x.length >= 3 && !TIP_STOP.has(x)).map((x) => (x.length > 4 && x.endsWith("s") ? x.slice(0, -1) : x)));
}
const sameTip = (a: { what: string; for: Feeling }, b: { what: string; for: Feeling }) => {
  if (a.for !== b.for) return false;
  const x = tipWords(a.what), y = tipWords(b.what);
  if (!x.size || !y.size) return tipKey(a.what) === tipKey(b.what);
  const [small, big] = x.size <= y.size ? [x, y] : [y, x];
  return [...small].every((w) => big.has(w));
};

/** Your tips, from every note in order: the latest saying wins (in its words); one said the other way later is dropped. */
export function tipsFrom(entries: Entry[]): Tip[] {
  let tips: Tip[] = [];
  for (const e of [...entries].sort((a, b) => a.at - b.at)) {
    if (e.kind !== "notice") continue;
    for (const t of readTips(e.text)) {
      tips = tips.filter((u) => !sameTip(u, t));
      if (!t.off) tips.push({ key: tipKey(t.what), what: t.what, for: t.for, said: t.said, at: e.at });
    }
  }
  return tips;
}

const lowOf = (f: Feeling, v: number) => (f === "stress" ? v - TIPS.stress : TIPS.low - v);

export type TipAsk = { feel: EntryOf<"feel">; for: Feeling; value: number; tips: Tip[] };
/**
 * What to suggest now: your last check-in in the last 3 hours, its lowest feeling that you have a tip for, and those
 * tips (latest said first, at most 3) — none tried since that check-in. Null when nothing's low, there's no tip for it,
 * or you've already said "Doing it".
 */
export function tipAsk(entries: Entry[], now: number): TipAsk | null {
  const feel = entries.filter((e): e is EntryOf<"feel"> => e.kind === "feel" && e.at <= now && e.at > now - TIPS.withinH * 3_600_000)
    .sort((a, b) => b.at - a.at).find((e) => e.focus != null || e.energy != null || e.mood != null || e.stress != null);
  if (!feel) return null;
  const tips = tipsFrom(entries);
  const tried = entries.some((e) => e.kind === "answer" && e.key.startsWith("tip:") && e.at >= feel.at);
  if (!tips.length || tried) return null;
  const low = (["focus", "energy", "mood", "stress"] as const)
    .filter((f) => feel[f] != null && lowOf(f, feel[f]!) >= 0 && tips.some((t) => t.for === f))
    .sort((a, b) => lowOf(b, feel[b]!) - lowOf(a, feel[a]!))[0];
  if (!low) return null;
  return { feel, for: low, value: feel[low]!, tips: tips.filter((t) => t.for === low).sort((a, b) => b.at - a.at).slice(0, 3) };
}

/** "Doing it", kept as an answer: the AI sees it in your answers, and it's there to look at later. */
export function tipEntry(a: TipAsk, t: Tip, now: number): Omit<EntryOf<"answer">, "id"> {
  return { kind: "answer", at: now, key: t.key, question: `${FEELING_NAME[a.for]} ${a.value} — your tip: "${t.said}"`, answer: "doing it" };
}

/** For the AI: your tips, with how often you've done each when it was suggested. */
export function tipLines(entries: Entry[]): string[] {
  return tipsFrom(entries).map((t) => {
    const n = entries.filter((e) => e.kind === "answer" && e.key === t.key).length;
    return `${FEELING_NAME[t.for].toLowerCase()}: "${t.said}"${n ? ` — did it ${n} time${n === 1 ? "" : "s"} when suggested` : ""}`;
  });
}
