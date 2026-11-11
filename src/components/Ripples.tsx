/**
 * Ripples (PLAN 208; owner, 11 Nov — G of the Insights canvas). Insights → Findings: pick a night out, a hard session, a
 * short night or late caffeine; every one you've had laid on top of each other from the day before to three days on —
 * each one thin, their average thick, where 8 in 10 fell shaded — for each measure that has the days, against your usual.
 * A headline says the biggest, clear move and when you're back. Numbers from lib/ripple; this file only draws.
 */

import { useMemo, useState } from "react";
import { EVENTS, eventDays, MEASURES, ripple, RIPPLE, RIPPLE_DAYS as DAYS, rippleFmt as fmt, seriesOf, type EventKey, type Ripple, type RippleMeasure } from "../lib/ripple";
import { useDayTable } from "./useDayTable";

// the biggest move in its own measure's terms: against where 8 in 10 fell at day before
const spread = (r: Ripple) => Math.max(0.1, ...r.each.map((e) => Math.abs(e[0] ?? 0)));

function Panel({ r }: { r: Ripple }) {
  const M = MEASURES[r.measure], vals = [...r.lo, ...r.hi, ...r.each.flat()].filter((v): v is number => v != null);
  const span = Math.max(...vals.map(Math.abs), 0.1), X = (i: number) => 34 + i * 60, Y = (v: number) => 80 - (v / span) * 64;
  const pts = (a: (number | null)[]) => a.map((v, i) => (v == null ? null : `${X(i)},${Y(v).toFixed(1)}`)).filter(Boolean).join(" ");
  const band = r.lo.every((v) => v != null) ? `M${r.hi.map((v, i) => `${X(i)},${Y(v!).toFixed(1)}`).join(" L")} L${[...r.lo].reverse().map((v, i) => `${X(r.lo.length - 1 - i)},${Y(v!).toFixed(1)}`).join(" L")} Z` : "";
  const bad = r.peak ? Math.sign(r.peak.v) !== M.better : false;
  return (
    <figure className={`rp-p ${r.clear ? (bad ? "worse" : "better") : "unclear"}`} data-measure={r.measure} data-clear={r.clear}>
      <figcaption><b>{M.name}</b><span>{r.peak && r.clear ? `${fmt(r.measure, r.peak.v)} at ${DAYS[RIPPLE.offsets.indexOf(r.peak.at as never)]}` : "no clear ripple"}</span></figcaption>
      <svg viewBox="0 0 300 170" role="img" aria-label={`${M.name}: ${r.peak && r.clear ? `${fmt(r.measure, r.peak.v)} at ${DAYS[RIPPLE.offsets.indexOf(r.peak.at as never)]}` : "no clear ripple"}, from ${r.n}`}>
        <rect x={X(1) - 24} y={8} width={48} height={146} rx={4} className="rp-ev" />
        <line x1={14} x2={294} y1={80} y2={80} className="rp-zero" />
        {band && <path d={band} className="rp-band" />}
        {r.each.map((e, i) => <polyline key={i} points={pts(e)} className="rp-thin" />)}
        <text x={294} y={75} className="rp-t" textAnchor="end">your usual</text>
        <polyline points={pts(r.mean)} className="rp-mean" />
        {r.mean.map((v, i) => v == null ? null : <circle key={i} cx={X(i)} cy={Y(v)} r={4.5} className="rp-dot"><title>{`${DAYS[i]}: ${fmt(r.measure, v)} against your usual`}</title></circle>)}
        {DAYS.map((d, i) => <text key={d} x={X(i)} y={166} className={`rp-t${i === 1 ? " on" : ""}`} textAnchor="middle">{d}</text>)}
      </svg>
      <small>{r.clear ? (r.backAt != null ? `Back to usual by ${r.backAt === 1 ? "the next day" : `day +${r.backAt}`}.` : "Still off three days on.") : "Within the day-to-day wobble."}</small>
    </figure>
  );
}

export function Ripples({ now }: { now: number }) {
  const { days, band } = useDayTable(now);
  const all = useMemo(() => (Object.keys(EVENTS) as EventKey[]).map((e) => {
    const ev = eventDays(days, e);
    const rs = (Object.keys(MEASURES) as RippleMeasure[]).map((m) => ripple(ev, seriesOf(days, band, m), m)).filter((r): r is Ripple => !!r);
    return { e, n: ev.length, rs };
  }).filter((x) => x.rs.length), [days, band]);
  const [pick, setPick] = useState<EventKey | null>(null);
  if (!all.length) return null;
  const cur = all.find((x) => x.e === pick) ?? all[0], E = EVENTS[cur.e];
  const top = [...cur.rs].filter((r) => r.clear && r.peak).sort((a, b) => Math.abs(b.peak!.v / spread(b)) - Math.abs(a.peak!.v / spread(a)))[0];
  return (
    <section className="p w12 rp" id="ripples" aria-label="Ripples" data-event={cur.e}>
      <h2>Ripples <span>what follows {E.the} — every one of your {E.plural} laid on top of each other, against your usual</span></h2>
      <div className="iseg rp-pick" role="group" aria-label="The event">{all.map((x) => <button key={x.e} type="button" aria-pressed={x.e === cur.e} onClick={() => setPick(x.e)}>{EVENTS[x.e].name} · {x.n}</button>)}</div>
      <p className="rp-say">{top ? `After ${E.the}: ${MEASURES[top.measure].name.toLowerCase()} ${fmt(top.measure, top.peak!.v)} at ${DAYS[RIPPLE.offsets.indexOf(top.peak!.at as never)]}${top.backAt != null ? `, back by ${top.backAt === 1 ? "the next day" : `day +${top.backAt}`}` : ""}.` : `After ${E.the}: nothing moves past the day-to-day wobble yet.`}</p>
      <div className="rp-grid">{cur.rs.map((r) => <Panel key={r.measure} r={r} />)}</div>
      <p className="note-i">Thin lines: each one; thick: their average; shaded: where 8 in 10 fell. Your usual: the middle of the days around each that weren't one or the two days after. Goes with, not causes.</p>
    </section>
  );
}
