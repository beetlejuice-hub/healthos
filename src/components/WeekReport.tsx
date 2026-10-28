/**
 * Your week in training, one scrolling report (owner, 28 Oct: "a weekly overview of strength and cardio and gym
 * performance, mostly graphics of how much i improved or not"; picked "one scrolling report", then "like all, lets build
 * it"). The numbers are lib/weekreport's; this draws them as on the canvas (Week board): the headline, lifts as small
 * multiples with the week's dot and PB, sets per muscle against 10–20, cardio by zone against the week before, VO2 max and
 * resting heart rate, the sessions, and one thing for next week with "Add to {day}" (undo-able). Workout → "Your week"
 * (#workout/week), ‹ › between weeks; on the first day of a new week it's in Today's "For you" too (WeekAsk).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { act, useStore } from "../lib/store";
import { useBand } from "../lib/band-client";
import { maxHrOf } from "../lib/cardio";
import { weekFrom, weekLine, weekParts, weekReport, WEEK, type WeekReport as Report } from "../lib/weekreport";
import { dayLabel, localDay } from "../lib/time";
import { go } from "../lib/nav";
import type { EntryOf } from "../lib/types";

const DAY = 86_400_000;
const r1 = (n: number) => String(Math.round(n * 10) / 10);
const tonnes = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(1)} t` : `${kg} kg`);
const TONE = ["var(--wt)", "var(--ok)", "var(--gym)", "var(--warn)", "var(--hr)"];

/** The report for `back` weeks ago, from the store and the band. */
export function useWeekReport(now: number, back: number): Report {
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), templates = useStore((s) => s.templates), settings = useStore((s) => s.settings);
  const band = useBand().data;
  const sets = useMemo(() => entries.filter((e): e is EntryOf<"set"> => e.kind === "set"), [entries]);
  const maxHr = maxHrOf(settings)?.bpm ?? null, t = Math.floor(now / 60_000) * 60_000; // to the minute: a re-render doesn't recount
  return useMemo(() => weekReport({ sets, workouts, templates, hr: band?.hr ?? [], rhr: band?.rhr ?? {}, vo2: band?.vo2, maxHr }, t, back),
    [sets, workouts, templates, band, maxHr, t, back]);
}
const trained = (r: Report) => r.sessions.length > 0 || r.cardio.min > 0;

/** "Mon 20 – Sun 26 Oct", "Mon 27 Oct – Sun 2 Nov", this week "Mon 26 Oct – today". */
function weekSpan(r: Report): string {
  const a = dayLabel(r.from), b = dayLabel(r.to - DAY / 2);
  if (!r.complete) return `${a} – today`;
  return a.split(" ")[2] === b.split(" ")[2] ? `${a.replace(/ \w+$/, "")} – ${b}` : `${a} – ${b}`;
}
/** "13–19 Oct", "27 Oct – 2 Nov": a week by its Monday. */
const short = (from: number) => {
  const [, d1, m1] = dayLabel(from).split(" "), [, d2, m2] = dayLabel(from + 6.5 * DAY).split(" ");
  return m1 === m2 ? `${d1}–${d2} ${m2}` : `${d1} ${m1} – ${d2} ${m2}`;
};
const ago = (back: number) => (back === 0 ? "this week" : back === 1 ? "last week" : `${back} weeks ago`);

