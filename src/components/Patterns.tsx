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
/** What the number is: "kcal", "/10", "mg", "of days" (owner, 22 Oct: "it was just not explained enough like whats the percentages"). */
const unitOf = (r: Row) => (r.f.share ? "of days" : r.f.unit);
const ICON: Record<string, string> = { sleep: "😴", cafBed: "☕", lateCaf: "☕", drinks: "🍺", trained: "🏋️", trainedBefore: "🏋️", kcalBefore: "🍽" };
/**
 * A clear one in a sentence (owner: "i like the sentence idea"), which way first: "Less often: caffeine after 14:00 the day
 * before — 1 of these 21 days, against 41% of your other days."
 */
function say(r: Row): [string, string] {
  const thing = r.f.name[0].toLowerCase() + r.f.name.slice(1), up = r.group > r.rest;
  if (r.f.share) return [up ? "More often" : "Less often", `${thing} — ${Math.round(r.group * r.nGroup)} of these ${r.nGroup} days, against ${fmt(r, r.rest)} of your other days.`];
  const u = r.f.unit === "/10" ? "/10" : ` ${r.f.unit}`;
  return [up ? "Higher" : "Lower", `${thing} — ${fmt(r, r.group)}${u} on average, against ${fmt(r, r.rest)}${u} on your other days.`];
}

const pct = (v: number, max: number) => Math.max(0, Math.min(100, (v / max) * 100));
/** Red when the thing goes with a lower mood (more often before your lowest days, less before your best), green the other way. */
const toneOf = (kind: "worst" | "best", group: number, rest: number) => ((group > rest) === (kind === "worst") ? "worse" : "better");

function SideCol({ side, kind }: { side: Side; kind: "worst" | "best" }) {
  const rows = side.rows.filter((r) => r.diff);
  const clear = rows.filter((r) => r.diff!.clear);
  const others = rows.length ? Math.max(...rows.map((r) => r.nRest)) : 0;
  return (
    <div className={`pt-side pt-${kind}`}>
      <h3>Before your {kind === "worst" ? "lowest" : "best"} days <span>{side.days.length} days with mood {side.cut.toFixed(1)} or {kind === "worst" ? "lower" : "higher"} (average {side.mood.toFixed(1)})</span></h3>
      {/* what stands out, in words first; the rows below are the same, drawn */}
      {clear.length ? <ul className="pt-say">{clear.slice(0, 3).map((r) => { const [way, rest] = say(r); return <li key={r.f.k}><span aria-hidden="true">{ICON[r.f.k] ?? "•"}</span><span><b>{way}:</b> {rest}</span></li>; })}</ul>
        : <p className="gp-ans">Nothing stands out yet — no difference big enough to tell from chance.</p>}
      <div className="pt-key" aria-hidden="true"><span><i className="t" />these {side.days.length} days</span><span><i className="o" />your other {others} days</span></div>
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
              <span className="vals"><b>{fmt(r, r.group)}</b> vs {fmt(r, r.rest)} <small>{unitOf(r)}</small></span>
              <span className={`tag ${r.diff!.clear ? "s" : "w"}`}>{r.diff!.clear ? "clear" : "too early"}</span>
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
        <p className="gp-ans">Your lowest and best fifth of days by mood, and what came before each — the night's sleep, the evening before, training, food — against all your other days. A % is how many of those days it happened on.</p></div>
        <span className="gp-meta">{p.rated} rated days</span></header>
      <div className="pt-cols"><SideCol side={p.worst} kind="worst" /><SideCol side={p.best} kind="best" /></div>
      <footer className="gp-f"><span className="lgd"><i style={{ background: "var(--sh-r)" }} />the gap goes with a lower mood</span><span className="lgd"><i style={{ background: "var(--sh-g)" }} />with a better one</span><span className="gl-dim">Clear: a gap this big is unlikely to be chance. Too early: faint, not enough days to tell yet. Goes with, not causes — a night out and a bad week can land together. Days not logged in full (under 1,000 kcal) are left out of calories.</span></footer>
    </section>
  );
}
