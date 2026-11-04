/**
 * One list of findings (PLAN 195; owner, 4 Nov: "1" — "this goes with that" was in six places, the same thing two or
 * three times in other words). A lead ("worth a look") that asks what a Noticed card already answers isn't listed again:
 * the lead's cause and outcome, in Noticed's words, against the cards on show. Pure.
 */

/** A lead's cause, as the Noticed question group that asks the same (its lag matters: gym that day ≠ the day after). */
export function leadGroup(p: { a: { id: string }; lag: number }): string | null {
  const a = p.a.id;
  if (a.startsWith("supp-")) return a;
  const next = p.lag >= 1;
  switch (a) {
    case "alcohol": return next ? "alc" : null;
    case "lateCaf": return next ? "late-caf" : null;
    case "caffeine": return next ? null : "caf-total";
    case "gym": return next ? "gym-next" : "gym";
    case "volume": return next ? "gym-next" : null;
    case "lateEat": return next ? "late-eat" : null;
    case "protein": return next ? "protein" : null;
    case "kcal": return next ? "kcal-dev" : null;
    default: return null;
  }
}
/** A lead's outcome in Noticed's words. */
const outcomeOf = (b: string) => (b === "sleepRating" ? "sleep" : ["energy", "mood", "focus", "stress"].includes(b) ? b : null);

/** Is this lead already a Noticed card: the same cause and outcome among the cards' ids (and what each card covers). */
export function sameAsNoticed(p: { a: { id: string }; b: { id: string }; lag: number }, cards: { id: string; covers?: string[] }[]): boolean {
  const g = leadGroup(p), o = outcomeOf(p.b.id);
  if (!g || !o) return false;
  const want = `fx-${g}-${o}`, ids = new Set(cards.flatMap((c) => [c.id, ...(c.covers ?? [])]));
  // a card is its group's (fx-alc-mood covers fx-alc-2-mood): any question of the group counts
  return ids.has(want) || [...ids].some((id) => id.startsWith(`fx-${g}-`) && id.endsWith(`-${o}`));
}
