/**
 * Insights → Training (PLAN 64; owner, 13 Oct, on the three boards: "I like all of them … looks like all serve a diff
 * thing" → "go"). A · your lifts: this week against your usual weeks, each main lift against its own trend, recent
 * sessions as ±% against those trends, working sets per muscle. B: what goes with a strong session. C (TrainingAfter):
 * what training goes with afterwards. Numbers from lib/liftstrength and lib/sessionfacts; this file only draws.
 */

import { useEffect, useMemo, type ReactElement } from "react";
import { useStore } from "../lib/store";
import { loadBandBefore, useBand } from "../lib/band-client";
import { goesWith, nights, type Factor, type Outcome } from "../lib/sleep";
import { CARBS_G, sessionFacts, sessionFactors, SESSION_OUTCOMES, SHORT_MIN, slopeTest, UNDER_KCAL, type SessionFacts } from "../lib/sessionfacts";
import { GoesWith, type GridCopy } from "./Sleep";
import { mainLifts, muscleStrength, sessions, setsPerMuscleWeek, thisWeek, type LiftTrend, type MuscleStrength, type Session } from "../lib/liftstrength";
import { kgStep, nextTemplate, type LoggedSet } from "../lib/training";
import { historyOf, smartNext } from "../lib/progress";
import { equipOf } from "../lib/exsearch";
import { StrengthCard } from "./StrengthCard";
import { clock, dayLabel } from "../lib/time";
import type { EntryOf } from "../lib/types";
import type { HrMinute } from "../lib/band";
import { useWidth } from "./useWidth";
import { TrainingAfter } from "./TrainingAfter";

const kg0 = (v: number) => Math.round(v).toLocaleString("en-GB");
const sgn = (v: number, d = 1) => { const t = Math.abs(v).toFixed(d); return Number(t) === 0 ? `±${t}` : `${v > 0 ? "+" : "−"}${t}`; };
const NO_HR: HrMinute[] = [];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function TrainingPage({ now }: { now: number }) {
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), templates = useStore((s) => s.templates);
  const sets = useMemo(() => entries.filter((e): e is EntryOf<"set"> => e.kind === "set") as LoggedSet[], [entries]);
  const ss = useMemo(() => sessions(workouts, sets), [workouts, sets]);
  const lifts = useMemo(() => mainLifts(sets), [sets]);
  const week = useMemo(() => thisWeek(ss, now), [ss, now]);
  const muscles = useMemo(() => setsPerMuscleWeek(sets, now), [sets, now]);
  const strength = useMemo(() => muscleStrength(sets, now), [sets, now]);
  const feels = useMemo(() => entries.filter((e): e is EntryOf<"feel"> => e.kind === "feel" && (e.energy != null || e.mood != null)), [entries]);
  const [ref, w] = useWidth<HTMLDivElement>();
  const wide = w >= 900;
  // B needs the band's nights for the 12 weeks (its usual load is a week)
  // asked again whenever the band's data changes: a load already running (another page's) drops this one
  const band = useBand().data;
  useEffect(() => { if (band) void loadBandBefore(now - 90 * 86_400_000); }, [band, now]);
  const ns = useMemo(() => (band ? nights(band.sleep, band.hr, band.rhr, band.hrv) : []), [band]);
  const supplements = useStore((x) => x.supplements);
  const facts = useMemo(() => sessionFacts(ss, entries, ns), [ss, entries, ns]);
  // C: every workout (cardio too) is left out of your usual heart rate, and the hour after it
  const spans = useMemo(() => workouts.flatMap((x) => (x.endedAt ? [{ start: x.startedAt, end: x.endedAt }] : [])), [workouts]);
  if (!ss.length) return null;
  // what's next: the template after the last one done, its first lift as last time said (double progression)
  const next = nextTemplate(templates, workouts), first = next?.exercises[0];
  const lastOf = first ? [...ss].reverse().find((s) => s.sets.some((x) => x.exercise === first.name && !x.warmup)) : undefined;
  const sug = first && lastOf ? smartNext(historyOf(sets, first.name), first.reps, kgStep(first.name, sets.filter((x) => x.exercise === first.name && !x.warmup).map((x) => x.kg), equipOf(first.name) === "dumbbell")) : null;
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
      {/* PLAN 143: one line for overall strength — every lift against itself */}
      <StrengthCard sets={sets} now={now} className="sl-p tp-strength" />
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
      {strength.length > 0 && <MuscleStrengthRows rows={strength} />}
      <StrongSessions ss={ss} facts={facts} supplements={supplements} w={w} wide={wide} />
      <TrainingAfter ss={ss} ns={ns} entries={entries} hr={band?.hr ?? NO_HR} spans={spans} now={now} w={w} wide={wide} band={!!band} />
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
      <p className="sl-note">Bars: ±6 % around your trend · green stronger, red weaker than your line.</p>
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

