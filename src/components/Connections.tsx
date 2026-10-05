/**
 * Insights → Connections (approved prototype v2, phase 4). Left: every with/without comparison as
 * one forest plot — a square for the difference, a line for its 95% range, right = better for you.
 * Right: the explorer — pick any two measures, see the scatter and r, or tap one of the strongest
 * pairs in your data. Numbers from lib/connections; this file only draws.
 */

import { useMemo, useState, type ReactNode } from "react";
import { useStore } from "../lib/store";
import type { GlanceDay } from "../lib/glance";
import { better, comparisons, FACTORS, OUTCOMES, pair, strongestPairs, MIN_EACH, type Comparison } from "../lib/connections";
import { mean, slope, strength } from "../lib/stats";
import { atMinute, dayLabel } from "../lib/time";
import { useWidth } from "./useWidth";

const sg = (v: number, d = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;
const short = (s: string) => s.split(" (")[0].toLowerCase();

export function Connections({ days }: { days: GlanceDay[] }) {
  const supplements = useStore((s) => s.supplements);
  const rows = useMemo(() => comparisons(days, supplements), [days, supplements]);
  const pairs = useMemo(() => strongestPairs(days), [days]);
  const ready = rows.filter((r) => r.diff);
  if (!ready.length && !pairs.length && !days.some((d) => d.mood != null)) return null;
  return (
    <>
      <div className="gl-group" id="ins-connections"><h2>Connections</h2><span>what goes with better or worse days · every comparison in one place</span></div>
      <div className="gl">
        <Forest rows={rows} />
        <Explorer days={days} pairs={pairs} />
      </div>
    </>
  );
}

function Forest({ rows }: { rows: Comparison[] }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const ready = rows.filter((r) => r.diff), waiting = rows.filter((r) => !r.diff);
  const clear = ready.filter((r) => r.diff!.clear).sort((a, b) => Math.abs(b.diff!.value) - Math.abs(a.diff!.value));
  // On a phone each row's label sits on its own line and the plot gets the full width under it.
  const narrow = w < 520, labW = narrow ? 0 : Math.min(230, w * .34), valW = narrow ? 92 : 168, plotL = narrow ? 4 : labW + 8, plotR = w - valW - 8, rowH = narrow ? 44 : 31, ghH = 24;
  const ext = Math.max(2, Math.ceil(Math.max(0, ...ready.map((r) => { const b = better(r)!; return Math.max(Math.abs(b.lo), Math.abs(b.hi)); }))));
  const X = (v: number) => plotL + ((v + ext) / (2 * ext)) * (plotR - plotL);
  let y = 22, grp = "";
  const parts: ReactNode[] = [];
  for (const r of ready) {
    if (r.group !== grp) { grp = r.group; parts.push(<g key={`g${grp}`}><text x={0} y={y + 15} className="c gh">{grp.toUpperCase()}</text><line x1={0} x2={w} y1={y + ghH - 1} y2={y + ghH - 1} className="axis" /></g>); y += ghH; }
    const b = better(r)!, cy = narrow ? y + 31 : y + rowH / 2, sz = 4 + Math.min(3.5, Math.sqrt(Math.min(r.nWith, r.nWithout)) / 2.2);
    parts.push(
      <g key={r.id}>
        {narrow ? <text x={0} y={y + 14} className="l">{r.what} <tspan className="sub">→ {r.outcome}</tspan></text>
          : <><text x={0} y={cy - 2} className="l">{r.what}</text><text x={0} y={cy + 11} className="sub">→ {r.outcome}</text></>}
        <line x1={X(b.lo)} x2={X(b.hi)} y1={cy} y2={cy} className="ci" />
        <rect x={X(b.d) - sz} y={cy - sz} width={sz * 2} height={sz * 2} rx="1.5" className={r.diff!.clear ? "sq on" : "sq"} />
        <text x={plotR + (narrow ? 44 : 50)} y={cy + 4} textAnchor="end" className="v">{sg(r.diff!.value)}</text>
        {!narrow && <text x={plotR + 58} y={cy + 4} className="rng">{sg(r.diff!.lo)} to {sg(r.diff!.hi)}</text>}
        <text x={w} y={cy + 4} textAnchor="end">{r.nWith}/{r.nWithout}</text>
        <rect x={0} y={y} width={w} height={rowH} fill="transparent"><title>{`${r.what} → ${r.outcome}\n${sg(r.diff!.value)} points (95% range ${sg(r.diff!.lo)} to ${sg(r.diff!.hi)})\n${r.nWith} days with, ${r.nWithout} without\n${r.diff!.clear ? "Clear: the range stays on one side of zero" : "Not clear yet: the range crosses zero"}`}</title></rect>
      </g>,
    );
    y += rowH;
  }
  const H = y + 20, ticks: number[] = []; for (let v = -ext; v <= ext; v++) ticks.push(v);
  return (
    <section className="gp gl-forest" aria-label="What goes with what">
      <header className="gp-h"><div><span className="gp-k">What goes with what</span><h2>Days with vs without, and how sure it is</h2>
        <p className="gp-ans">{ready.length ? <><b>{clear.length} of {ready.length}</b> comparisons are clear.{clear.length ? ` Biggest: ${clear.slice(0, 2).map((r) => `${r.what.toLowerCase()} → ${r.outcome} (${sg(r.diff!.value)})`).join("; ")}.` : ""}</> : `Each comparison needs ${MIN_EACH}+ days on both sides.`}</p></div>
        <span className="gp-meta">all your logged days<br />points on the 1–10 scale</span></header>
      {ready.length > 0 && <div ref={ref} className="gl-chart forest">
        <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label="Differences between days with and without, with 95% ranges">
          <text x={X(-ext)} y={12}>{narrow ? "← worse" : "← worse for you"}</text><text x={X(ext)} y={12} textAnchor="end">{narrow ? "better →" : "better for you →"}</text>
          <text x={plotR + (narrow ? 44 : 50)} y={12} textAnchor="end" className="c">pts</text>{!narrow && <text x={plotR + 58} y={12} className="c">95% range</text>}<text x={w} y={12} textAnchor="end" className="c">days</text>
          {ticks.map((v) => <g key={v}><line x1={X(v)} x2={X(v)} y1={22} y2={y} className={v === 0 ? "axis" : "grid"} />{(X(1) - X(0) >= 22 || v % 2 === 0) && <text x={X(v)} y={y + 13} textAnchor="middle">{v === 0 ? "0" : sg(v, 0)}</text>}</g>)}
          {parts}
        </svg>
      </div>}
      {waiting.length > 0 && <details className="gl-wait"><summary>Still collecting · {waiting.length} comparisons</summary>
        <ul>{waiting.map((r) => <li key={r.id}>{r.what} → {r.outcome} <span className="gl-dim">needs {r.need} more day{r.need === 1 ? "" : "s"} {r.nWith < r.nWithout ? "with" : "without"}</span></li>)}</ul></details>}
      <footer className="gp-f"><span className="lgd"><i className="sqk on" />clear</span><span className="lgd"><i className="sqk" />not clear yet</span><span>line = 95% range · bigger square = more days · numbers: with − without</span>
        {ready.length >= 10 && <span className="gl-dim">With {ready.length} comparisons, about {Math.max(1, Math.round(ready.length * .05))} could look clear by chance — trust one that stays clear for weeks.</span>}</footer>
    </section>
  );
}

function Explorer({ days, pairs }: { days: GlanceDay[]; pairs: ReturnType<typeof strongestPairs> }) {
  const first = pairs[0];
  const [sel, setSel] = useState<{ x: string; y: string; lag: 0 | 1 }>(first ? { x: first.x.k, y: first.y.k, lag: first.lag } : { x: "cafBed", y: "sleep", lag: 0 });
  const X = FACTORS.find((f) => f.k === sel.x)!, Y = OUTCOMES.find((o) => o.k === sel.y)!;
  const p = useMemo(() => pair(days, X, Y, sel.lag), [days, X, Y, sel.lag]);
  const [ref, w] = useWidth<HTMLDivElement>();
  const h = 230, L = 40, R = 10, top = 20, bot = 30, xs = p.pts.map((q) => q[0]), ys = p.pts.map((q) => q[1]);
  const when = Y.k === "sleep" ? (sel.lag ? "the morning after next" : "next morning") : sel.lag ? "next day" : "same day";
  let chart: ReactNode = <div className="needs">Needs 10+ days with both logged ({p.pts.length} so far).</div>;
  if (p.pts.length >= 3) {
    const xlo = Math.min(...xs), xhi = Math.max(...xs), ylo = Math.min(...ys), yhi = Math.max(...ys), px = (xhi - xlo) * .05 || 1, py = (yhi - ylo) * .08 || 1;
    const SX = (v: number) => L + ((v - xlo + px) / (xhi - xlo + 2 * px)) * (w - L - R), SY = (v: number) => top + (1 - (v - ylo + py) / (yhi - ylo + 2 * py)) * (h - top - bot);
    const tk = (lo: number, hi: number) => { const st = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].find((s) => (hi - lo) / s <= 6) ?? 1000; const out: number[] = []; for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) out.push(+v.toFixed(2)); return out; };
    const sl = slope(xs, ys), mx = mean(xs), my = mean(ys);
    const jit = (i: number) => (((i * 9301 + 49297) % 233280) / 233280 - .5) * 6;
    const intX = xs.every(Number.isInteger) && xhi - xlo < 12, intY = ys.every(Number.isInteger) && yhi - ylo < 12;
    chart = (
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`${X.name} against ${Y.name}`}>
        {tk(ylo - py, yhi + py).map((v) => <g key={`y${v}`}><line x1={L} x2={w - R} y1={SY(v)} y2={SY(v)} className="grid" /><text x={L - 6} y={SY(v) + 3.5} textAnchor="end">{v}</text></g>)}
        {tk(xlo - px, xhi + px).map((v) => <text key={`x${v}`} x={SX(v)} y={h - bot + 14} textAnchor="middle">{v}</text>)}
        <line x1={L} x2={w - R} y1={h - bot} y2={h - bot} className="axis" />
        {p.pts.map(([a, b, d], i) => <circle key={d} cx={SX(a) + (intX ? jit(i) : 0)} cy={SY(b) + (intY ? jit(i + 7) : 0)} r="4" className="dot"><title>{`${dayLabel(atMinute(d, 720))}\n${X.name}: ${+a.toFixed(1)}\n${Y.name} (${when}): ${+b.toFixed(1)}`}</title></circle>)}
        {Number.isFinite(sl) && <line x1={SX(xlo)} x2={SX(xhi)} y1={SY(my + sl * (xlo - mx))} y2={SY(my + sl * (xhi - mx))} className="fit" />}
        <text x={w - R} y={h - 2} textAnchor="end" className="c">{X.name} →</text>
        <text x={L - 34} y={9} className="c">↑ {Y.name}, {when}</text>
      </svg>
    );
  }
  const r = p.r;
  return (
    <section className="gp gl-explore" aria-label="Explorer">
      <header className="gp-h"><div><span className="gp-k">Explorer</span><h2>Pick any two, see if they move together</h2>
        <p className="gp-ans">{r ? r.clear ? <><b>Higher {short(X.name)}</b> goes with <b>{r.value < 0 ? "lower" : "higher"} {short(Y.name)}</b> ({when}) — a {strength(r)} link.</> : <>No clear link between {short(X.name)} and {short(Y.name)} ({when}) yet.</> : <>Pick two measures below.</>}</p></div>
        <span className="gp-meta">one dot per day</span></header>
      <div className="gl-ctl">
        <label>Factor <select id="ex-x" value={sel.x} onChange={(e) => setSel({ ...sel, x: e.target.value })}>{FACTORS.map((f) => <option key={f.k} value={f.k}>{f.name}</option>)}</select></label>
        <label>Outcome <select id="ex-y" value={sel.y} onChange={(e) => setSel({ ...sel, y: e.target.value })}>{OUTCOMES.map((o) => <option key={o.k} value={o.k}>{o.name}</option>)}</select></label>
        <label>When <select id="ex-l" value={sel.lag} onChange={(e) => setSel({ ...sel, lag: Number(e.target.value) as 0 | 1 })}><option value={0}>same day</option><option value={1}>a day later</option></select></label>
      </div>
      <div ref={ref} className="gl-chart">{chart}</div>
      {r && <div className="gl-stat"><span>r <b>{r.value.toFixed(2)}</b> [{r.lo.toFixed(2)}, {r.hi.toFixed(2)}]</span><span><b>{r.n}</b> days</span><span>{r.clear ? <b>clear</b> : "not clear yet"}</span></div>}
      {pairs.length > 0 && <div className="gl-pairs">
        <div className="gl-pairs-h">Strongest clear pairs in your data <span>tap one to plot it</span></div>
        {pairs.slice(0, 6).map((q) => (
          <button type="button" key={`${q.x.k}-${q.y.k}-${q.lag}`} className="gl-pair" aria-pressed={q.x.k === sel.x && q.y.k === sel.y && q.lag === sel.lag} onClick={() => setSel({ x: q.x.k, y: q.y.k, lag: q.lag })}>
            <span>{q.x.name.split(" (")[0]} <i>→</i> {short(q.y.name)}{q.lag ? <em>a day later</em> : null}</span>
            <span className="rbar"><i style={{ width: `${Math.round(Math.abs(q.r!.value) * 100)}%` }} /></span>
            <b>{q.r!.value < 0 ? "−" : "+"}{Math.abs(q.r!.value).toFixed(2)}</b>
          </button>
        ))}
      </div>}
      <footer className="gp-f"><span className="lgd"><i className="dot" style={{ background: "var(--g-now)" }} />a day</span><span className="lgd"><i className="ln now" style={{ background: "var(--i-ink)" }} />straight-line fit</span><span className="gl-dim">r: −1 to +1, how tightly they move together. Goes with, not causes.</span></footer>
    </section>
  );
}