/** A small line of weekly values; gaps where a week has none; this week's dot in yellow, "PB" over it when it's one. */
function Spark({ vals, color, pb, label }: { vals: (number | null)[]; color: string; pb?: boolean; label: string }) {
  const ref = useRef<HTMLDivElement>(null), [w, setW] = useState(140);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth || 140)); ro.observe(el); return () => ro.disconnect(); }, []);
  const h = 52, px = 6, top = 18, bottom = 5;
  const pts = vals.flatMap((v, i) => (v == null ? [] : [[i, v] as [number, number]]));
  let lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1]));
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const X = (i: number) => px + (i / Math.max(1, vals.length - 1)) * (w - 2 * px), Y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (h - top - bottom);
  const last = vals.length - 1, now = vals[last];
  return (
    <div ref={ref} className="wk-spark">
      {pts.length > 0 && <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={label}>
        <polyline points={pts.map(([i, v]) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {pts.filter(([i]) => i !== last).map(([i, v]) => <circle key={i} cx={X(i)} cy={Y(v)} r="2.2" fill={color} />)}
        {now != null && <circle cx={X(last)} cy={Y(now)} r="4.5" fill="var(--gym)" stroke="var(--k-tile-2)" strokeWidth="2" />}
        {now != null && pb && <text x={X(last) + 4} y={Y(now) - 9} textAnchor="end" fontSize="10.5" fontWeight="800" fill="var(--gym)">PB</text>}
      </svg>}
    </div>
  );
}

function Lifts({ r }: { r: Report }) {
  return (
    <section className="tile wk" aria-label="Lifts">
      <span className="k">Lifts · estimated 1-rep max · {WEEK.liftWeeks} weeks</span>
      <div className="wk-lifts">{r.lifts.map((l) => {
        const d = l.best != null && l.prev != null ? Math.round((l.best - l.prev) * 10) / 10 : null;
        return (
          <div key={l.exercise} className="wk-lift" data-pb={l.pb || undefined}>
            <span className="wk-name">{l.exercise}</span>
            {l.best != null
              ? <span className="wk-val"><span>{Math.round(l.best)}<small> kg</small></span><em className={d != null && d > 0 ? "up" : d != null && d < 0 ? "down" : ""}>{d == null ? "first" : d > 0 ? `+${r1(d)} kg` : d < 0 ? `−${r1(-d)} kg` : "same"}</em></span>
              : <span className="wk-val wk-none">not done {r.complete ? "that week" : "yet"}</span>}
            <Spark vals={l.weeks} color={l.pb ? "var(--gym)" : "var(--k-ink-2)"} pb={l.pb} label={`${l.exercise}, best estimated 1-rep max a week: ${l.weeks.map((v) => (v == null ? "none" : r1(v))).join(", ")} kg`} />
          </div>
        );
      })}</div>
      <p className="s">Yellow dot: {r.complete ? "that" : "this"} week's best set as a 1-rep max (Epley). PB: better than any week before.</p>
    </section>
  );
}

function Muscles({ r }: { r: Report }) {
  const max = Math.max(WEEK.setsHi + 2, ...r.muscles.map((m) => m.sets + 1)), pc = (n: number) => `${(n / max) * 100}%`;
  return (
    <section className="tile wk" aria-label="Sets per muscle">
      <span className="k">Sets per muscle · {r.complete ? "that week" : "this week so far"}</span>
      <div className="wk-muscles">{r.muscles.map((m) => {
        const low = r.complete && m.inPlan && m.sets < WEEK.setsLo; // a week still going isn't under yet
        return (
          <div key={m.muscle} className="wk-mrow" data-low={low || undefined}>
            <span>{m.muscle}</span>
            <span className="wk-track"><i className="wk-band" style={{ left: pc(WEEK.setsLo), width: pc(WEEK.setsHi - WEEK.setsLo) }} /><i className="wk-fill" style={{ width: pc(m.sets) }} /></span>
            <b>{m.sets}</b>
          </div>
        );
      })}</div>
      <p className="s">Shaded: {WEEK.setsLo}–{WEEK.setsHi} hard sets a week, where most muscle-growth studies land (Schoenfeld 2017).{r.complete ? " Orange: a muscle your split trains, under it." : ""} A lift's other muscles count half.</p>
    </section>
  );
}

function Cardio({ r, back, now }: { r: Report; back: number; now: number }) {
  const c = r.cardio, top = Math.max(c.min, c.before, 1);
  const bar = (label: string, min: number, zones: number[] | null) => {
    const known = zones ? zones.reduce((a, b) => a + b, 0) : 0;
    return <>
      <span>{label}</span>
      <span className="wk-zwrap"><span className="wk-zbar" style={{ width: `${Math.max(3, (min / top) * 100)}%` }}>
        {zones?.map((m, z) => (m ? <i key={z} style={{ flexGrow: m, background: TONE[z] }} /> : null))}
        {min > known && <i style={{ flexGrow: min - known, background: "var(--k-btn)" }} />}
      </span></span>
      <b>{min} min</b>
    </>;
  };
  const sum = (zs: number[] | null) => (zs ? zs.reduce((a, b) => a + b, 0) : 0);
  const gap = (c.zones || c.zonesBefore) && (c.min > sum(c.zones) || c.before > sum(c.zonesBefore)); // minutes the band has no heart rate for
  const diff = c.min - c.before, z = c.zones, most = z ? z.indexOf(Math.max(...z)) : -1;
  return (
    <section className="tile wk" aria-label="Cardio">
      <span className="k">Cardio · minutes{z || c.zonesBefore ? " by heart-rate zone" : ""}</span>
      <div className="wk-zones">{bar(short(weekFrom(now, back + 1)), c.before, c.zonesBefore)}{bar(back === 0 ? "This week" : short(r.from), c.min, z)}</div>
      {(z || c.zonesBefore) && <div className="wk-legend">{TONE.map((t, i) => <span key={i}><i style={{ background: t }} />Z{i + 1}</span>)}{gap && <span><i style={{ background: "var(--k-btn)" }} />no heart rate</span>}</div>}
      <p className="s">{diff === 0 ? "The same minutes as the week before" : `${diff > 0 ? "+" : "−"}${Math.abs(diff)} minutes on the week before`}{z && most >= 0 ? `; most in zone ${most + 1}` : ""}.{!z && c.min > 0 ? " Zones show when the band has the minutes and Settings has your age or max heart rate." : ""}</p>
    </section>
  );
}

function Fitness({ r }: { r: Report }) {
  const one = (name: string, vals: (number | null)[], color: string, lowerBetter: boolean, unit: string) => {
    const has = vals.filter((v): v is number => v != null);
    if (!has.length) return null;
    const now = vals.at(-1), d = has.length > 1 ? Math.round((has.at(-1)! - has[0]) * 10) / 10 : null, good = d != null && (lowerBetter ? d < 0 : d > 0);
    return (
      <div className="wk-lift">
        <span className="wk-name">{name}</span>
        <span className="wk-val"><span>{now != null ? r1(now) : "–"}{unit && <small> {unit}</small>}</span>{d != null && d !== 0 && <em className={good ? "up" : "down"}>{d > 0 ? "+" : "−"}{r1(Math.abs(d))}</em>}</span>
        <Spark vals={vals} color={color} label={`${name} a week, ${WEEK.fitWeeks} weeks: ${vals.map((v) => v ?? "none").join(", ")}`} />
        <span className="s">{lowerBetter ? "lower is fitter" : "higher is fitter"} · {WEEK.fitWeeks} wks</span>
      </div>
    );
  };
  const v = one("VO2 max", r.vo2, "var(--mood)", false, ""), h = one("Resting HR", r.rhr, "var(--hr)", true, "bpm");
  if (!v && !h) return null;
  return (
    <section className="tile wk" aria-label="Fitness">
      <span className="k">Fitness · {WEEK.fitWeeks} weeks</span>
      <div className="wk-lifts">{v}{h}</div>
    </section>
  );
}

function Sessions({ r }: { r: Report }) {
  return (
    <section className="tile wk" aria-label="Sessions">
      <div className="wk-k"><span className="k">Sessions</span><b>{r.sessions.length}{r.planned ? ` of ${r.planned}` : ""}</b></div>
      {r.sessions.length > 0
        ? <ul className="wk-sess">{r.sessions.map((s) => <li key={s.at}><i>✓</i>{dayLabel(s.at).split(" ")[0]} · {s.name}</li>)}</ul>
        : <p className="s">No lifting sessions {r.complete ? "that week" : "yet this week"}.</p>}
      {r.kg > 0 && <p className="s">Lifted {tonnes(r.kg)} in all{r.usualKg ? `; the 4 weeks before averaged ${tonnes(r.usualKg)}` : ""}.</p>}
    </section>
  );
}

/** "Add to {day}" once for that week: what was done is kept, so the card says so after a reload; Undo puts the sets back. */
type Did = { week: number; did: "added" | "no"; template?: string; exercise?: string; before?: number; sets?: number };
const NEXT_KEY = "healthos.weeknext";
const loadDid = (): Did | null => { try { return JSON.parse(localStorage.getItem(NEXT_KEY) ?? "null"); } catch { return null; } };
const saveDid = (d: Did | null) => { try { if (d) localStorage.setItem(NEXT_KEY, JSON.stringify(d)); else localStorage.removeItem(NEXT_KEY); } catch { /* blocked storage */ } };

function Next({ r }: { r: Report }) {
  const templates = useStore((s) => s.templates);
  const [did, setDid] = useState<Did | null>(loadDid);
  const put = (d: Did | null) => { setDid(d); saveDid(d); };
  const mine = did?.week === r.from ? did : null;
  const setSets = (template: string, exercise: string, sets: number) => {
    const t = templates.find((x) => x.name === template); if (!t) return false;
    act.saveTemplate({ ...t, exercises: t.exercises.map((e) => (e.name === exercise ? { ...e, sets } : e)) });
    return true;
  };
  if (mine?.did === "added") return (
    <section className="tile wk wk-next" aria-label="One thing for next week">
      <span className="k">One thing for next week</span>
      <b>✓ {mine.exercise} is {mine.sets} sets on {mine.template} now.</b>
      <button type="button" className="kbtn sm" onClick={() => { setSets(mine.template!, mine.exercise!, mine.before!); put(null); }}>Undo</button>
    </section>
  );
  if (!r.next || mine?.did === "no") return null;
  const add = r.next.add, t = add && templates.find((x) => x.name === add.template), before = t?.exercises.find((e) => e.name === add!.exercise)?.sets;
  return (
    <section className="tile wk wk-next" aria-label="One thing for next week">
      <span className="k">One thing for next week</span>
      <b>{r.next.text}</b>
      <div className="wk-acts">
        {add && t && before != null
          ? <button type="button" className="kbtn pri" onClick={() => { if (setSets(add.template, add.exercise, add.sets)) put({ week: r.from, did: "added", template: add.template, exercise: add.exercise, before, sets: add.sets }); }}>Add to {add.template}</button>
          : <button type="button" className="kbtn" onClick={() => go("workout")}>Edit day</button>}
        <button type="button" className="kbtn" onClick={() => put({ week: r.from, did: "no" })}>Not now</button>
      </div>
    </section>
  );
}

/** The page: #workout/week. Opens on this week once it has training in it, else on last week. */
export function WeekReport({ now }: { now: number }) {
  const workouts = useStore((s) => s.workouts), entries = useStore((s) => s.entries);
  const here = useWeekReport(now, 0);
  const [back, setBack] = useState(() => (trained(here) ? 0 : 1));
  const r = useWeekReport(now, back);
  // as far back as the first workout or set
  const first = useMemo(() => { let t = now; for (const w of workouts) t = Math.min(t, w.startedAt); for (const e of entries) if (e.kind === "set") t = Math.min(t, e.at); return t; }, [workouts, entries, now]);
  const oldest = Math.max(1, Math.round((weekFrom(now) - weekFrom(first)) / (7 * DAY)));
  const p = weekParts(r), chips = [[p.lifts && p.pbs ? `${p.lifts} · ${p.pbs}` : p.lifts ?? p.pbs, "var(--gym)"], [p.cardio, "var(--ok)"], [p.rhr, "var(--hr)"]].filter(([t]) => t) as [string, string][];
  return (
    <div className="cockpit wkpage">
      <div className="wk-nav">
        <a href="#workout" className="linkish">‹ Workout</a>
        <span className="wk-step">
          <button type="button" className="kbtn sm" aria-label="The week before" disabled={back >= oldest} onClick={() => { setBack(back + 1); scrollTo(0, 0); }}>‹</button>
          <span>{ago(back)}</span>
          <button type="button" className="kbtn sm" aria-label="The week after" disabled={back === 0} onClick={() => { setBack(back - 1); scrollTo(0, 0); }}>›</button>
        </span>
      </div>
      <header className="wk-head">
        <span className="k">Your week · {weekSpan(r)}</span>
        <h1>{r.title}</h1>
        {chips.length > 0 && <div className="wk-chips">{chips.map(([t, c]) => <span key={t}><i style={{ background: c }} />{t}</span>)}</div>}
      </header>
      {!trained(r) && !r.lifts.length
        ? <p className="tile s">{r.complete ? "Nothing logged that week." : "Nothing logged yet this week."} Workouts and cardio you log show here: lifts, sets per muscle, minutes by heart-rate zone.</p>
        : <>
          {back === 1 && <Next r={r} />}
          {r.lifts.length > 0 && <Lifts r={r} />}
          {r.muscles.length > 0 && <Muscles r={r} />}
          {(r.cardio.min > 0 || r.cardio.before > 0) && <Cardio r={r} back={back} now={now} />}
          <Fitness r={r} />
          <Sessions r={r} />
        </>}
    </div>
  );
}

/** On Workout: the week in a line, a tap opens the report. */
export function WeekEntry({ now }: { now: number }) {
  const here = useWeekReport(now, 0), last = useWeekReport(now, 1);
  const r = trained(here) ? here : last;
  if (!trained(r) && !r.lifts.length) return null;
  return (
    <a className="tile wk-entry" href="#workout/week">
      <span className="k">{r.complete ? "Last week" : "This week"} · {weekSpan(r)}</span>
      <b>{r.title}</b>
      <span className="s">{weekLine(r)}</span>
      <span className="wk-go">Your week ›</span>
    </a>
  );
}

/**
 * Today, in "For you": last week's report, on the first day you open the app in a new week (Monday morning, or whenever
 * you're next in) — that day only, and only if last week had training. A read: "Done" puts it away.
 */
const ASK_KEY = "healthos.weekask";
export function WeekAsk({ now }: { now: number }) {
  const r = useWeekReport(now, 1), today = localDay(now);
  const [first] = useState(() => { try { return JSON.parse(localStorage.getItem(ASK_KEY) ?? "null") as { week: number; day: string } | null; } catch { return null; } });
  const day = first?.week === r.from ? first.day : today;
  useEffect(() => { if (first?.week !== r.from && trained(r)) try { localStorage.setItem(ASK_KEY, JSON.stringify({ week: r.from, day: today })); } catch { /* blocked storage */ } }, [first, r, today]);
  if (!trained(r) || day !== today) return null;
  return (
    <section className="card weekask" aria-label="Your week">
      <h3>Your week <span>{weekSpan(r)}</span></h3>
      <b className="weekask-t">{r.title}</b>
      <p>{weekLine(r)}</p>
      <button type="button" className="pill-btn pri" onClick={() => go("workout", "week")}>See it ›</button>
    </section>
  );
}
