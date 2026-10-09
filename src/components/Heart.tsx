/**
 * Insights → Heart (PLAN 55; owner, 9 Oct: "ok do" to "C with A's one-day chart on top"). One day against your usual
 * on top; under it each morning's resting heart rate and HRV and each day's awake average, what goes with the next
 * morning, after coffee / after a workout, and heart rate around a check-in. Numbers from lib/heart, lib/hrusual and
 * lib/sleep (tested with planted effects); this file only draws. Words say what goes with what, never why.
 */

import { useEffect, useMemo, useState, type MouseEvent, type PointerEvent } from "react";
import type { BandData, HrMinute } from "../lib/band";
import { loadBandBefore } from "../lib/band-client";
import type { Check } from "../lib/feelgraph";
import { aroundChecks, awakeByDay, dayNumbers, heartOutcomes, raisedStretches, roll, whyRaised, CHECK_MIN_N, type AroundChecks, type AwakeDay, type Raised, type Why } from "../lib/heart";
import { doingOrder, labelOf, tagOf } from "../lib/feel";
import { act, useStore } from "../lib/store";
import { afterCoffee, afterWorkouts, usualAt, usualByHour, usualReady, workoutWindows } from "../lib/hrusual";
import type { Lanes } from "../lib/insights";
import { clockH, lowestHr, usual as middleHalf, type Evening, type Night } from "../lib/sleep";
import { addDays, atMinute, clock, dayLabel, localDay, DAY, MIN } from "../lib/time";
import type { Entry } from "../lib/types";
import { AfterCards } from "./HeartEffects";
import { GoesWith, type GridCopy } from "./Sleep";
import { useNights } from "./useNights";
import { useWidth } from "./useWidth";

/** Above / below your usual (the warm and cool ends checked for the heat map on the canvas, 8 Oct), and in it. */
const HOT = "#f0806e", COOL = "#7aa3ea", IN = "#c3cdd0";
const SERIES = { rhr: "#ef7d6d", hrv: "#9fd7c7", awake: "#c3cdd0" } as const;
const MARKS = [
  { id: "drinks", name: "drinks", color: "var(--alc)" },
  { id: "caf", name: "caffeine at bed", color: "var(--caf)" },
  { id: "trained", name: "trained", color: "var(--gym)" },
  { id: "latebed", name: "bed after 00:15", color: "#7fadf0" },
] as const;
const HEART_COPY: GridCopy = {
  title: "What goes with the next morning", what: "mornings", minNights: 10, toward: "toward a lower resting heart rate, higher HRV",
  sub: "Each cell: mornings after the thing against mornings without. Filled: clear · faint: likely · empty: not clear yet. Goes with, not proof of cause.",
};

const pad = (n: number) => String(n).padStart(2, "0");
const dur = (min: number) => { const t = Math.round(min); return `${Math.floor(t / 60)} h ${pad(t % 60)}`; };
const sgn = (v: number, d = 1) => { const t = Math.abs(v).toFixed(d); return Number(t) === 0 ? `±${t}` : `${v > 0 ? "+" : "−"}${t}`; };
const f1 = (v: number) => v.toFixed(1);
const diam = (x: number, y: number, r: number) => `M${f1(x)} ${f1(y - r)}l${r} ${r}l${-r} ${r}l${-r} ${-r}Z`;
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
/** The marks under a morning: what the evening before it held (the grid's rows). */
const marksOf = (n: Night, e: Evening): Record<string, boolean> => ({ drinks: e.drinks.length > 0, caf: e.caffeineAtBed >= 30, trained: e.trained, latebed: clockH(n.bed, n.eve) >= 24.25 });

