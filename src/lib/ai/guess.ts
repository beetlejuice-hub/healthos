/**
 * Your guess, and your gut's record (PLAN 210; owner, 11 Nov: "guess sounds good could make a low friction version of
 * it"). Starting an experiment, one tap — helps, no change, hurts — or nothing. When the app has its result, the guess is
 * right or not; across experiments, how often your gut was. Guessing is open for the first 3 days (before the numbers
 * could have told you). Pure.
 */

import type { Experiment } from "../store";
import { addDays } from "../time";

export type Guess = NonNullable<Experiment["guess"]>;
export type Outcome = "better" | "worse" | "no-clear-change";
export const GUESS = { openDays: 3 } as const;
export const GUESS_WORDS: Record<Guess, string> = { helps: "helps", same: "no change", hurts: "hurts" };
const MATCH: Record<Guess, Outcome> = { helps: "better", same: "no-clear-change", hurts: "worse" };

/** Still asking: running, no guess yet, within its first 3 days. */
export const guessOpen = (x: Experiment, today: string) => !x.guess && !x.ended && !x.verdict && today < addDays(x.start, GUESS.openDays);

/** Was the guess right? null without a guess or a result. */
export const guessRight = (guess: Guess | undefined, out: Outcome | null | undefined): boolean | null => (!guess || !out ? null : MATCH[guess] === out);

/** Your gut so far: right of guessed, with each experiment's result; null with none guessed and done. */
export function gutRecord(xs: Experiment[], result: (x: Experiment) => Outcome | null): { right: number; of: number; say: string } | null {
  const done = xs.flatMap((x) => { const r = guessRight(x.guess, x.verdict?.state ?? result(x)); return r == null ? [] : [r]; });
  if (!done.length) return null;
  const right = done.filter(Boolean).length, of = done.length;
  return { right, of, say: `Your gut so far: right ${right} of ${of}${of >= 4 ? (right / of >= 0.75 ? " — you know your body well" : right / of <= 0.4 ? " — your data often disagrees with your hunch" : "") : ""}.` };
}
