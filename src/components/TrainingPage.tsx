/**
 * Insights → Training (PLAN 64; owner, 13 Oct, on the three boards: "I like all of them … looks like all serve a diff
 * thing" → "go"). A · your lifts: this week against your usual weeks, each main lift against its own trend, recent
 * sessions as ±% against those trends, working sets per muscle. B and C follow (what goes with a strong session; what
 * training goes with afterwards). Numbers from lib/liftstrength; this file only draws.
 */

import { useMemo } from "react";
import { useStore } from "../lib/store";
import { mainLifts, sessions, setsPerMuscleWeek, thisWeek, type LiftTrend, type Session } from "../lib/liftstrength";
import { nextTemplate, suggestNext, type LoggedSet } from "../lib/training";
import { clock, dayLabel } from "../lib/time";
import type { EntryOf } from "../lib/types";
import { useWidth } from "./useWidth";

const kg0 = (v: number) => Math.round(v).toLocaleString("en-GB");
const sgn = (v: number, d = 1) => { const t = Math.abs(v).toFixed(d); return Number(t) === 0 ? `±${t}` : `${v > 0 ? "+" : "−"}${t}`; };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function TrainingPage({ now }: { now: number }) {
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), templates = useStore((s) => s.templates);
  const sets = useMemo(() => entries.filter((e): e is EntryOf<"set"> => e.kind === "set") as LoggedSet[], [entries]);
  const ss = useMemo(() => sessions(workouts, sets), [workouts, sets]);
  const lifts = useMemo(() => mainLifts(sets), [sets]);
  const week = useMemo(() => thisWeek(ss, now), [ss, now]);
  const muscles = useMemo(() => setsPerMuscleWeek(sets, now), [sets, now]);
  const feels = useMemo(() => entries.filter((e): e is EntryOf<"feel"> => e.kind === "feel" && (e.energy != null || e.mood != null)), [entries]);
  const [ref, w] = useWidth<HTMLDivElement>();
  const wide = w >= 900;
  if (!ss.length) return null;
  // what's next: the template after the last one done, its first lift as last time said (double progression)
  const next = nextTemplate(templates, workouts), first = next?.exercises[0];
  const lastOf = first ? [...ss].reverse().find((s) => s.sets.some((x) => x.exercise === first.name && !x.warmup)) : undefined;
  const sug = first && lastOf ? suggestNext(lastOf.sets.filter((x) => x.exercise === first.name && !x.warmup), first.reps) : null;
  const tiles: [string, string, string][] = [
    ["Sessions", String(week.sessions), week.usualSessions != null ? `usual ${fmtN(week.usualSessions)} a week` : "this week"],
    ["Working sets", String(week.workingSets), week.usualSets != null ? `usual ${fmtN(week.usualSets)} a week` : "this week"],
    ["Strength", week.pct != null ? `${sgn(week.pct)} %` : "–", week.pct != null ? "against your trend" : "no session this week yet"],
    ["Next", next?.name ?? "–", sug && first ? `${first.name} ${first.sets} × ${sug.reps} at ${sug.kg} kg` : first ? first.name : ""],
  ];
  return (
    <div className="tp" ref={ref} data-sec="training">
      <section className="sl-p tp-week" aria-label="This week">
        <span className="cmp-k">This week · from {dayLabel(week.from)}</span>
        <div className="tp-tiles">{tiles.map(([k, v, sub]) => <div key={k} className="tp-tile" data-k={k}><span className="k">{k}</span><b>{v}</b><small>{sub}</small></div>)}</div>
      </section>
      {lifts.length > 0 && (() => {
        // each card's chart drawn to its own width (a phone card is ~170 px; drawn wider and shrunk, its labels were 7 px)
        const cols = wide ? Math.min(4, lifts.length) : 2, cardW = (w - 12 * (cols - 1)) / cols;
        return <div className="tp-lifts" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {lifts.map((t) => <LiftCard key={t.exercise} t={t} cw={Math.floor(cardW - 30)} />)}
        </div>;
      })()}
      <div className={`tp-row${wide ? " wide" : ""}`}>
        <Recent ss={ss} feels={feels} />
        {muscles.length > 0 && <Muscles rows={muscles} />}
      </div>
    </div>
  );
}
const fmtN = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** One lift: estimated 1-rep max per session, its line, and what the line rose by. */
function LiftCard({ t, cw }: { t: LiftTrend; cw: number }) {
  const last = t.pts[t.pts.length - 1], H = 110, L = 4, R = 26, T = 8, B = 16;
  const vs = t.pts.map((p) => p.e1rm), lo = Math.min(...vs) * 0.985, hi = Math.max(...vs) * 1.015, t0 = t.pts[0].at, t1 = last.at;
  const X = (at: number) => L + ((at - t0) / Math.max(1, t1 - t0)) * (cw - L - R), Y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const weeks = Math.max(1, Math.round(t.days / 7));
  return (
    <section className="sl-p tp-lift" data-lift={t.exercise} aria-label={`${t.exercise}: estimated 1-rep max against its own trend`}>
      <span className="cmp-k">{t.exercise}</span>
      <p className="tp-e1"><b>{kg0(last.e1rm)} kg</b> <small>est. 1-rep max</small></p>
      <p className={`tp-gain ${t.gain >= 0 ? "up" : "down"}`}>{sgn(t.gain)} kg in {weeks} week{weeks > 1 ? "s" : ""}</p>
      <svg width={cw} height={H} viewBox={`0 0 ${cw} ${H}`} role="img" aria-label={`${t.pts.length} sessions of ${t.exercise}, with the line through them`}>
        {[lo / 0.985, hi / 1.015].map((v, i) => <g key={i}><line x1={L} x2={cw - R} y1={Y(v)} y2={Y(v)} className="he-grid" /><text x={cw - R + 4} y={Y(v) + 3} className="hp-t">{kg0(v)}</text></g>)}
        <line x1={X(t0)} x2={X(t1)} y1={Y(t.line(t0))} y2={Y(t.line(t1))} stroke="var(--i-ink-2)" strokeWidth="1.5" strokeDasharray="4 3" />
        {t.pts.map((p, i) => <circle key={p.workoutId} cx={X(p.at)} cy={Y(p.e1rm)} r={i === t.pts.length - 1 ? 4.5 : 3} fill="var(--gym)" fillOpacity={i === t.pts.length - 1 ? 1 : 0.55} stroke="var(--i-panel)" strokeWidth="1"><title>{`${dayLabel(p.at)} · ${p.kg} kg × ${p.reps} → ${kg0(p.e1rm)} kg`}</title></circle>)}
        <text x={L} y={H - 2} className="hp-t">{MON[new Date(t0).getMonth()]}</text>
        <text x={cw - R} y={H - 2} textAnchor="end" className="hp-t">{MON[new Date(t1).getMonth()]}</text>
      </svg>
    </section>
  );
}

