/** A weight as typed on a phone (PLAN 141): comma or dot, and the moment between ("40,"). Pure. */

/** "40,5" → 40.5, "40," → 40, "" → 0; null for anything that isn't a number. */
export function parseDecimal(t: string): number | null {
  const s = t.trim().replace(",", ".");
  if (s === "" || s === ".") return 0; // on the way to ".5"
  if (!/^\d*\.?\d*$/.test(s)) return null;
  return Number(s);
}