export function HeartPage({ data, band, now, entries, halfLifeMin }: { data: Lanes; band: BandData | null; now: number; entries: Entry[]; halfLifeMin: number }) {
  const [span, setSpan] = useState<30 | 90>(30);
  const today = localDay(now);
  const [picked, setDay] = useState<string | null>(null);
  const day = picked ?? today;
  // The mornings need the span; the day shown needs the two weeks before it for its usual. Each load changes `band`.
  useEffect(() => { if (band) void loadBandBefore(Math.min(now - (span + 2) * DAY, atMinute(day, 0) - 15 * DAY)); }, [band, now, span, day]);
  const workouts = data.workouts;
  const awake = useMemo(() => (band ? awakeByDay(band.hr, band.sleep, workouts) : new Map<string, AwakeDay>()), [band, workouts]);
  const outcomes = useMemo(() => heartOutcomes(awake), [awake]);
  const { ns, evs } = useNights(band, data, entries, halfLifeMin, now, span);
  const after = useMemo(() => {
    if (!band?.hr.length) return null;
    const u = usualByHour(band.hr, workouts, today);
    return { coffee: afterCoffee(data.doses, band.hr, workouts), gym: afterWorkouts(workouts, band.hr, u), usual: usualReady(u) };
  }, [band, data.doses, workouts, today]);
  const checks = useMemo(() => {
    if (!band?.hr.length) return null;
    const from = now - span * DAY;
    return aroundChecks(data.checks.filter((c) => c.at >= from && c.at <= now), band.hr, usualByHour(band.hr, workouts, addDays(today, 1), span + 1), workouts);
  }, [band, data.checks, workouts, now, span, today]);
  // Measured from the first render (useWidth only looks on mount), so the box is there before the band's data is.
  const [ref, w] = useWidth<HTMLDivElement>();
  if (!band) return <div className="hp" ref={ref} hidden />;
  const wide = w >= 980;
  return (
    <div className="hp" data-sec="heart" id="ins-heart" ref={ref}>
      <OneDay band={band} data={data} day={day} today={today} now={now} onDay={(d) => setDay(d === today ? null : d)} w={w} />
      <div className="hp-bar">
        <h2 className="sl-title">Recovery · what moves it</h2>
        <div className="iseg" role="group" aria-label="Days to look back over">
          {([30, 90] as const).map((d) => <button key={d} type="button" aria-pressed={span === d} onClick={() => setSpan(d)}>{d} days</button>)}
        </div>
      </div>
      <div className={`hp-two${wide ? " wide" : ""}`}>
        <Mornings band={band} awake={awake} ns={ns} evs={evs} today={today} span={span} sel={day} onSel={(d) => setDay(d === today ? null : d)} w={wide ? Math.floor((w - 12) * 0.58) : w} />
        <GoesWith ns={ns} evs={evs} wide={false} w={wide ? w - 12 - Math.floor((w - 12) * 0.58) : w} outcomes={outcomes} narrow={outcomes} copy={HEART_COPY} />
      </div>
      {after && <AfterCards coffee={after.coffee} gym={after.gym} usual={after.usual} />}
      {checks && <AroundCheckIns a={checks} span={span} w={w} />}
    </div>
  );
}

/** 5-minute averages of one day's minutes (a minute's reading alone is too jumpy to draw); a band that only reads every 15 minutes gives one per bucket. */
function fiveMin(hr: HrMinute[], t0: number): { t: number; v: number }[] {
  const by = new Map<number, number[]>();
  for (const m of hr) { const k = Math.floor((m[0] - t0) / (5 * MIN)), a = by.get(k); if (a) a.push(m[1]); else by.set(k, [m[1]]); }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ t: t0 + k * 5 * MIN + 2.5 * MIN, v: mean(v) }));
}
/** Join two points unless the band was off between them: 10 minutes, or 2½ times its usual gap when it reads sparsely. */
function joinGap(pts: { t: number }[]): number {
  const gaps = pts.slice(1).map((p, i) => p.t - pts[i].t).sort((a, b) => a - b);
  return Math.max(10 * MIN, 2.5 * (gaps[Math.floor(gaps.length / 2)] ?? 0));
}

