/**
 * What changed since you last looked (PLAN 225; owner, 17 Nov: "3"). Insights keeps, on this device, what it showed you:
 * which way each trend was going, which links held, how sure each finding was. On a new visit (6 hours or more after the
 * last) the one before becomes the line to compare against, and the card lists what moved since: a trend that turned, a
 * link that's new or no longer holds, a finding that firmed up or faded. The same visit keeps the same list. Pure.
 */

export type Mark = { key: string; kind: "trend" | "link" | "finding"; name: string; state: string; href: string };
export type Seen = { at: number; marks: Record<string, Omit<Mark, "key">> };
export type SeenStore = { base: Seen | null; last: Seen | null };
export type Change = { key: string; tag: "new" | "turned" | "gone" | "firmer" | "fainter"; text: string; href: string; kind: Mark["kind"]; /** for its colour */ tone: "good" | "bad" | "quiet" };

export const SINCE = { visitGapH: 6, show: 6 } as const;

/** A new visit moves the last one into place as the line to compare against; the same visit keeps it. */
export function rollSeen(s: SeenStore, marks: Mark[], now: number): SeenStore {
  const seen: Seen = { at: now, marks: Object.fromEntries(marks.map(({ key, ...m }) => [key, m])) };
  const newVisit = !s.last || now - s.last.at >= SINCE.visitGapH * 3_600_000;
  return { base: newVisit ? s.last : s.base, last: seen };
}

const TREND: Record<string, string> = { better: "getting better", worse: "slipping", steady: "steady" };
const SURE: Record<string, number> = { clear: 2, likely: 1 };

/** What moved between what you saw then and now, the biggest news first; at most SINCE.show. */
export function changesSince(base: Seen | null, marks: Mark[]): Change[] {
  if (!base) return [];
  const out: (Change & { rank: number })[] = [], now = new Map(marks.map((m) => [m.key, m]));
  for (const m of marks) {
    const was = base.marks[m.key];
    if (m.kind === "trend") {
      if (!was || was.state === m.state) continue;
      out.push({ key: m.key, kind: m.kind, tag: "turned", text: `${m.name}: ${TREND[was.state] ?? was.state} → ${TREND[m.state] ?? m.state}`, href: m.href, tone: m.state === "worse" ? "bad" : m.state === "better" ? "good" : "quiet", rank: m.state === "worse" ? 0 : m.state === "better" ? 2 : 4 });
    } else if (m.kind === "link") {
      if (!was) out.push({ key: m.key, kind: m.kind, tag: "new", text: m.name, href: m.href, tone: "quiet", rank: 1 });
    } else if (!was) {
      out.push({ key: m.key, kind: m.kind, tag: "new", text: `${m.name} — ${m.state}`, href: m.href, tone: "quiet", rank: m.state === "clear" ? 1 : 3 });
    } else if (was.state !== m.state) {
      const up = (SURE[m.state] ?? 0) > (SURE[was.state] ?? 0);
      out.push({ key: m.key, kind: m.kind, tag: up ? "firmer" : "fainter", text: `${m.name}: ${was.state} → ${m.state}`, href: m.href, tone: up ? "good" : "quiet", rank: up ? 1 : 5 });
    }
  }
  for (const [key, was] of Object.entries(base.marks)) {
    if (now.has(key) || was.kind === "trend") continue;
    out.push({ key, kind: was.kind, tag: "gone", text: was.kind === "link" ? `No longer holds: ${was.name.charAt(0).toLowerCase()}${was.name.slice(1)}` : `${was.name}: no longer ${was.state}`, href: was.href, tone: "quiet", rank: 6 });
  }
  return out.sort((a, b) => a.rank - b.rank).slice(0, SINCE.show).map(({ rank: _r, ...c }) => c);
}
