/**
 * Today: "A pattern, with today on it" (lib/todaypattern; owner, 28 Oct: "Now the today page feels too empty" · "I liked
 * charts and connecting dots, trying to find patterns in a lot of data points"; picked it on the canvas, then "Today's
 * pattern card"). One of the app's own tested links as a scatter — each dot a day of the last 60, the first thing
 * across, the second up, a dashed line through them — and today: a yellow ring where today is so far, on the line. Tap a
 * dot for its day. ‹ › between up to three; Insights has the rest.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { dailyFacts } from "../lib/insights";
import { withBand } from "../lib/daysband";
import { useBand } from "../lib/band-client";
import { PATTERN, patternCards, todayWords, type PatternCard } from "../lib/todaypattern";
import { addDays, dayLabel, localDay } from "../lib/time";
import { useScout } from "./Scout";

const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-GB") : String(Math.round(v * 10) / 10));

function Scatter({ c }: { c: PatternCard }) {
  const ref = useRef<HTMLDivElement>(null), [w, setW] = useState(320), [hit, setHit] = useState<number | null>(null);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth || 320)); ro.observe(el); return () => ro.disconnect(); }, []);
  useEffect(() => setHit(null), [c.id]);
  const H = 170, L = 34, R = 10, T = 10, B = 22;
  const xs = c.pts.map((p) => p[0]).concat(c.today != null ? [c.today] : []), ys = c.pts.map((p) => p[1]);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (c.yes) { x0 = -0.5; x1 = 1.5; }
  if (x1 - x0 < 1e-9) { x0 -= 1; x1 += 1; }
  const pad = (y1 - y0) * 0.08 || 1; y0 -= pad; y1 += pad;
  // yes/no: two columns, each day nudged sideways a little so a stack of the same answers can be seen
  const jit = (i: number) => (c.yes ? (((i * 37) % 11) - 5) / 30 : 0);
  const X = (v: number) => L + ((v - x0) / (x1 - x0)) * (w - L - R), Y = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const ticks = [y0 + pad, (y0 + y1) / 2, y1 - pad];
  const xt = c.yes ? [[0, "other days"], [1, c.a.yes ?? "yes"]] as [number, string][] : [x0, (x0 + x1) / 2, x1].map((v) => [v, fmt(v)] as [number, string]);
  const near = (px: number, py: number) => {
    let best = -1, d = Infinity;
    c.pts.forEach(([x, y], i) => { const dd = (X(x + jit(i)) - px) ** 2 + (Y(y) - py) ** 2; if (dd < d) { d = dd; best = i; } });
    return d < 30 ** 2 ? best : null;
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(); setHit(near(e.clientX - r.left, e.clientY - r.top)); };
  const label = `${c.title}: ${c.pts.length} days${c.today != null ? `, today at ${fmt(c.today)}` : ""}`;
  return (
    <div ref={ref} className="tp-chart">
      <svg viewBox={`0 0 ${w} ${H}`} width="100%" height={H} role="img" aria-label={label} onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHit(null)}>
        {ticks.map((v) => <g key={v}><line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} stroke="var(--c-track)" /><text x={L - 6} y={Y(v) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--c-dim)">{fmt(v)}</text></g>)}
        {xt.map(([v, t], k) => <text key={k} x={X(v)} y={H - 6} textAnchor={k === 0 && !c.yes ? "start" : k === xt.length - 1 && !c.yes ? "end" : "middle"} fontSize="10.5" fill="var(--c-dim)">{t}</text>)}
        {c.pts.map(([x, y], i) => <circle key={i} cx={X(x + jit(i))} cy={Y(y)} r={hit === i ? 5.5 : 4} fill="var(--mood)" fillOpacity={hit === i ? 1 : 0.7} stroke={hit === i ? "var(--c-ink)" : "none"} />)}
        {c.fit && <line x1={X(c.yes ? 0 : x0)} y1={Y(c.fit.at(c.yes ? 0 : x0))} x2={X(c.yes ? 1 : x1)} y2={Y(c.fit.at(c.yes ? 1 : x1))} stroke="var(--c-ink-2)" strokeWidth="1.5" strokeDasharray="4 4" />}
        {c.today != null && c.onLine != null && <g className="tp-today">
          <line x1={X(c.today)} x2={X(c.today)} y1={T} y2={H - B} stroke="var(--gym)" strokeOpacity=".5" strokeDasharray="3 3" />
          <circle cx={X(c.today)} cy={Y(c.onLine)} r="8" fill="none" stroke="var(--gym)" strokeWidth="2.5" />
          <text x={X(c.today) > w * 0.6 ? X(c.today) - 12 : X(c.today) + 12} y={Math.max(T + 10, Y(c.onLine) - 10)} textAnchor={X(c.today) > w * 0.6 ? "end" : "start"} fontSize="11" fontWeight="700" fill="var(--gym)">today, so far</text>
        </g>}
      </svg>
      <div className="tp-axes"><span>{c.b.name}{c.b.unit ? `, ${c.b.unit}` : ""}{c.lag ? " (next day)" : ""} ↑</span><span>{c.a.name}{c.a.unit && !c.yes ? `, ${c.a.unit}` : ""} →</span></div>
      <p className="tp-hit" aria-live="polite">{hit != null ? `${dayLabel(new Date(`${c.days[hit]}T12:00`).getTime())}: ${c.yes ? (c.pts[hit][0] > 0 ? c.a.yes : "no") : `${fmt(c.pts[hit][0])}${c.a.unit ? ` ${c.a.unit}` : ""}`} → ${c.b.name} ${fmt(c.pts[hit][1])}${c.b.unit ? ` ${c.b.unit}` : ""}${c.lag ? " the next day" : ""}` : `Each dot is a day from the last ${PATTERN.days} — tap one.`}</p>
    </div>
  );
}

export function TodayPattern({ now }: { now: number }) {
  const scouted = useScout();
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), settings = useStore((s) => s.settings), band = useBand().data;
  const today = localDay(now);
  const facts = useMemo(() => withBand(dailyFacts(entries, workouts, settings, addDays(today, -PATTERN.days - 2), today), band, today), [entries, workouts, settings, today, band]);
  const cards = useMemo(() => patternCards(scouted.map((x) => x.p), facts, today), [scouted, facts, today]);
  const [i, setI] = useState(0);
  if (!cards.length) return null;
  const k = i % cards.length, c = cards[k], next = cards.length > 1 ? cards[(k + 1) % cards.length] : null;
  return (
    <section className="card todaypattern" aria-label="A pattern, with today on it" data-id={c.id}>
      <h3>A pattern, with today on it {cards.length > 1 && <span className="tp-step">
        <button type="button" aria-label="The pattern before" onClick={() => setI(k - 1 + cards.length)}>‹</button>{k + 1} of {cards.length}<button type="button" aria-label="The next pattern" onClick={() => setI(k + 1)}>›</button>
      </span>}</h3>
      <b className="tp-title">{c.title}</b>
      <Scatter c={c} />
      <p className="tp-text">{c.text} <i className={`sure ${c.grade === "strong" ? "wd-clear" : "wd-early"}`}>{c.grade === "strong" ? "clear" : "early — could be chance"}</i> <span className="tp-now">{todayWords(c)}</span></p>
      <div className="tp-foot"><a href="#insights/connections" className="linkish">See it on Insights</a>{next && <span>next: {next.title.toLowerCase()}</span>}</div>
    </section>
  );
}
