/**
 * Insights → Mind → "Before your best and worst days" (owner, 5 Oct: "smarter engine"). Your lowest-
 * and highest-mood days, and what came before them compared with every other day — side by side,
 * each with how sure it is, plus the words that keep showing up in your notes then. lib/patterns.
 */

import { useMemo } from "react";
import { useStore } from "../lib/store";
import type { GlanceDay } from "../lib/glance";
import { patterns, type Row, type Side } from "../lib/patterns";

const fmt = (r: Row, v: number) => (r.f.share ? `${Math.round(v * 100)}%` : r.f.dec === 0 ? Math.round(v).toLocaleString("en-GB") : v.toFixed(1));

function SideCol({ side, kind }: { side: Side; kind: "worst" | "best" }) {
  const rows = side.rows.filter((r) => r.diff);
  const clear = rows.filter((r) => r.diff!.clear);
  return (
    <div className={`pt-side pt-${kind}`}>
      <h3>{kind === "worst" ? "Your lowest days" : "Your best days"} <span>mood {kind === "worst" ? "≤" : "≥"} {side.cut.toFixed(1)} · {side.days.length} days · average {side.mood.toFixed(1)}</span></h3>
      <p className="gp-ans">{clear.length ? <>Clearest: {clear.slice(0, 2).map((r, i) => <span key={r.f.k}>{i ? "; " : ""}<b>{r.f.name.toLowerCase()}</b> {fmt(r, r.group)}{r.f.share ? " of these days" : ""} vs {fmt(r, r.rest)} on other days</span>)}.</> : "Nothing that came before them stands out clearly yet."}</p>
      <div className="pt-rows">
        {rows.map((r) => {
          const max = Math.max(r.group, r.rest, r.f.share ? 1 : 0) || 1;
          return (
            <div className={`pt-row${r.diff!.clear ? " clear" : ""}`} key={r.f.k} title={`${r.f.name}\nThese days: ${fmt(r, r.group)} (${r.nGroup})\nOther days: ${fmt(r, r.rest)} (${r.nRest})\nDifference ${r.diff!.value >= 0 ? "+" : "−"}${fmt(r, Math.abs(r.diff!.value))}, 95% range ${fmt(r, r.diff!.lo)} to ${fmt(r, r.diff!.hi)}\n${r.diff!.clear ? "Clear" : "Not clear yet"}`}>
              <span className="nm">{r.f.name}</span>
              <span className="bars"><i className="g" style={{ width: `${Math.max(2, (r.group / max) * 100)}%` }} /><i className="r" style={{ width: `${Math.max(2, (r.rest / max) * 100)}%` }} /></span>
              <span className="vals"><b>{fmt(r, r.group)}</b> vs {fmt(r, r.rest)}</span>
              <span className={`tag ${r.diff!.clear ? "s" : "w"}`}>{r.diff!.clear ? "clear" : "not yet"}</span>
            </div>
          );
        })}
      </div>
      {side.words.length > 0 && <div className="pt-words"><span className="gp-k">In your notes then</span>{side.words.map((w) => <span key={w.word} className="pt-word" title={`On ${w.days} of these ${side.days.length} days`}>{w.word} <small>{w.days}</small></span>)}</div>}
    </div>
  );
}

export function Patterns({ days }: { days: GlanceDay[] }) {
  const entries = useStore((s) => s.entries);
  const p = useMemo(() => patterns(days, entries), [days, entries]);
  if ("need" in p) return days.some((d) => d.mood != null) ? (
    <section className="gp gl-patterns" aria-label="Before your best and worst days">
      <header className="gp-h"><div><span className="gp-k">Patterns</span><h2>Before your best and worst days</h2><p className="gp-ans">Needs {p.need} more day{p.need === 1 ? "" : "s"} with a mood check-in — then this compares what came before your lowest and best days.</p></div></header>
    </section>
  ) : null;
  return (
    <section className="gp gl-patterns" aria-label="Before your best and worst days">
      <header className="gp-h"><div><span className="gp-k">Patterns</span><h2>Before your best and worst days</h2>
        <p className="gp-ans">Your bottom and top fifth of days by mood, and what came before them — that morning's sleep rating, the evening before, training, food — compared with every other day.</p></div>
        <span className="gp-meta">{p.rated} rated days</span></header>
      <div className="pt-cols"><SideCol side={p.worst} kind="worst" /><SideCol side={p.best} kind="best" /></div>
      <footer className="gp-f"><span className="lgd"><i style={{ background: "var(--i-ink)" }} />these days</span><span className="lgd"><i style={{ background: "var(--i-line-2)" }} />your other days</span><span className="gl-dim">Goes with, not causes: a night out and a bad week can land together. "clear" = the 95% range stays off zero.</span></footer>
    </section>
  );
}