function OneDay({ band, data, day, today, now, onDay, w }: { band: BandData; data: Lanes; day: string; today: string; now: number; onDay: (d: string) => void; w: number }) {
  const t0 = atMinute(day, 0), t1 = atMinute(addDays(day, 1), 0), isToday = day === today;
  const first = band.hr.length ? localDay(band.hr[0][0]) : today;
  const workouts = useMemo(() => data.workouts.filter((x) => x.end > t0 && x.start < t1), [data.workouts, t0, t1]);
  const u = useMemo(() => usualByHour(band.hr, data.workouts, day), [band, data.workouts, day]);
  const nums = useMemo(() => dayNumbers(band.hr, band.sleep, data.workouts, u, day), [band, data.workouts, u, day]);
  const mins = useMemo(() => band.hr.filter((m) => m[0] >= t0 && m[0] < t1), [band, t0, t1]);
  const pts = useMemo(() => fiveMin(mins, t0), [mins, t0]);
  const others = (rec: Record<string, number>) => middleHalf(Object.entries(rec).filter(([d]) => d !== day && d >= addDays(day, -30) && d < addDays(day, 30)).map(([, v]) => v));
  const rhr = band.rhr[day], hrv = band.hrv[day], rU = others(band.rhr), hU = others(band.hrv);
  const night = band.sleep.filter((s) => !s.nap && s.end >= t0 && s.end < t1).sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
  const low = night ? lowestHr(band.hr, night.start, night.end) : null;
  const wins = useMemo(() => workoutWindows(workouts, band.hr, u), [workouts, band, u]);
  const raised = useMemo(() => raisedStretches(band.hr, band.sleep, data.workouts, u, t0, Math.min(t1, now)), [band, data.workouts, u, t0, t1, now]);
  const [hov, setHov] = useState<number | null>(null);
  const phone = w < 640, H = phone ? 270 : 340, L = 10, R = 40, top = 44, bot = H - 24;
  const X = (t: number) => L + ((t - t0) / (t1 - t0)) * (w - L - R);
  const vals = pts.map((p) => p.v), lo = Math.min(45, ...vals.map((v) => v - 3)), hi = Math.max(100, ...vals.map((v) => v + 6));
  const Y = (v: number) => top + ((Math.log(hi) - Math.log(Math.max(lo, Math.min(hi, v)))) / (Math.log(hi) - Math.log(lo))) * (bot - top);
  const ticks = [40, 50, 60, 70, 80, 100, 120, 140, 160, 180, 200].filter((v) => v >= lo && v <= hi).filter((v, i, a) => !i || Y(a[i - 1]) - Y(v) >= 16);
  // Your usual, every quarter hour; broken where there isn't one yet.
  const band15: { x: number; lo: number; hi: number; mid: number }[][] = [];
  if (usualReady(u)) {
    let run: { x: number; lo: number; hi: number; mid: number }[] = [];
    for (let t = t0; t <= t1; t += 15 * MIN) { const b = usualAt(u, t); if (b) run.push({ x: X(t), lo: Y(b.lo), hi: Y(b.hi), mid: Y(b.mid) }); else { if (run.length > 1) band15.push(run); run = []; } }
    if (run.length > 1) band15.push(run);
  }
  const state = (p: { t: number; v: number }) => { const b = usualAt(u, p.t); return !b ? "in" : p.v > b.hi ? "hot" : p.v < b.lo ? "cool" : "in"; };
  const seg: Record<string, string> = { hot: "", cool: "", in: "" }, fill: Record<string, string> = { hot: "", cool: "" };
  const cw = X(t0 + 5 * MIN) - X(t0), gap = joinGap(pts);
  pts.forEach((p, i) => {
    const s = state(p), q = pts[i - 1], b = usualAt(u, p.t);
    if (q && p.t - q.t <= gap) seg[s] += `M${f1(X(q.t))} ${f1(Y(q.v))}L${f1(X(p.t))} ${f1(Y(p.v))}`;
    if (b && s === "hot") fill.hot += `M${f1(X(p.t) - cw / 2)} ${f1(Y(p.v))}h${f1(cw)}V${f1(Y(b.hi))}h${f1(-cw)}Z`;
    if (b && s === "cool") fill.cool += `M${f1(X(p.t) - cw / 2)} ${f1(Y(b.lo))}h${f1(cw)}V${f1(Y(p.v))}h${f1(-cw)}Z`;
  });
  const asleep = band.sleep.filter((s) => s.end > t0 && s.start < t1).map((s) => ({ x0: X(Math.max(t0, s.start)), x1: X(Math.min(t1, s.end)), nap: s.nap }));
  const doses = data.doses.filter((d) => d.at >= t0 && d.at < t1 && d.mg > 0), drinks = data.drinks.filter((d) => d.at >= t0 && d.at < t1);
  const checks = data.checks.filter((c): c is Check & { stress: number } => c.at >= t0 && c.at < t1 && c.stress != null);
  const peak = wins.filter((x) => x.peak != null).sort((a, b) => b.peak! - a.peak!)[0];
  const peakPt = peak ? pts.filter((p) => p.t >= peak.start && p.t <= peak.end).sort((a, b) => b.v - a.v)[0] : null;
  const peakName = peak ? data.workouts.find((x) => x.start === peak.start)?.name || "Workout" : "";
  const h = hov != null ? pts[hov] : null, hb = h ? usualAt(u, h.t) : null;
  const move = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), t = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0);
    let best = -1, bd = Infinity; pts.forEach((p, i) => { const d = Math.abs(p.t - t); if (d < bd) { bd = d; best = i; } });
    setHov(best >= 0 && bd <= 20 * MIN ? best : null);
  };
  const prev = addDays(day, -1), next = addDays(day, 1);
  const above = nums.usualAvg != null;
  return (
    <section className="hp-day" aria-label={`Heart rate on ${dayLabel(t0)} against your usual`}>
      <div className="sl-bar">
        <button type="button" className="ibtn" disabled={prev < first} onClick={() => onDay(prev)} aria-label="The day before">‹ {dayLabel(atMinute(prev, 720)).slice(0, -4)}</button>
        <h2 className="sl-title">{isToday ? "Today" : dayLabel(t0).slice(0, 3)} · {dayLabel(t0).slice(isToday ? 0 : 4)}</h2>
        <button type="button" className="ibtn" disabled={isToday} onClick={() => onDay(next)} aria-label="The day after">{isToday ? "" : dayLabel(atMinute(next, 720)).slice(0, -4)} ›</button>
        <span className="hp-hint">against your usual for each time of day · last 2 weeks</span>
      </div>
      <div className="kpis hp-kpis">
        <div className="kpi"><span className="k">Resting</span><span className="v">{rhr != null ? Math.round(rhr) : "—"}<small>bpm</small></span><span className="d">{rU ? `usual ${Math.round(rU.lo)}–${Math.round(rU.hi)}` : "your usual after 5 mornings"}</span></div>
        <div className="kpi"><span className="k">HRV</span><span className="v">{hrv != null ? Math.round(hrv) : "—"}<small>ms</small></span><span className="d">{hU ? `usual ${Math.round(hU.lo)}–${Math.round(hU.hi)}` : "your usual after 5 mornings"}</span></div>
        <div className="kpi"><span className="k">Awake average</span><span className="v">{nums.avg != null ? Math.round(nums.avg) : "—"}<small>bpm</small></span>
          <span className="d">{nums.avg != null && nums.usualAvg != null ? `${sgn(nums.avg - nums.usualAvg)} vs usual${isToday ? " so far" : ""}` : "no usual yet"}{workouts.length ? " · workout left out" : ""}</span></div>
        <div className="kpi"><span className="k">Above your usual</span><span className="v">{above ? dur(nums.above) : "—"}</span>
          <span className="d">{above ? `of ${dur(nums.minutes)} awake · below ${dur(nums.below)}` : "needs 4 days of band data"}</span></div>
      </div>
      <div className="sl-p hp-chart">
        {!pts.length && <p className="hp-none">No heart rate from the band on this day.</p>}
        <svg width={w - 2} height={H} viewBox={`0 0 ${w - 2} ${H}`} role="img" aria-label={`Heart rate through ${dayLabel(t0)}: above your usual band in red, below it in blue; what you did along the top`}>
          {asleep.map((s, i) => <g key={i}><rect x={s.x0} y={top - 6} width={Math.max(0, s.x1 - s.x0)} height={bot - top + 6} className="hp-asleep" />
            {s.x1 - s.x0 > 46 && <text x={s.x0 + 4} y={bot - 6} className="hp-t">{s.nap ? "nap" : "asleep"}</text>}</g>)}
          {ticks.map((v) => <g key={v}><line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} className="he-grid" /><text x={w - R + 6} y={Y(v) + 3} className="hp-t">{v}</text></g>)}
          {[0, 3, 6, 9, 12, 15, 18, 21, 24].filter((hh) => !phone || hh % 6 === 0).map((hh) => <text key={hh} x={X(atMinute(day, hh * 60))} y={H - 6} textAnchor={hh === 0 ? "start" : hh === 24 ? "end" : "middle"} className="hp-t">{pad(hh)}:00</text>)}
          {band15.map((run, i) => <g key={i}>
            <path d={`M${run.map((p) => `${f1(p.x)} ${f1(p.hi)}`).join("L")}L${run.slice().reverse().map((p) => `${f1(p.x)} ${f1(p.lo)}`).join("L")}Z`} className="hp-usual" />
            <path d={`M${run.map((p) => `${f1(p.x)} ${f1(p.mid)}`).join("L")}`} className="hp-mid" />
          </g>)}
          {raised.map((r) => <g key={r.start} data-raised={r.level}><rect x={X(r.start)} y={top - 6} width={Math.max(2, X(r.end) - X(r.start))} height={bot - top + 6} fill={HOT} fillOpacity={r.level === "very" ? 0.13 : 0.07} />
            <text x={(X(r.start) + X(r.end)) / 2} y={bot - 6} textAnchor="middle" className="hp-t" style={{ fill: "#f0a597" }}>+{Math.round(r.excess)}</text></g>)}
          <path d={fill.hot} fill={HOT} fillOpacity=".22" /><path d={fill.cool} fill={COOL} fillOpacity=".22" />
          <path d={seg.in} stroke={IN} strokeWidth="1.6" fill="none" strokeLinejoin="round" />
          <path d={seg.cool} stroke={COOL} strokeWidth="1.8" fill="none" strokeLinejoin="round" />
          <path d={seg.hot} stroke={HOT} strokeWidth="1.8" fill="none" strokeLinejoin="round" />
          {/* What you did, along the top */}
          {workouts.map((x, i) => <g key={i}><rect x={X(Math.max(t0, x.start))} y={20} width={Math.max(3, X(Math.min(t1, x.end)) - X(Math.max(t0, x.start)))} height={7} rx="2" fill="var(--gym)" />
            <text x={X(Math.max(t0, x.start))} y={14} className="hp-ev" style={{ fill: "var(--gym)" }}>{x.name || "Workout"}</text></g>)}
          {doses.map((d, i) => <circle key={i} cx={X(d.at)} cy={24} r={4} fill="var(--caf)" stroke="var(--i-panel)" strokeWidth="1.2"><title>{`${clock(d.at)} · ${Math.round(d.mg)} mg caffeine`}</title></circle>)}
          {drinks.map((d, i) => <path key={i} d={diam(X(d.at), 24, 4.5)} fill="var(--alc)" stroke="var(--i-panel)" strokeWidth="1.2"><title>{`${clock(d.at)} · drink`}</title></path>)}
          {checks.map((c, i) => <g key={i}><rect x={X(c.at) - 7} y={17} width={14} height={14} rx="2" fill="none" stroke="#d55181" /><text x={X(c.at)} y={27.5} textAnchor="middle" className="hp-ev" style={{ fill: "#e88aa9" }}>{c.stress}</text><title>{`${clock(c.at)} · stress ${c.stress}`}</title></g>)}
          {low && night && low.at >= t0 && <g><circle cx={X(low.at)} cy={Y(low.low)} r={3.5} fill={IN} stroke="var(--i-panel)" strokeWidth="1.5" />
            <text x={Math.min(X(low.at) + 7, w - R - 110)} y={Math.min(bot - 4, Y(low.low) + 15)} className="he-mark">lowest {Math.round(low.low)} at {clock(low.at)}</text></g>}
          {peakPt && peak && <g><circle cx={X(peakPt.t)} cy={Y(peakPt.v)} r={3.5} fill={HOT} stroke="var(--i-panel)" strokeWidth="1.5" />
            <PeakLabel x={X(peakPt.t)} y={Math.max(top + 10, Y(peakPt.v) - 6)} lines={[`${peakName} · peak ${Math.round(peak.peak!)}`, ...(peak.backMin != null ? [`back to usual in ${peak.backMin} min`] : [])]} min={L} max={w - R} /></g>}
          {isToday && now < t1 && <g><line x1={X(now)} x2={X(now)} y1={top - 6} y2={bot} className="hp-now" />
            <text x={X(now) > w - R - 70 ? X(now) - 4 : X(now) + 4} y={bot - 6} textAnchor={X(now) > w - R - 70 ? "end" : "start"} className="hp-t" style={{ fill: "var(--i-ink)" }}>now {clock(now)}</text></g>}
          {h && <g pointerEvents="none"><line x1={X(h.t)} x2={X(h.t)} y1={top - 6} y2={bot} className="hp-cross" /><circle cx={X(h.t)} cy={Y(h.v)} r={4} fill={state(h) === "hot" ? HOT : state(h) === "cool" ? COOL : IN} stroke="var(--i-panel)" strokeWidth="1.5" /></g>}
          <rect x={L} y={0} width={w - L - R} height={H} fill="transparent" onPointerMove={move} onPointerLeave={() => setHov(null)} />
        </svg>
        {h && <div className="hp-tip" style={{ left: Math.min(Math.max(8, X(h.t) - 80), w - 180) }}>
          <b>{clock(h.t)} · {Math.round(h.v)} bpm</b>{hb ? <span>usual {Math.round(hb.lo)}–{Math.round(hb.hi)}</span> : <span>no usual yet</span>}</div>}
        <div className="hp-key">
          <span><i style={{ background: HOT }} />above your usual</span><span><i style={{ background: COOL }} />below</span><span><i className="band" />your usual: the middle of the last 2 weeks at that time</span>
          <span><i className="dot" style={{ background: "var(--caf)" }} />coffee</span><span><i className="dia" />drink</span><span><i className="box" />check-in (stress)</span>
          {raised.length > 0 && <span><i className="raised" />raised: 20+ min above your usual</span>}
        </div>
      </div>
      <RaisedList raised={raised} data={data} isToday={isToday} now={now} />
    </section>
  );
}