/** Strength per muscle (PLAN 82): each lift's trend as % a week, averaged over the lifts that mainly work it, with its range. */
const STATE_WORD = { stronger: "a week", dropping: "a week", holding: "holding", unclear: "not clear yet" } as const;
function MuscleStrengthRows({ rows }: { rows: MuscleStrength[] }) {
  const max = 2, at = (v: number) => 50 + (Math.max(-max, Math.min(max, v)) / max) * 50;
  return (
    <section className="sl-p tp-mstr" aria-label="Strength per muscle, last 8 weeks">
      <span className="cmp-k">Strength per muscle · last 8 weeks</span>
      <div className="tp-mrows">
        {rows.map((r) => (
          <div key={r.muscle} className="tp-srow" data-muscle={r.muscle} data-state={r.state}>
            <span>{r.muscle}<small>{r.lifts.map((l) => l.exercise).join(", ")}</small></span>
            <span className="tp-strack" title={`90% range ${sgn(r.lo)} to ${sgn(r.hi)} % a week`}>
              <i className="mid" />
              <i className="range" style={{ left: `${at(r.lo)}%`, width: `${at(r.hi) - at(r.lo)}%` }} />
              <i className="bar" style={{ left: `${Math.min(50, at(r.perWeek))}%`, width: `${Math.abs(at(r.perWeek) - 50)}%` }} />
            </span>
            <b>{sgn(r.perWeek)} %<small>{STATE_WORD[r.state]}</small></b>
          </div>
        ))}
      </div>
      <p className="sl-note">Each lift's trend as % a week of its own level, averaged over the lifts that mainly work the muscle — more sessions count more; what only helps (triceps on bench) is left out. The thin line is the 90% range: green when it's all above zero, red when all below, holding when it's all within ±0.25 %, otherwise not clear yet — a few more sessions will tell. On a cut, holding is a good result.</p>
    </section>
  );
}

/* ------------------------------------------------------------------ B · what goes with a strong session */

const B_COPY: GridCopy = {
  title: "What goes with a strong session", what: "sessions", toward: "toward stronger, or feeling better after", minNights: 10,
  sub: "Each cell: sessions with the thing against sessions without. Filled: clear · faint: likely · empty: not clear yet. Goes with, not proof of cause.",
};

function StrongSessions({ ss, facts, supplements, w, wide }: { ss: Session[]; facts: SessionFacts[]; supplements: { id: string; name: string }[]; w: number; wide: boolean }) {
  const factors = useMemo(() => sessionFactors(supplements, facts), [supplements, facts]);
  const cells = useMemo(() => goesWith<Session, SessionFacts>(ss, facts, { factors, outcomes: SESSION_OUTCOMES }), [ss, facts, factors]);
  const measured = ss.filter((s) => s.pct != null).length;
  const found = cells.filter((c) => c.outcome === "pct" && (c.sure === "clear" || c.sure === "likely")).sort((a, b) => a.p! - b.p!);
  const nameOf = (id: string) => factors.find((f) => f.id === id)!.name.toLowerCase();
  const words = measured < B_COPY.minNights ? `Needs ${B_COPY.minNights} sessions measured against your trend — ${measured} so far. Each lift needs 3 sessions before its sessions count.`
    : found.length ? `Your strength against your trend has gone with ${found.map((c) => `${nameOf(c.factor)} (${c.diff! >= 0 ? "+" : "−"}${Math.abs(c.diff!).toFixed(1)} %, ${c.sure})`).join(" and ")}.`
      : "Nothing goes clearly with your strength yet.";
  // carbs as a number, not only yes / no
  const pts = useMemo(() => ss.flatMap((s, i) => (facts[i].carbs4h != null && s.pct != null ? [[facts[i].carbs4h!, s.pct] as [number, number]] : [])), [ss, facts]);
  const sl = useMemo(() => slopeTest(pts), [pts]);
  // the grid component is the Sleep page's (same shuffle, same look); its row and column types are generic in lib/sleep
  const G = GoesWith as unknown as (p: { ns: Session[]; evs: SessionFacts[]; wide: boolean; w: number; outcomes: Outcome<Session, SessionFacts>[]; factors: Factor<Session, SessionFacts>[]; narrow: Outcome<Session, SessionFacts>[]; copy: GridCopy }) => ReactElement;
  return (
    <div className="tp-b" data-sec="training">
      <section className="sl-p tp-bwords" aria-label="Your strong sessions">
        <span className="cmp-k">Your strong sessions · {measured} sessions</span>
        <p className="mp-big" data-found={found.map((c) => c.factor).join(",")}>{words}</p>
      </section>
      {measured >= 2 && <SessionLanes ss={ss} facts={facts} supps={factors.filter((f) => f.id.startsWith("supp:")).map((f) => ({ id: f.id.slice(5), name: f.name.replace(/ that day$/, "") }))} w={w} />}
      <div className={`tp-row${wide ? " wide" : ""}`}>
        <G ns={ss} evs={facts} wide={false} w={wide ? Math.floor(w * 0.58) : w} outcomes={SESSION_OUTCOMES} factors={factors} narrow={SESSION_OUTCOMES} copy={B_COPY} />
        {pts.length >= 10 && <CarbsScatter pts={pts} sl={sl} w={wide ? Math.floor(w * 0.4) : w} />}
      </div>
    </div>
  );
}

