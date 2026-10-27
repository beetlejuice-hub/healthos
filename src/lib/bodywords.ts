/**
 * How your body felt, from the notes on your check-ins (owner, 27 Oct: "make sure it can find connections between things i
 * log like feeling weak and what I've been doing"). A short list of body words, matched as whole words — "weak", not
 * "weekend" — so a check-in note "felt weak after lunch" makes that day "a day you felt weak", and the pattern finder
 * (lib/scout) can set it against sleep, food, drinks, training, steps and supplements. Pure.
 */

export type BodyWord = { id: string; name: string; yes: string; say: string; re: RegExp };

export const BODY_WORDS: BodyWord[] = [
  { id: "weak", name: "feeling weak", yes: "a day you felt weak", say: "you felt weak", re: /\b(weak|weakness|shaky)\b/i },
  { id: "tired", name: "feeling tired", yes: "a day you felt tired", say: "you felt tired", re: /\b(tired|exhausted|drained|fatigued?|knackered|wiped)\b/i },
  { id: "headache", name: "headaches", yes: "a headache day", say: "you had a headache", re: /\b(headaches?|migraines?|head hurts?)\b/i },
  { id: "sore", name: "soreness", yes: "a sore day", say: "you were sore", re: /\b(sore|soreness|aching|achy|aches)\b/i },
  { id: "dizzy", name: "dizziness", yes: "a dizzy day", say: "you felt dizzy", re: /\b(dizzy|dizziness|light-?headed)\b/i },
  { id: "bloated", name: "bloating", yes: "a bloated day", say: "you felt bloated", re: /\b(bloated|bloating)\b/i },
  { id: "nauseous", name: "nausea", yes: "a day you felt sick to your stomach", say: "you felt sick to your stomach", re: /\b(nause(a|ous|ated)|queasy)\b/i },
  { id: "sick", name: "feeling ill", yes: "a day you felt ill", say: "you felt ill", re: /\b(sick(?!\s+of\b)|ill|unwell|flu)\b/i },
  { id: "foggy", name: "brain fog", yes: "a foggy day", say: "your head felt foggy", re: /\b(foggy|brain ?fog)\b/i },
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