const WHY_WORDS: Record<Why["kind"], string> = { coffee: "after coffee", drinks: "after drinks", meal: "after a meal", said: "you said", stress: "a stressful check-in" };
/** What explains a stretch, in words: "after coffee 13:40 · you said: outside". */
const whyText = (ws: Why[]) => ws.map((w) => (w.kind === "said" ? `you said: ${w.tags!.map(labelOf).join(", ")}` : w.kind === "stress" ? `stress ${w.level} at ${clock(w.at)}` : `${WHY_WORDS[w.kind]} ${clock(w.at)}`)).join(" · ");

/**
 * The raised stretches of the day, each with what's logged around it — or, when nothing is, asked (owner, 9 Oct: "find out
 * what i was doing by either reading data, or straigh up asking me"). An answer is saved like a check-in's "what I was
 * doing", in the middle of the stretch, so it explains it from then on and counts wherever "doing" counts.
 */
function RaisedList({ raised, data, isToday, now }: { raised: Raised[]; data: Lanes; isToday: boolean; now: number }) {
  const entries = useStore((s) => s.entries);
  const tags = useMemo(() => doingOrder(entries, now).slice(0, 6), [entries, now]);
  const [own, setOwn] = useState<Record<number, string>>({});
  // What's logged, in the shape whyRaised reads.
  const logged = useMemo(() => [
    ...data.doses.map((d) => ({ kind: "drink", at: d.at, caffeineMg: d.mg, alcoholG: 0 })),
    ...data.drinks.map((d) => ({ kind: "drink", at: d.at, caffeineMg: 0, alcoholG: d.g })),
    ...data.meals.map((m) => ({ kind: "food", at: m.at, macros: { kcal: m.kcal } })),
    ...data.checks.map((c) => ({ kind: "feel", at: c.at, doing: c.doing, stress: c.stress })),
  ], [data]);
  const say = (r: Raised, tag: string | null) => { if (tag) act.addEntry({ kind: "feel", at: Math.round((r.start + r.end) / 2), doing: [tag] }); };
  if (!raised.length) return <p className="sl-note hp-raised-none">{isToday ? "No stretch above your usual so far today" : "No stretch above your usual this day"} — raised means 20+ minutes at 5+ bpm over it, training aside.</p>;
  return (
    <div className="sl-p hp-raised" aria-label="Raised stretches">
      <span className="cmp-k">Raised · {raised.length} {raised.length === 1 ? "stretch" : "stretches"}{isToday ? " so far" : ""}</span>
      {raised.map((r) => {
        const why = whyRaised(r, logged);
        return (
          <div key={r.start} className="hp-raised-row" data-level={r.level} data-explained={why.length > 0}>
            <div className="hp-raised-h"><b>{clock(r.start)}–{clock(r.end)}</b><span className="hp-raised-x">+{Math.round(r.excess)} bpm · {r.level}</span><span className="hp-raised-p">peak {Math.round(r.peak)}</span></div>
            {why.length ? <p className="hp-raised-why">{whyText(why)}</p> : <>
              <p className="hp-raised-why q">Nothing logged around it — what were you doing?</p>
              <div className="hn-tags hp-raised-tags">
                {tags.map((t) => <button key={t} type="button" onClick={() => say(r, t)}>{labelOf(t)}</button>)}
                <input aria-label={`What you were doing ${clock(r.start)}–${clock(r.end)}`} placeholder="own word" value={own[r.start] ?? ""} onChange={(e) => setOwn({ ...own, [r.start]: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") { say(r, tagOf(own[r.start] ?? "")); setOwn({ ...own, [r.start]: "" }); } }} />
              </div></>}
          </div>
        );
      })}
      <p className="sl-note">Raised: 20+ minutes at 5+ bpm over your usual for that time (very: 15+), training and the hour after left out. What's logged around it goes with it — it isn't proof of why.</p>
    </div>
  );
}

/** A label beside a point on its right if it fits, else on its left, else pulled in from the edge (12px bold ≈ 6.8px a letter). */
function PeakLabel({ x, y, lines, min, max }: { x: number; y: number; lines: string[]; min: number; max: number }) {
  const est = Math.max(...lines.map((l) => l.length)) * 6.8;
  const [ax, anchor]: [number, "start" | "end"] = x + 8 + est <= max ? [x + 8, "start"] : x - 8 - est >= min ? [x - 8, "end"] : [Math.max(min, max - est), "start"];
  return <text x={ax} y={y} textAnchor={anchor} className="he-mark">{lines.map((l, i) => <tspan key={i} x={ax} dy={i ? 15 : 0}>{l}</tspan>)}</text>;
}

function Mornings({ band, awake, ns, evs, today, span, sel, onSel, w }: { band: BandData; awake: Map<string, AwakeDay>; ns: Night[]; evs: Evening[]; today: string; span: number; sel: string; onSel: (d: string) => void; w: number }) {
  const days = useMemo(() => Array.from({ length: span }, (_, i) => addDays(today, i - span + 1)), [today, span]);
  const marks = useMemo(() => { const m = new Map<string, Record<string, boolean>>(); ns.forEach((n, i) => m.set(n.day, marksOf(n, evs[i]))); return m; }, [ns, evs]);
  const [hov, setHov] = useState<number | null>(null);
  const series = [
    { id: "rhr", name: "Resting heart rate · each morning", unit: "bpm", color: SERIES.rhr, vals: days.map((d) => band.rhr[d] ?? null) },
    { id: "hrv", name: "HRV · each morning", unit: "ms", color: SERIES.hrv, vals: days.map((d) => band.hrv[d] ?? null) },
    // Today's is only part of a day, so it waits until the day's done.
    { id: "awake", name: "Awake average · workouts left out", unit: "bpm", color: SERIES.awake, vals: days.map((d) => (d < today ? awake.get(d)?.avg ?? null : null)) },
  ];
  const phone = w < 640, ch = phone ? 112 : 132, gap = 22, x0 = 8, x1 = w - 2 - 48, cw = (x1 - x0) / span, cx = (k: number) => x0 + (k + 0.5) * cw;
  const r = span > 45 ? 2 : 3, markTop = 3 * (ch + gap) + 6, H = markTop + 4 * 11 + 34;
  const k = hov ?? days.indexOf(sel);
  const colOf = (e: PointerEvent<SVGRectElement> | MouseEvent<SVGRectElement>) => { const b = e.currentTarget.getBoundingClientRect(), i = Math.floor(((e.clientX - b.left) / b.width) * span); return i >= 0 && i < span ? i : null; };
  const move = (e: PointerEvent<SVGRectElement>) => setHov(colOf(e));
  return (
    <section className="sl-p hp-morn" aria-label="Each morning's resting heart rate and HRV, and each day's awake average">
      <svg width={w - 2} height={H} viewBox={`0 0 ${w - 2} ${H}`} role="img" aria-label={`Resting heart rate, HRV and awake average for the last ${span} days, each with its 7-day average and your usual range; under them, what the evening before held`}>
        {days.map((d, i) => { const dow = new Date(atMinute(d, 720)).getDay(); return dow === 0 || dow === 6 ? <rect key={d} x={x0 + i * cw} y={0} width={cw} height={markTop + 44} className="hp-wkend" /> : null; })}
        {k >= 0 && <rect x={x0 + k * cw} y={0} width={cw} height={markTop + 44} className="hp-colsel" />}
        {series.map((s, si) => {
          const y0 = si * (ch + gap) + 18, y1 = y0 + ch - 18, have = s.vals.filter((v): v is number => v != null) as number[];
          if (!have.length) return <g key={s.id}><text x={x0} y={y0 - 6} className="cmp-k">{s.name}</text><text x={x0} y={y0 + 24} className="hp-t">nothing from the band yet</text></g>;
          const lo = Math.min(...have), hi = Math.max(...have), padv = Math.max(1, (hi - lo) * 0.15), a = lo - padv, b = hi + padv;
          const Y = (v: number) => y1 - ((v - a) / (b - a)) * (y1 - y0);
          const mh = middleHalf(s.vals), rl = roll(s.vals);
          let line = "", pen = false; rl.forEach((v, i) => { if (v == null) { pen = false; return; } line += `${pen ? "L" : "M"}${f1(cx(i))} ${f1(Y(v))}`; pen = true; });
          const lastI = s.vals.reduce<number>((m, v, i) => (v != null ? i : m), -1), lastV = s.vals[lastI]!;
          const step = (b - a) > 24 ? 10 : (b - a) > 10 ? 5 : 2, tks: number[] = []; for (let t = Math.ceil(a / step) * step; t <= b; t += step) tks.push(t);
          return <g key={s.id}>
            <text x={x0} y={y0 - 6} className="cmp-k">{s.name}</text>
            {mh && <rect x={x0} y={Y(mh.hi)} width={x1 - x0} height={Math.max(1, Y(mh.lo) - Y(mh.hi))} className="hp-usual" />}
            {tks.filter((t) => Math.abs(Y(t) - Y(lastV)) >= 12).map((t) => <g key={t}><line x1={x0} x2={x1} y1={Y(t)} y2={Y(t)} className="he-grid" /><text x={x1 + 6} y={Y(t) + 3} className="hp-t">{t}</text></g>)}
            <path d={line} stroke={s.color} strokeWidth="2" fill="none" strokeLinejoin="round" />
            {s.vals.map((v, i) => (v == null ? null : <circle key={i} cx={cx(i)} cy={Y(v)} r={i === k ? r + 1.5 : r} fill={s.color} stroke="var(--i-panel)" strokeWidth="1.2" />))}
            <text x={x1 + 6} y={Y(lastV) + 4} className="hp-last" style={{ fill: s.color }}>{Math.round(lastV)} {s.unit}</text>
          </g>;
        })}
        <text x={x0} y={markTop - 4} className="cmp-k">The evening before</text>
        {days.map((d, i) => { const m = marks.get(d); if (!m) return null; return <g key={d}>
          {m.drinks && <path d={diam(cx(i), markTop + 8, 3.5)} fill="var(--alc)" />}
          {m.caf && <circle cx={cx(i)} cy={markTop + 19} r={2.8} fill="var(--caf)" />}
          {m.trained && <rect x={cx(i) - Math.min(3.5, cw / 2 - 0.5)} y={markTop + 27} width={Math.min(7, cw - 1)} height={4} fill="var(--gym)" />}
          {m.latebed && <rect x={cx(i) - Math.min(3, cw / 2 - 0.5)} y={markTop + 35} width={Math.min(6, cw - 1)} height={6} fill="#7fadf0" />}
        </g>; })}
        {days.map((d, i) => { const dow = new Date(atMinute(d, 720)).getDay(), last = i === span - 1, every = span > 45 ? i % 14 === 0 && i < span - 7 : dow === 1 && i < span - 4;
          return last || every ? <text key={d} x={cx(i)} y={H - 8} textAnchor={last ? "end" : "middle"} className="hp-t">{last ? "Today" : dayLabel(atMinute(d, 720)).slice(0, -4)}</text> : null; })}
        <rect x={x0} y={0} width={x1 - x0} height={H} fill="transparent" onPointerMove={move} onPointerLeave={() => setHov(null)} onClick={(e) => { const i = colOf(e); if (i != null) onSel(days[i]); }} style={{ cursor: "pointer" }} />
      </svg>
      <div className="hp-key">
        {MARKS.map((m) => <span key={m.id}><i className={m.id === "drinks" ? "dia" : m.id === "caf" ? "dot" : ""} style={m.id === "drinks" ? undefined : { background: m.color }} />{m.name}</span>)}
      </div>
      <p className="sl-note">{k >= 0 ? <MorningWords d={days[k]} band={band} awake={awake} m={marks.get(days[k])} today={today} /> : null}</p>
      <p className="sl-note">Dots: each morning · line: 7-day average · band: your middle half. Marks sit on the morning after the evening they're from. Tap a day to open it above.</p>
    </section>
  );
}

function MorningWords({ d, band, awake, m, today }: { d: string; band: BandData; awake: Map<string, AwakeDay>; m?: Record<string, boolean>; today: string }) {
  const parts = [band.rhr[d] != null ? `resting ${Math.round(band.rhr[d])}` : null, band.hrv[d] != null ? `HRV ${Math.round(band.hrv[d])}` : null, d < today && awake.get(d) ? `awake ${Math.round(awake.get(d)!.avg)}` : null].filter(Boolean);
  const ev = m ? MARKS.filter((x) => m[x.id]).map((x) => x.name) : [];
  return <><b>{d === today ? "Today" : dayLabel(atMinute(d, 720))}</b> · {parts.length ? parts.join(" · ") : "nothing from the band"}{ev.length ? ` · the evening before: ${ev.join(", ")}` : ""}</>;
}

function AroundCheckIns({ a, span, w }: { a: AroundChecks; span: number; w: number }) {
  const cw = Math.min(w - 34, 560), H = 230, L = 40, R = 10, T = 14, B = 26;
  const SX = (s: number) => L + ((s - 1) / 9) * (cw - L - R), SY = (v: number) => T + (1 - (Math.max(-12, Math.min(15, v)) + 12) / 27) * (H - T - B);
  const mx = a.pts.length ? mean(a.pts.map((p) => p.stress)) : 5, my = a.pts.length ? mean(a.pts.map((p) => p.delta)) : 0;
  const words = a.sure === "too few" || a.slope == null
    ? `Needs ${CHECK_MIN_N} check-ins with a stress rating and the band on in the last ${span} days — ${a.pts.length} so far.`
    : a.sure === "not clear"
      ? `${a.pts.length} check-ins. No clear link: ${sgn(a.slope)} bpm per point of stress, which chance alone could give.`
      : `${a.pts.length} check-ins. Each point of stress you gave goes with ${sgn(a.slope)} bpm against your usual in the hour around it. How sure: ${a.sure}.`;
  return (
    <section className="sl-p hp-st" aria-label="Heart rate around a check-in, by the stress you gave">
      <span className="cmp-k">Around a check-in</span>
      <div className="hp-st-row">
        {a.pts.length > 0 && <svg width={cw} height={H} viewBox={`0 0 ${cw} ${H}`} role="img" aria-label="Each check-in a dot: the stress you gave against heart rate above or below your usual in the hour around it; the average at each level, and the fitted line">
          {[-10, -5, 0, 5, 10, 15].map((v) => <g key={v}><line x1={L} x2={cw - R} y1={SY(v)} y2={SY(v)} className={v === 0 ? "he-zero" : "he-grid"} /><text x={L - 6} y={SY(v) + 3} textAnchor="end" className="hp-t">{v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0"}</text></g>)}
          {[1, 3, 5, 7, 10].map((s) => <text key={s} x={SX(s)} y={H - 8} textAnchor="middle" className="hp-t">{s}</text>)}
          <text x={cw - R} y={H - 8} textAnchor="end" className="hp-t" dy="-12">stress →</text>
          {a.pts.map((p, i) => <circle key={i} cx={SX(p.stress) + (((i * 7) % 5) - 2) * 2.4} cy={SY(p.delta)} r={2.8} fill="#d55181" fillOpacity=".5" />)}
          {a.slope != null && <line x1={SX(1)} x2={SX(10)} y1={SY(my + a.slope * (1 - mx))} y2={SY(my + a.slope * (10 - mx))} stroke="var(--i-ink)" strokeDasharray="5 4" strokeWidth="1.3" />}
          {a.levels.map((l) => <circle key={l.stress} cx={SX(l.stress)} cy={SY(l.mean)} r={4.5} fill="#e88aa9" stroke="var(--i-panel)" strokeWidth="2"><title>{`stress ${l.stress}: ${sgn(l.mean)} bpm on average, ${l.n} check-ins`}</title></circle>)}
        </svg>}
        <div className="hp-st-words">
          <p className="he-words" data-sure={a.sure}>{words}</p>
          <p className="sl-note">Each dot: one check-in — the stress you gave, and your heart rate in the half hour either side against your usual for that time. Compared only with check-ins at about the same time of day, so a stressful afternoon doesn't borrow the afternoon's higher heart rate. Goes with: a stressful hour may also hold coffee or a walk.</p>
        </div>
      </div>
    </section>
  );
}