function CarbsScatter({ pts, sl, w }: { pts: [number, number][]; sl: ReturnType<typeof slopeTest>; w: number }) {
  const cw = w - 30, H = 200, L = 34, R = 10, T = 10, B = 26;
  const xmax = Math.max(120, Math.ceil(Math.max(...pts.map((p) => p[0])) / 20) * 20), ylim = Math.max(6, Math.ceil(Math.max(...pts.map((p) => Math.abs(p[1])))));
  const X = (g: number) => L + (g / xmax) * (cw - L - R), Y = (v: number) => T + (1 - (v + ylim) / (2 * ylim)) * (H - T - B);
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const per10 = sl.slope != null ? sl.slope * 10 : null;
  const words = sl.sure === "too few" ? "" : sl.sure === "not clear" ? `No clear line yet: ${per10! >= 0 ? "+" : "−"}${Math.abs(per10!).toFixed(1)} % per 10 g, which chance alone could give.`
    : `Strength goes with ${per10! >= 0 ? "+" : "−"}${Math.abs(per10!).toFixed(1)} % per 10 g of carbs in the 4 h before · ${sl.sure}.`;
  return (
    <section className="sl-p tp-carbs" aria-label="Carbs in the 4 hours before against strength">
      <span className="cmp-k">Carbs in the 4 h before → strength</span>
      <svg width={cw} height={H} viewBox={`0 0 ${cw} ${H}`} role="img" aria-label={`Each session a dot: grams of carbs in the 4 hours before, and strength against your trend`}>
        {[-ylim, 0, ylim].map((v) => <g key={v}><line x1={L} x2={cw - R} y1={Y(v)} y2={Y(v)} className="he-grid" /><text x={L - 5} y={Y(v) + 3} textAnchor="end" className="hp-t">{v > 0 ? "+" : ""}{v} %</text></g>)}
        {[0, xmax / 2, xmax].map((g) => <text key={g} x={X(g)} y={H - 8} textAnchor={g === 0 ? "start" : g === xmax ? "end" : "middle"} className="hp-t">{g} g</text>)}
        {pts.map((p, i) => <circle key={i} cx={X(p[0])} cy={Y(Math.max(-ylim, Math.min(ylim, p[1])))} r={3.4} fill="var(--carb)" fillOpacity=".8" stroke="var(--i-panel)" strokeWidth="1"><title>{`${Math.round(p[0])} g carbs · ${p[1] >= 0 ? "+" : ""}${p[1].toFixed(1)} %`}</title></circle>)}
        {sl.slope != null && <line x1={X(0)} x2={X(xmax)} y1={Y(my + sl.slope * (0 - mx))} y2={Y(my + sl.slope * (xmax - mx))} stroke="var(--i-ink)" strokeDasharray="5 4" strokeWidth="1.3" />}
      </svg>
      {words && <p className="he-words" data-sure={sl.sure}>{words}</p>}
    </section>
  );
}

/**
 * Every session against your trend, and what came before it — the lanes share the dates (board B). Highlighted: what
 * the grid's rows test (under 6 h 30, 60 g+ carbs, 400+ kcal under your usual), so the eye sees what the grid says.
 */
