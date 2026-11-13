/**
 * What goes with what, as a map (renovation part 3; owner, 13 Nov, on the canvas: "i like A, b is okay but i want these
 * things listed not me picking · c is hard to read"). A: what you do on the left, how you are on the right, a line per
 * link — green goes with better, red with worse, thicker is stronger — each outcome with its own trend; tap a box for
 * only its links. B, listed: every outcome with what goes with it as bars on one scale, with their ranges. And on
 * Insights' landing, "What to look at": the slipping outcome and the things you do that go with it. Numbers from
 * lib/linkmap; draws only.
 */

import { useMemo, useState, type KeyboardEvent } from "react";
import { linkWords } from "../lib/connect";
import { linkMap, lookAt, lookWords, outcomeBars, type BarRow, type LinkMap as Map_ } from "../lib/linkmap";
import { useLinks } from "./useLinks";
import { useWidth } from "./useWidth";

const LAG = ["", "+1d", "+2d"];
const TREND: Record<string, [string, string]> = { worse: ["↘", "slipping"], better: ["↗", "better"], steady: ["→", "steady"] };

/** On Insights' landing, under every trend: the outcome that's slipping and what goes with it. Nothing slipping → nothing. */
export function LookAt({ now }: { now: number }) {
  const { things, links, today } = useLinks(now);
  const a = useMemo(() => (links.length ? lookAt(linkMap(links, things, today), things, today) : null), [links, things, today]);
  if (!a) return null;
  return (
    <section className="p w12 la" aria-label="What to look at" data-outcome={a.outcome.key}>
      <h2>What to look at <span>from every trend and the links that hold</span></h2>
      <p className="la-say">{lookWords(a)}</p>
      <p className="note-i">Goes with, not causes: an experiment on you can tell. <a href="#insights/connections" className="linkish">See the map ›</a></p>
    </section>
  );
}

export function LinkMapCard({ now }: { now: number }) {
  const { things, links, today } = useLinks(now);
  const [ref, w0] = useWidth<HTMLDivElement>(), w = w0 || 360;
  const map = useMemo(() => linkMap(links, things, today), [links, things, today]);
  const bars = useMemo(() => outcomeBars(map, things), [map, things]);
  const by = useMemo(() => new Map(things.map((t) => [t.key, t])), [things]);
  const [sel, setSel] = useState<string | null>(null);
  if (!map.edges.length) return <div ref={ref} />;
  const shown = map.edges.filter((e) => !sel || e.from === sel || e.to === sel).sort((a, b) => b.w - a.w);
  const cw = Math.min(Math.max(280, w), 620);
  return (
    <section className="p w12 lm" id="link-map" aria-label="The map: what goes with what">
      <h2>What goes with what <span>{map.edges.length} link{map.edges.length === 1 ? " that holds" : "s that hold"} · what you do on the left, how you are on the right</span></h2>
      <div ref={ref} className="lm-w" />
      <MapSvg map={map} sel={sel} onSel={(k) => setSel(sel === k ? null : k)} w={cw} />
      <div className="lm-legend"><span><i className="good" />goes with better</span><span><i className="bad" />goes with worse</span><span>thicker = stronger · +1d = the next day</span></div>
      <ul className="lm-list">{shown.slice(0, sel ? 12 : 3).map((e) => <li key={`${e.from}>${e.to}`} className={e.good ? "good" : "bad"}>{linkWords(e.link, by).split(" (90 %")[0]}.</li>)}</ul>
      <p className="note-i">{sel ? `Only what goes with ${(by.get(sel)?.name ?? "").replace(/^[A-Z][a-z]/, (x) => x.toLowerCase())}. Tap it again for all.` : "The three strongest. Tap any box for only its links."}</p>
      <h3 className="lm-h3">Each outcome, and what goes with it</h3>
      <div className="lm-bars">{bars.map((o) => <Bars key={o.key} o={o} w={Math.min(cw, 420)} />)}</div>
      <p className="note-i">A dot: one usual spread more of the thing you do, in the outcome's usual spread, so drinks and steps sit on one scale; the bar is its 90 % range. Right is better. Goes with, not causes.</p>
    </section>
  );
}

