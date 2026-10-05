/**
 * Insights → Training & stack, and Your data (approved prototype v2, phase 5b). Hard sets per muscle
 * week by week; each supplement taken day by day; what was logged day by day; how to read the page.
 * Numbers from lib/training (the muscle map's counter), lib/body; this file only draws.
 */

import { useMemo, type ReactNode } from "react";
import { useStore } from "../lib/store";
import type { GlanceDay } from "../lib/glance";
import { coverage } from "../lib/body";
import { MUSCLE_GROUPS, WEEKLY_SETS, muscleWeek } from "../lib/training";
import { doseAt } from "../lib/dose";
import { mean } from "../lib/stats";
import { atMinute, dayLabel, localDay, DAY } from "../lib/time";
import type { EntryOf } from "../lib/types";
import { useWidth } from "./useWidth";

const f1 = (v: number) => v.toFixed(1);
const noon = (d: string) => atMinute(d, 720);
const short = (d: string) => dayLabel(noon(d)).slice(4);

function Panel({ cls, kick, title, ans, meta, foot, children }: { cls: string; kick: string; title: string; ans?: ReactNode; meta?: ReactNode; foot?: ReactNode; children: ReactNode }) {
  return (
    <section className={`gp ${cls}`} aria-label={title}>
      <header className="gp-h"><div><span className="gp-k">{kick}</span><h2>{title}</h2>{ans && <p className="gp-ans">{ans}</p>}</div>{meta && <span className="gp-meta">{meta}</span>}</header>
      {children}
      {foot && <footer className="gp-f">{foot}</footer>}
    </section>
  );
}

/** Monday date labels at least 48 px apart: index → label. */
const mondayLabels = (list: { day: string }[], x: (j: number) => number) =>
  list.reduce((acc, d, j) => (new Date(noon(d.day)).getDay() === 1 && x(j) - acc.last >= 48 ? { last: x(j), m: acc.m.set(j, short(d.day)) } : acc), { last: -1e9, m: new Map<number, string>() }).m;

/** Colour step for a week's hard sets: 0 none, then light → growth range → a lot. */
const setStep = (v: number) => (v <= 0 ? -1 : v < WEEKLY_SETS.low ? 0 : v < WEEKLY_SETS.good ? 1 : v < WEEKLY_SETS.full ? 2 : v < 16 ? 3 : v < WEEKLY_SETS.high ? 4 : 5);
const STEP_LABELS = [`1–${WEEKLY_SETS.low - 1}`, `${WEEKLY_SETS.low}–${WEEKLY_SETS.good - 1}`, `${WEEKLY_SETS.good}–${WEEKLY_SETS.full - 1}`, `${WEEKLY_SETS.full}–15`, `16–${WEEKLY_SETS.high - 1}`, `${WEEKLY_SETS.high}+`];

