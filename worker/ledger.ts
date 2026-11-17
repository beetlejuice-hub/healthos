/**
 * What the AI has spent, kept on the server (security review, 17 Nov). The month's budget and the day's cap were checked
 * against the account's own "ai_usage" doc — a row that account can write — so anyone who signed up could zero it and
 * spend on without end. This ledger lives in a Durable Object only the Worker reaches: each account's month and day, and
 * every account's month together, which has a ceiling of its own (AI_TOTAL_USD), so however many accounts are made the
 * key can't be run up past it. The doc stays what Settings shows. Pure; the BandHub keeps it ("_ai" hub).
 */

export type Ledger = { month: string; total: number; users: Record<string, { usd: number; day: string; calls: number; dayUsd: number }> };
export const EMPTY_LEDGER = (month: string): Ledger => ({ month, total: 0, users: {} });

/** The ledger as of `day`: a new month starts every total again; a new day each account's calls. */
export function ledgerAsOf(l: Ledger | null | undefined, day: string): Ledger {
  const month = day.slice(0, 7);
  if (!l || l.month !== month) return EMPTY_LEDGER(month);
  return l;
}

/** One account's spend in the ledger as of `day`. */
export function mineIn(l: Ledger, id: string, day: string): { usd: number; calls: number; dayUsd: number } {
  const u = l.users[id];
  return { usd: u?.usd ?? 0, calls: u && u.day === day ? u.calls : 0, dayUsd: u && u.day === day ? u.dayUsd : 0 };
}

/** A call's cost added (and a call counted, unless it's a tool round of one already counted). */
export function ledgerAdd(l0: Ledger | null | undefined, add: { day: string; user: string; usd: number; call: boolean }): Ledger {
  const l = ledgerAsOf(l0, add.day), usd = Number.isFinite(add.usd) && add.usd > 0 ? add.usd : 0;
  const was = mineIn(l, add.user, add.day);
  return { ...l, total: l.total + usd, users: { ...l.users, [add.user]: { usd: was.usd + usd, day: add.day, calls: was.calls + (add.call ? 1 : 0), dayUsd: was.dayUsd + usd } } };
}