function SessionLanes({ ss, facts, supps, w }: { ss: Session[]; facts: SessionFacts[]; supps: { id: string; name: string }[]; w: number }) {
  const rows = ss.map((s, i) => ({ s, f: facts[i] })).filter((r) => r.s.pct != null);
  const phone = w < 600, cw = w - 30, x0 = phone ? 74 : 150, x1 = cw - 8, t0 = rows[0].s.startedAt, t1 = rows[rows.length - 1].s.startedAt;
  const X = (t: number) => x0 + ((t - t0) / Math.max(1, t1 - t0)) * (x1 - x0), bw = Math.max(2, Math.min(8, ((x1 - x0) / rows.length) * 0.6));
  const top = 8, sH = 96, mid = top + sH / 2, lane = phone ? 26 : 32, lanes: [string, string][] = [["Sleep", "h, the night before"], ["Carbs", "g, 4 h before"], ["Food", "3 days vs usual"], ["Coffee", "2 h before"], ...supps.map((x) => [x.name, "that day"] as [string, string])];
  const ly = (k: number) => top + sH + 14 + k * lane, H = ly(lanes.length) + 18;
  const months: [number, string][] = [];
  for (let d = new Date(t0); d.getTime() <= t1; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) { const m = new Date(d.getFullYear(), d.getMonth(), 1).getTime(); if (m >= t0) months.push([m, MON[d.getMonth()]]); }
  const bar = (k: number, frac: number, hot: boolean, key: string) => { const y1 = ly(k) + lane - 6, h = Math.max(1.5, Math.min(1, frac) * (lane - 8)); return <rect key={key} x={0} y={y1 - h} width={bw} height={h} rx="1" className={hot ? "hot" : "dim"} />; };
  return (
    <section className="sl-p tp-lanes" aria-label="Every session against your trend, and what came before it">
      <span className="cmp-k">Every session against your trend, and what came before it</span>
      <svg width={cw} height={H} viewBox={`0 0 ${cw} ${H}`} role="img" aria-label={`${rows.length} sessions: strength against your trend, with sleep, carbs, food, coffee and supplements before each`}>
        <line x1={x0} x2={x1} y1={mid} y2={mid} className="he-grid" />
        <text x={x0 - 8} y={top + 10} textAnchor="end" className="hp-t">+6 %</text><text x={x0 - 8} y={top + sH} textAnchor="end" className="hp-t">−6 %</text>
        <text x={4} y={mid + 4} className="tp-lname">Strength</text>
        {lanes.map(([n, u], k) => <g key={n}><text x={4} y={ly(k) + 12} className="tp-lname">{n}</text>{!phone && <text x={4} y={ly(k) + 23} className="hp-t">{u}</text>}<line x1={x0} x2={x1} y1={ly(k) + lane - 6} y2={ly(k) + lane - 6} className="he-grid" /></g>)}
        {rows.map(({ s, f }) => {
          const x = X(s.startedAt) - bw / 2, v = Math.max(-6, Math.min(6, s.pct!)), h = (Math.abs(v) / 6) * (sH / 2);
          const sk = (k: number) => `${s.id}-${k}`;
          return (
            <g key={s.id} transform={`translate(${x} 0)`} data-session={s.id} data-pct={s.pct!.toFixed(1)} data-hot={[f.asleep != null && f.asleep < SHORT_MIN && "short", f.carbs4h != null && f.carbs4h >= CARBS_G && "carbs", f.under3 != null && f.under3 >= UNDER_KCAL && "under"].filter(Boolean).join(",")}>
              <rect x={0} y={v >= 0 ? mid - h : mid} width={bw} height={Math.max(1, h)} rx="1" className={v >= 0 ? "up" : "down"}><title>{`${dayLabel(s.startedAt)} · ${s.template} · ${sgn(s.pct!)} %`}</title></rect>
              {f.asleep != null && bar(0, (f.asleep / 60 - 5) / 4, f.asleep < SHORT_MIN, sk(0))}
              {f.carbs4h != null && bar(1, f.carbs4h / 150, f.carbs4h >= CARBS_G, sk(1))}
              {f.under3 != null && (() => { const y0 = ly(2) + lane / 2 - 3, d = Math.max(-800, Math.min(800, -f.under3)) / 800 * ((lane - 8) / 2); return <rect key={sk(2)} x={0} y={d >= 0 ? y0 - d : y0} width={bw} height={Math.max(1.5, Math.abs(d))} rx="1" className={f.under3 >= UNDER_KCAL ? "hot" : "dim"} />; })()}
              {f.coffee && <circle key={sk(3)} cx={bw / 2} cy={ly(3) + lane / 2 - 3} r={2.6} className="dim-fill" />}
              {supps.map((x, j) => (f.supps[x.id] == null ? null : <circle key={sk(4 + j)} cx={bw / 2} cy={ly(4 + j) + lane / 2 - 3} r={2.6} className={f.supps[x.id] ? "dim-fill" : "hollow"} />))}
            </g>);
        })}
        {months.map(([t, m]) => <text key={t} x={X(t)} y={H - 4} className="hp-t">{m}</text>)}
      </svg>
      <p className="sl-note">Top: each session against your trend, green above it, red below. Under it, what came before; in white: under 6 h 30 asleep, {CARBS_G} g+ carbs, eating {UNDER_KCAL}+ kcal a day under your usual. Supplements: filled taken, hollow skipped, nothing when not answered.</p>
    </section>
  );
}