export function TrainingLoad({ now, period }: { now: number; period: number }) {
  const entries = useStore((s) => s.entries);
  const sets = useMemo(() => entries.filter((e): e is EntryOf<"set"> => e.kind === "set"), [entries]);
  const nW = period <= 7 ? 4 : period <= 30 ? 6 : 12;
  const weeks = useMemo(() => Array.from({ length: nW }, (_, k) => { const end = now - (nW - 1 - k) * 7 * DAY; return { end, load: muscleWeek(sets, end, 1) }; }), [sets, now, nW]);
  const [ref, w] = useWidth<HTMLDivElement>();
  if (!sets.length) return null;
  const L = 82, R = 70, top = 20, ch = 22, gap = 3, cwid = (w - L - R) / nW - gap, H = top + MUSCLE_GROUPS.length * (ch + gap) + 2;
  const labEvery = Math.ceil(46 / (cwid + gap)); // week labels ~46 px wide: on a phone, label every other week, counting back from this one
  const avg = Object.fromEntries(MUSCLE_GROUPS.map((m) => [m, mean(weeks.map((x) => x.load[m]))])) as Record<string, number>;
  const rank = [...MUSCLE_GROUPS].sort((a, b) => avg[b] - avg[a]), inG = rank.filter((m) => avg[m] >= WEEKLY_SETS.good);
  return (
    <Panel cls="gl-load" kick="Training load" title="Hard sets per muscle, week by week"
      ans={inG.length ? <><b>{inG.join(", ")}</b> {inG.length > 1 ? "average" : "averages"} {WEEKLY_SETS.good}+ hard sets a week (the growth range). Least: {rank.slice(-2).map((m) => `${m.toLowerCase()} ${f1(avg[m])}`).join(", ")}.</>
        : <>No muscle averages {WEEKLY_SETS.good}+ hard sets a week yet. Most: <b>{rank.slice(0, 2).map((m) => `${m} ${f1(avg[m])}`).join(", ")}</b>. Least: {rank.slice(-2).map((m) => `${m.toLowerCase()} ${f1(avg[m])}`).join(", ")}.</>}
      meta={`last ${nW} weeks · secondary muscles count half`}
      foot={<><span className="lgd"><i style={{ background: "var(--i-panel-2)" }} />0</span>{STEP_LABELS.map((t, k) => <span key={t} className="lgd"><i style={{ background: `var(--q${k})` }} />{t}</span>)}<span className="gl-dim">sets a week · {WEEKLY_SETS.good}–{WEEKLY_SETS.high} is where most growth happens (Schoenfeld 2017)</span></>}>
      <div ref={ref} className="gl-chart">
        <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label="Hard sets per muscle per week">
          {weeks.map((wk, k) => (nW - 1 - k) % labEvery ? null : <text key={k} x={L + k * (cwid + gap) + cwid / 2} y={12} textAnchor="middle" style={{ fontSize: 9.5 }}>{short(localDay(wk.end - 6 * DAY))}</text>)}
          <text x={w - R + 8} y={12} className="c">avg/wk</text>
          {MUSCLE_GROUPS.map((m, r) => { const y = top + r * (ch + gap); return (
            <g key={m}>
              <text x={L - 6} y={y + ch / 2 + 4} textAnchor="end" className="l">{m}</text>
              {weeks.map((wk, k) => { const v = wk.load[m], st = setStep(v), x = L + k * (cwid + gap); return (
                <g key={k}>
                  <rect x={x} y={y} width={cwid} height={ch} rx="3" fill={st < 0 ? "var(--i-panel-2)" : `var(--q${st})`} data-tip={`${m}, week ending ${dayLabel(wk.end)}\n${v} hard sets${v >= WEEKLY_SETS.good ? " — in the growth range" : v >= WEEKLY_SETS.low ? " — moderate" : v ? " — light" : ""}`} />
                  {v > 0 && cwid >= 18 && <text x={x + cwid / 2} y={y + ch / 2 + 4} textAnchor="middle" className="cell" style={{ fill: `var(--qt${st})` }} pointerEvents="none">{v % 1 ? f1(v) : v}</text>}
                </g>
              ); })}
              <text x={w - R + 8} y={y + ch / 2 + 4} className="v">{f1(avg[m])}</text>
              <rect x={w - R + 38} y={y + ch / 2 - 3} width={Math.min(28, avg[m] * 1.4)} height="6" rx="2" fill={avg[m] >= WEEKLY_SETS.good ? "var(--g-now)" : "var(--i-line-2)"} />
            </g>
          ); })}
        </svg>
      </div>
    </Panel>
  );
}

export function SuppMatrix({ days, period }: { days: GlanceDay[]; period: number }) {
  const supplements = useStore((s) => s.supplements), entries = useStore((s) => s.entries);
  const active = supplements.filter((s) => s.active);
  const list = days.slice(-period);
  const [ref, w] = useWidth<HTMLDivElement>();
  const changes = useMemo(() => new Map(supplements.map((s) => [s.id, new Set((s.doseLog ?? []).filter((x) => x.at > 0).map((x) => localDay(x.at)))])), [supplements]);
  const anyTicks = useMemo(() => entries.some((e) => e.kind === "supp"), [entries]);
  if (!active.length || !anyTicks) return null;
  const L = 130, R = 52, top = 4, rh = 22, gap = 7, cw = (w - L - R) / list.length, H = top + active.length * (rh + gap) + 16;
  const rates = active.map((s) => { const ans = list.filter((d) => d.stackAnswered), took = ans.filter((d) => d.taken?.includes(s.id)); return { s, took: took.length, of: ans.length }; });
  const labs = mondayLabels(list, (j) => L + j * cw);
  const low = rates.filter((r) => r.of >= 5 && r.took / r.of < 0.8);
  return (
    <Panel cls="gl-supps" kick="Supplements" title="Taken, day by day"
      ans={<>{rates.filter((r) => r.of).map((r) => `${r.s.name} ${Math.round((r.took / r.of) * 100)}%`).join(" · ")}.{low.length ? ` Under 80%: ${low.map((r) => r.s.name).join(", ")}.` : ""} Whether each one shows in how you feel is in Connections above.</>}
      meta={`last ${list.length} days · % of days you ticked your stack`}
      foot={<><span className="lgd"><i style={{ background: "var(--supp)" }} />taken</span><span className="lgd"><i style={{ background: "var(--i-line-2)" }} />not taken</span><span className="lgd"><i style={{ background: "var(--i-panel-2)" }} />stack not ticked that day</span><span className="lgd"><i className="ln" style={{ background: "var(--g-now)" }} />dose changed</span></>}>
      <div ref={ref} className="gl-chart">
        <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label="Supplements taken each day">
          {active.map((s, r) => { const y = top + r * (rh + gap), rate = rates[r]; return (
            <g key={s.id}>
              <text x={L - 8} y={y + rh / 2 + 4} textAnchor="end" className="l">{s.name.length > 18 ? s.name.slice(0, 17) + "…" : s.name}</text>
              {list.map((d, j) => { const x = L + j * cw, took = d.taken?.includes(s.id), ans = d.stackAnswered; return (
                <g key={d.day}>
                  <rect x={x + (cw > 4 ? .6 : 0)} y={y} width={Math.max(.8, cw - (cw > 4 ? 1.2 : 0))} height={rh} rx={cw > 6 ? 2 : 0} fill={took ? "var(--supp)" : ans ? "var(--i-line-2)" : "var(--i-panel-2)"} data-tip={`${s.name}, ${dayLabel(noon(d.day))}\n${took ? `Taken · ${doseAt(s, noon(d.day))}` : ans ? "Not taken" : "Stack not ticked"}`} />
                  {changes.get(s.id)?.has(d.day) && <line x1={x} x2={x} y1={y - 3} y2={y + rh + 3} stroke="var(--g-now)" strokeWidth="2" />}
                </g>
              ); })}
              <text x={w - R + 8} y={y + rh / 2 + 4} className="v">{rate.of ? `${Math.round((rate.took / rate.of) * 100)}%` : "–"}</text>
            </g>
          ); })}
          {[...labs].map(([j, t]) => <text key={j} x={L + j * cw} y={H - 2}>{t}</text>)}
        </svg>
      </div>
    </Panel>
  );
}

