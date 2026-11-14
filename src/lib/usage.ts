/**
 * Which cards he uses (owner, 14 Nov, item 15 of the open list: "good idea but lmk before deleting"). On this phone only,
 * never sent anywhere: each card (a section with a name) counted as seen — on screen for a second or more, once per
 * screen visit — and as used — a tap inside it, or a fold opened. A card seen 10 times or more over 2 weeks and never
 * used is "never touched": a candidate to ask him about, never removed by itself. Pure; the counting in the browser is
 * components/useUsage.
 */

export type UsageRow = { seen: number; used: number; firstAt: number; lastUsed?: number };
export type Usage = Record<string, UsageRow>;
export const USAGE = { quietSeen: 10, quietDays: 14, maxKeys: 300 } as const;

/** One more seen or used for `key` (a card's name). Names are trimmed and capped; the list is capped too. */
export function record(u: Usage, key: string, kind: "seen" | "used", now: number): Usage {
  const k = key.trim().slice(0, 80);
  if (!k) return u;
  const r = u[k] ?? { seen: 0, used: 0, firstAt: now };
  const next = { ...u, [k]: kind === "seen" ? { ...r, seen: r.seen + 1 } : { ...r, used: r.used + 1, lastUsed: now } };
  const keys = Object.keys(next);
  if (keys.length <= USAGE.maxKeys) return next;
  // the oldest-seen, least-used names go first
  const drop = keys.sort((a, b) => next[a].used - next[b].used || next[a].firstAt - next[b].firstAt).slice(0, keys.length - USAGE.maxKeys);
  for (const d of drop) delete next[d];
  return next;
}

export type UsageReport = { used: (UsageRow & { key: string })[]; quiet: (UsageRow & { key: string })[]; since: number | null };
/** The cards used most first; and the ones seen often over 2 weeks and never used. */
export function report(u: Usage, now: number): UsageReport {
  const rows = Object.entries(u).map(([key, r]) => ({ key, ...r }));
  return {
    used: rows.filter((r) => r.used > 0).sort((a, b) => b.used - a.used || b.seen - a.seen),
    quiet: rows.filter((r) => r.used === 0 && r.seen >= USAGE.quietSeen && now - r.firstAt >= USAGE.quietDays * 86_400_000).sort((a, b) => b.seen - a.seen),
    since: rows.length ? Math.min(...rows.map((r) => r.firstAt)) : null,
  };
}
