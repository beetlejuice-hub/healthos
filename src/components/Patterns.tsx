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

const pct = (v: number, max: number) => Math.max(0, Math.min(100, (v / max) * 100));
/** Red when the thing goes with a lower mood (more often before your lowest days, less before your best), green the other way. */
const toneOf = (kind: "worst" | "best", group: number, rest: number) => ((group > rest) === (kind === "worst") ? "worse" : "better");

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
            <div className={`pt-row${r.diff!.clear ? " clear" : ""}`} key={r.f.k} data-tip={`${r.f.name}\nThese days: ${fmt(r, r.group)} (${r.nGroup})\nOther days: ${fmt(r, r.rest)} (${r.nRest})\nDifference ${r.diff!.value >= 0 ? "+" : "−"}${fmt(r, Math.abs(r.diff!.value))}, 95% range ${fmt(r, r.diff!.lo)} to ${fmt(r, r.diff!.hi)}\n${r.diff!.clear ? "Clear" : "Not clear yet"}`}>
              <span className="nm">{r.f.name}</span>
              {/* the heat view (PLAN 105): these days' dot against your other days', joined in red when the thing goes with
                  a lower mood, green with a better one — strong when clear, faint while "not yet" */}
              <span className="db" data-tone={toneOf(kind, r.group, r.rest)} data-clear={r.diff!.clear || undefined} aria-hidden="true">
                <i className="seg" style={{ left: `${pct(Math.min(r.group, r.rest), max)}%`, width: `${Math.abs(pct(r.group, max) - pct(r.rest, max))}%` }} />
                <i className="o" style={{ left: `${pct(r.rest, max)}%` }} /><i className="t" style={{ left: `${pct(r.group, max)}%` }} />
              </span>
              <span className="vals"><b>{fmt(r, r.group)}</b> vs {fmt(r, r.rest)}</span>
              <span className={`tag ${r.diff!.clear ? "s" : "w"}`}>{r.diff!.clear ? "clear" : "not yet"}</span>
            </div>
          );
        })}
      </div>
      {side.words.length > 0 && <div className="pt-words"><span className="gp-k">In your notes then</span>{side.words.map((w) => <span key={w.word} className="pt-word" data-tip={`On ${w.days} of these ${side.days.length} days`}>{w.word} <small>{w.days}</small></span>)}</div>}
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
      <footer className="gp-f"><span className="lgd"><i className="dot" style={{ background: "var(--i-ink)" }} />these days</span><span className="lgd"><i className="dot" style={{ background: "var(--i-dim)" }} />your other days</span><span className="lgd"><i style={{ background: "var(--sh-r)" }} />goes with a lower mood</span><span className="lgd"><i style={{ background: "var(--sh-g)" }} />with a better one · faint until clear</span><span className="gl-dim">Goes with, not causes: a night out and a bad week can land together. "clear" = the 95% range stays off zero.</span></footer>
    </section>
  );
}