/** The last sessions, newest first, each against your trends (±6 % shown). */
function Recent({ ss, feels }: { ss: Session[]; feels: EntryOf<"feel">[] }) {
  const recent = ss.filter((s) => s.pct != null).slice(-8).reverse();
  if (!recent.length) return <section className="sl-p tp-recent"><span className="cmp-k">Recent sessions</span><p className="sl-note">Each lift needs 3 sessions before a session can be measured against your trend.</p></section>;
  // how you felt: the last check-in in the 3 h before, the first in the 3 h after
  const felt = (s: Session) => {
    const end = s.endedAt ?? s.startedAt + 3_600_000, v = (e: EntryOf<"feel">) => e.energy ?? e.mood!;
    const before = feels.filter((e) => e.at <= s.startedAt && e.at > s.startedAt - 3 * 3_600_000).at(-1), after = feels.find((e) => e.at >= end && e.at < end + 3 * 3_600_000);
    return before && after ? ` · felt ${v(before)} → ${v(after)}` : "";
  };
  return (
    <section className="sl-p tp-recent" aria-label="Recent sessions against your trend">
      <span className="cmp-k">Recent sessions</span>
      <p className="sl-note">Strength: each lift's best set against that lift's own line, averaged — so normal progress isn't taken for a good day.</p>
      <div className="tp-sessions">
        {recent.map((s) => { const v = Math.max(-6, Math.min(6, s.pct!)); return (
          <div key={s.id} className="tp-sess" data-id={s.id} data-pct={s.pct!.toFixed(1)}>
            <span className="tp-sname"><b>{dayLabel(s.startedAt)} · {s.template}</b><small>{clock(s.startedAt)} · {kg0(s.volume)} kg lifted{felt(s)}</small></span>
            <span className="tp-bar" aria-hidden="true"><i className={v >= 0 ? "up" : "down"} style={v >= 0 ? { left: "50%", width: `${(v / 6) * 50}%` } : { right: "50%", width: `${(-v / 6) * 50}%` }} /></span>
            <span className="tp-pct">{sgn(s.pct!)} %</span>
          </div>); })}
      </div>
      <p className="sl-note">Bars: ±6 % around your trend · blue stronger, orange weaker than your line.</p>
    </section>
  );
}

/** Working sets per muscle: a usual week (the 4 before this one) against 10–20, and this week so far. */
function Muscles({ rows }: { rows: { muscle: string; usual: number; now: number }[] }) {
  const max = 24, pct = (v: number) => `${(Math.min(v, max) / max) * 100}%`;
  return (
    <section className="sl-p tp-muscles" aria-label="Working sets per muscle, a week">
      <span className="cmp-k">Sets per muscle · a week, last 4 weeks</span>
      <div className="tp-mrows">
        <div className="tp-mrow tp-mscale" aria-hidden="true"><span /><span className="tp-mtrack"><em style={{ left: pct(10) }}>10</em><em style={{ left: pct(20) }}>20</em></span><b /></div>
        {rows.map((r) => (
          <div key={r.muscle} className="tp-mrow" data-muscle={r.muscle} data-usual={r.usual}>
            <span>{r.muscle}</span>
            <span className="tp-mtrack"><i className="band" style={{ left: pct(10), width: `${(10 / max) * 100}%` }} /><i className={`bar${r.usual < 10 ? " dim" : ""}`} style={{ width: pct(r.usual) }} /><i className="tick" style={{ left: pct(r.now) }} title={`this week so far: ${fmtN(r.now)}`} /></span>
            <b>{fmtN(Math.round(r.usual * 10) / 10)}</b>
          </div>
        ))}
      </div>
      <p className="sl-note">Bar: your usual week. White tick: this week so far. Shaded: 10–20 working sets a week, what most programs aim for. Half a set for a muscle that only helps (triceps on bench).</p>
    </section>
  );
}