export function Coverage({ days }: { days: GlanceDay[] }) {
  const list = days.slice(-84), rows = coverage(list);
  const [ref, w] = useWidth<HTMLDivElement>();
  const L = 116, R = 50, top = 4, rh = 14, gap = 5, cw = (w - L - R) / list.length, H = top + rows.length * (rh + gap) + 14;
  const colors: Record<string, string> = { "Check-ins": "var(--mood)", "Sleep rating": "var(--ok)", Food: "var(--kcal)", "Drinks & coffee": "var(--caf)", Weight: "var(--wt)", Supplements: "var(--supp)", Workouts: "var(--gym)" };
  const checkDays = rows[0].days, full = list.filter((d) => d.checkins >= 2).length;
  const labs = mondayLabels(list, (j) => L + j * cw);
  return (
    <Panel cls="gl-cover" kick="Coverage" title="What was logged, day by day"
      ans={<><b>{checkDays}</b> of {list.length} days have a check-in; {full} have 2 or more. Rest days aren't gaps in Workouts. The fuller the rows, the sooner Connections can tell you something.</>}
      meta={`last ${list.length} days`}
      foot={<span className="gl-dim">fainter = partly logged (e.g. 1 of 3 check-ins)</span>}>
      <div ref={ref} className="gl-chart">
        <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label="What was logged each day">
          {rows.map((r, k) => { const y = top + k * (rh + gap); return (
            <g key={r.name}>
              <text x={L - 8} y={y + rh - 3} textAnchor="end" className="l">{r.name}</text>
              {r.fill.map((v, j) => <rect key={j} x={L + j * cw + .5} y={y} width={Math.max(.6, cw - 1)} height={rh} rx="1.5" fill={v > 0 ? colors[r.name] : "var(--i-panel-2)"} opacity={v > 0 ? (.35 + .65 * v).toFixed(2) : 1} />)}
              <text x={w - R + 8} y={y + rh - 3} className="v">{Math.round((r.days / list.length) * 100)}%</text>
            </g>
          ); })}
          {[...labs].map(([j, t]) => <text key={j} x={L + j * cw} y={H - 2}>{t}</text>)}
        </svg>
      </div>
    </Panel>
  );
}

export function Methods() {
  const items: [string, string][] = [
    ["Your usual range", "A usual day: the middle 80% of your own days in the 4 weeks before this week (the shaded bands). A usual week: the middle 80% of your 7-day averages over the 8 weeks before — that's what \"this week\" is judged against. It needs 3 weeks of logging first."],
    ["Typical, higher, lower", "Inside or outside that range. A green dot when the change is good for you, amber when it isn't, grey when it's neither — always with ▲ or ▼ and a word."],
    ["95% range", "Where the true difference most likely sits. If it crosses zero, the link isn't clear yet. Everything here says \"goes with\", never \"causes\"; with many comparisons, a few look clear by chance."],
    ["Nights", "A night belongs to its evening: the sleep rating you give in the morning is the night before's. A check-in before 06:00 counts as the evening before."],
    ["Ring or watch", "Sleep stages, HRV and resting heart rate join the tables and the timeline once one is connected. Your own morning rating stays next to them."],
  ];
  return (
    <section className="gp gl-methods" aria-label="How to read this page">
      <header className="gp-h"><div><span className="gp-k">Methods</span><h2>How to read this page</h2></div></header>
      <dl>{items.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}</dl>
    </section>
  );
}