function MapSvg({ map, sel, onSel, w }: { map: Map_; sel: string | null; onSel: (k: string) => void; w: number }) {
  const rowI = 30, rowO = 42, top = 14, bw = Math.min(150, Math.round(w * 0.36));
  const h = Math.max(map.inputs.length * rowI, map.outcomes.length * rowO) + top * 2;
  const yi = (k: string) => top + map.inputs.findIndex((x) => x.key === k) * rowI + 11, yo = (k: string) => top + map.outcomes.findIndex((x) => x.key === k) * rowO + 14;
  const on = (f: string, t: string) => !sel || f === sel || t === sel;
  const linked = (k: string) => !sel || k === sel || map.edges.some((e) => (e.from === sel && e.to === k) || (e.to === sel && e.from === k));
  const key = (k: string) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSel(k); } };
  const x0 = bw + 2, x1 = w - bw - 2, mx = (x0 + x1) / 2;
  const fit = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s), chars = Math.floor((bw - 14) / 6.2);
  return (
    <svg className="lm-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`What you do on the left, how you are on the right: ${map.edges.length} links`}>
      {map.edges.map((e) => { const a = yi(e.from), b = yo(e.to), lit = on(e.from, e.to); return (
        <g key={`${e.from}>${e.to}`} data-edge={`${e.from}>${e.to}`}>
          <path className={`lm-edge ${e.good ? "good" : "bad"}${lit ? "" : " dim"}`} d={`M${x0} ${a} C${mx} ${a}, ${mx} ${b}, ${x1} ${b}`} strokeWidth={1 + e.w * 9} />
          {sel && lit && <text className="lm-lag lm-on-line" x={mx} y={(a + b) / 2 - 7 - e.w * 4} textAnchor="middle">{e.lag ? LAG[e.lag] : "same day"}</text>}
        </g>); })}
      {map.inputs.map((n) => (
        <g key={n.key} className={`lm-node${n.key === sel ? " on" : linked(n.key) ? "" : " dim"}`} data-node={n.key} role="button" tabIndex={0} aria-label={`${n.name}: only its links`} aria-pressed={n.key === sel} onClick={() => onSel(n.key)} onKeyDown={key(n.key)}>
          <rect x="0" y={yi(n.key) - 11} width={bw} height="22" rx="5" /><text x="8" y={yi(n.key) + 4}>{fit(n.name, chars)}</text>
        </g>))}
      {map.outcomes.map((n) => { const t = TREND[n.trend?.tone ?? "steady"]; return (
        <g key={n.key} className={`lm-node${n.key === sel ? " on" : linked(n.key) ? "" : " dim"}`} data-node={n.key} data-tone={n.trend?.tone ?? "none"} role="button" tabIndex={0} aria-label={`${n.name}, ${n.trend ? t[1] : "no trend yet"}: only its links`} aria-pressed={n.key === sel} onClick={() => onSel(n.key)} onKeyDown={key(n.key)}>
          <rect x={w - bw} y={yo(n.key) - 14} width={bw} height="30" rx="5" /><text x={w - bw + 8} y={yo(n.key) - 1}>{fit(n.name, chars)}</text>
          {n.trend && <text x={w - bw + 8} y={yo(n.key) + 11} className={`lm-lag lm-${n.trend.tone}`}>{t[0]} {t[1]}</text>}
        </g>); })}
    </svg>
  );
}

function Bars({ o, w }: { o: { key: string; name: string; trend: { tone: string } | null; rows: BarRow[] }; w: number }) {
  const row = 28, h = o.rows.length * row + 20, x0 = Math.round(w * 0.42), x1 = w - 8;
  const m = Math.max(0.3, ...o.rows.map((r) => Math.max(Math.abs(r.lo), Math.abs(r.hi)))) * 1.1, X = (v: number) => x0 + ((v + m) / (2 * m)) * (x1 - x0);
  const t = TREND[o.trend?.tone ?? "steady"];
  return (
    <div className="lm-out" data-outcome={o.key}>
      <div><b>{o.name}</b>{o.trend && <span className={`lm-lag lm-${o.trend.tone}`}> {t[0]} {t[1]}</span>}</div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${o.name}: ${o.rows.map((r) => `${r.name} goes with ${r.good ? "better" : "worse"}`).join(", ")}`}>
        <line x1={X(0)} x2={X(0)} y1="0" y2={h - 16} className="lm-zero" />
        {o.rows.map((r, i) => { const y = 12 + i * row; return (
          <g key={r.key} data-row={r.key}>
            <text x="0" y={y + 4} className="lm-name">{r.name}{r.lag ? <tspan className="lm-lag"> {LAG[r.lag]}</tspan> : null}</text>
            <line x1={X(r.lo)} x2={X(r.hi)} y1={y} y2={y} className={`lm-range ${r.good ? "good" : "bad"}`} />
            <circle cx={X(r.eff)} cy={y} r="5" className={`lm-dot ${r.good ? "good" : "bad"}`} />
          </g>); })}
        <text x={X(-m / 2)} y={h - 3} textAnchor="middle" className="lm-lag">worse</text><text x={X(m / 2)} y={h - 3} textAnchor="middle" className="lm-lag">better</text>
      </svg>
    </div>
  );
}
