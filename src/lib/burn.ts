/**
 * Calories burned against eaten (PLAN 83; owner, 13 Oct: "one would assume calories burned are already in the app…pls
 * include"). Burned comes from the band (Google's daily total: resting + moving), eaten from what you logged. Today both are
 * "so far"; a whole day is only compared once its food was logged. Within 100 kcal reads as about even. Pure.
 */
const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");
export function balance(ate: number, burned: number): { diff: number; words: string } {
  const diff = Math.round(ate - burned);
  return { diff, words: Math.abs(diff) < 100 ? "about even" : `${fmt(Math.abs(diff))} ${diff < 0 ? "less than" : "more than"} burned` };
}
