/**
 * A food's 0–100 and why (PLAN 139; owner, 27 Oct: "FOR each food if i click on it it should show the score" — "3c": in the
 * search results and on a logged food, as on the day's food sheet). The chip shows the score; a tap opens its parts.
 */

import type { ItemScore } from "../lib/foodscore";

const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString("en-GB");
export const scoreBand = (s: number | null) => (s == null ? "none" : s >= 70 ? "ideal" : s >= 40 ? "fair" : "poor");

/** The chip: a tap opens the why (and doesn't pick the row it sits in). */
export function ScoreChip({ s, name, open, onToggle }: { s: ItemScore | null; name: string; open: boolean; onToggle: () => void }) {
  if (!s) return null;
  return <button type="button" className="fd-score" data-band={scoreBand(s.score)} aria-expanded={open} aria-label={`${name}: score ${s.score ?? "not known yet"} — why`}
    onClick={(ev) => { ev.stopPropagation(); onToggle(); }} onKeyDown={(ev) => ev.stopPropagation()}>{s.score ?? "—"}</button>;
}

/** Its parts: for your goal, quality, timing — each with what it's from. */
export function ScoreWhy({ s, title }: { s: ItemScore; title?: string }) {
  return (
    <ul className="fd-why" onClick={(ev) => ev.stopPropagation()}>
      {title && <li className="fd-title"><span>{title}</span><b>{s.score ?? "—"}</b></li>}
      {s.parts.map((p) => <li key={p.id}><span>{p.name}</span><b>{fmt(p.got)}/{p.max}</b><small>{p.why}</small></li>)}
      {s.missing && <li className="fd-miss"><span>Quality</span><b>—</b><small>No score yet: {s.missing}.</small></li>}
    </ul>
  );
}
