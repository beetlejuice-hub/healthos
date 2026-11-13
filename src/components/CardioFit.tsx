/**
 * Insights → Training: cardio fitness without typing (PLAN 218; canvas A, "a row per lane"). A row per lane — daily walking,
 * the stairmaster, running — with its heart rate at one step rate this week, how it moved, and 12 weekly dots; a row for
 * the recovery after cardio; resting heart rate and VO2 max on the same weeks. A row opens to why: the first 3 weeks'
 * windows against the last 3, each with its line (or each session's drop, for recovery). Numbers from lib/cardiofit and
 * the Worker (lib/band-client fetchCardio); this file only draws.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "../lib/store";
import { fetchCardio, useBand, type CardioData } from "../lib/band-client";
import { cardioSpans } from "../lib/cardio";
import { FIT, firstWeek, LANE_NAME, LANES, laneLine, laneTrend, laneWindows, recLine, recoveryTrend, weekly, type Lane, type LaneTrend, type RecPoint, type Trend } from "../lib/cardiofit";
import { dayLabel } from "../lib/time";

const WEEK = 7 * 86_400_000;
const COLOR: Record<Lane | "rec", string> = { walk: "var(--ok)", stair: "var(--gym)", run: "var(--kcal)", rec: "var(--sh-g)" };
const r0 = Math.round;
const dm = (t: number) => dayLabel(t).replace(/^\w+ /, "");

/** The card's numbers, fetched once for the page (the four tiles on top use them too). Null while there's no band. */
export type CardioFitData = { from: number; lanes: LaneTrend[]; rec: ReturnType<typeof recoveryTrend>; rhr: { week: number; v: number }[]; vo2: { week: number; v: number }[] };
export function useCardioFit(now: number): CardioFitData | null {
  const band = useBand(), workouts = useStore((s) => s.workouts);
  const connected = !!band.status && band.status !== "off" && band.status.connected;
  const from = firstWeek(now);
  const spans = useMemo(() => cardioSpans(workouts, now).filter((s) => !s.running && s.start >= from), [workouts, now, from]);
  const key = spans.map((s) => `${s.start}-${s.end}`).join(",");
  const [got, setGot] = useState<CardioData | null>(null);
  useEffect(() => {
    if (!connected) return;
    let off = false;
    fetchCardio(from, spans).then((d) => { if (!off) setGot(d); }).catch(() => {});
    return () => { off = true; };
    // asked again when the sessions change or a week turns, not every minute
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, key, from]);
  const lanes = useMemo(() => {
    if (!got) return [];
    const wins = laneWindows(got.pairs, workouts, now);
    return LANES.map((l) => laneTrend(wins, l, now)).filter((t): t is LaneTrend => !!t);
  }, [got, workouts, now]);
  const rec = useMemo(() => recoveryTrend(got ? spans.flatMap((s, i): RecPoint[] => (got.rec[i] ? [{ start: s.start, what: s.what, rec: got.rec[i]! }] : [])) : [], now), [got, spans, now]);
  const rhr = useMemo(() => weekly(band.data?.rhr, now), [band.data, now]);
  const vo2 = useMemo(() => weekly(band.data?.vo2, now), [band.data, now]);
  return useMemo(() => (connected && got ? { from, lanes, rec, rhr, vo2 } : null), [connected, got, from, lanes, rec, rhr, vo2]);
}

export function CardioFit({ fit, w, now }: { fit: CardioFitData | null; w: number; now: number }) {
  const [open, setOpen] = useState<Lane | "rec" | null>(null);
  if (!fit) return null;
  const { from, lanes, rec, rhr, vo2 } = fit;
  const lead = lanes.find((t) => t.lane === "walk" && t.trend) ?? lanes.find((t) => t.trend) ?? lanes[0];
  const cw = Math.max(240, w - 30);
  const toggle = (k: Lane | "rec") => setOpen(open === k ? null : k);
  return (
    <section className="sl-p cf" id="tp-cardiofit" aria-label="Cardio fitness" data-lanes={lanes.map((t) => t.lane).join(" ")}>
      <div className="cf-head"><span className="cmp-k">Cardio fitness</span><span className="sl-note">{FIT.weeks} weeks · from the band's steps</span></div>
      {lead ? <p className="cf-say">{laneLine(lead)}</p>
        : !rec.pts.length && <p className="cf-say">Nothing to compare yet. It needs walks of 10 minutes or more with the band on, or a stairmaster or a run.</p>}
      <div className="cf-rows">
        {lanes.map((t) => (
          <Row key={t.lane} id={t.lane} open={open === t.lane} onClick={() => toggle(t.lane)} name={LANE_NAME[t.lane]} color={COLOR[t.lane]}
            big={r0(t.pts.at(-1)?.v ?? 0)} unit={`bpm at ${t.ref}/min`} spark={t.pts.map((p) => [p.week, p.v])} from={from} trend={t.trend}
            sub={t.trend ? `${r0(t.trend.from)} → ${r0(t.trend.to)} since ${dm(t.pts[0].week)}` : `${t.windows} × 5 min`} chip={chipOf(t.trend, "lower", t.pts.length)}>
            <LaneDetail t={t} w={cw} />
          </Row>
        ))}
        {rec.pts.length > 0 && (
          <Row id="rec" open={open === "rec"} onClick={() => toggle("rec")} name="Recovery after cardio" color={COLOR.rec}
            big={rec.last!.rec.drop} unit="bpm drop in 2 min" spark={rec.pts.map((p) => [p.start, p.rec.drop])} from={from} trend={rec.trend}
            sub={rec.trend ? `${r0(rec.trend.from)} → ${r0(rec.trend.to)} since ${dm(rec.pts[0].start)}` : `${rec.pts.length} session${rec.pts.length === 1 ? "" : "s"}`} chip={chipOf(rec.trend, "higher", rec.pts.length, "sessions")}>
            <RecDetail r={rec} w={cw} from={from} now={now} />
          </Row>
        )}
      </div>
      {(rhr.length > 0 || vo2.length > 0) && (
        <div className="cf-mini">
          {rhr.length > 0 && <div><span>Resting heart rate</span><b>{r0(rhr.at(-1)!.v)} bpm</b><Spark pts={rhr.map((p) => [p.week, p.v])} from={from} color="var(--hr)" w={150} h={26} /></div>}
          {vo2.length > 0 && <div><span>VO2 max (band)</span><b>{vo2.at(-1)!.v.toFixed(1)}</b><Spark pts={vo2.map((p) => [p.week, p.v])} from={from} color="#8fb3f5" w={150} h={26} /></div>}
        </div>
      )}
      <p className="sl-note">Heart rate at the same step rate, from the band's steps and heart rate: lower over the weeks goes with fitter. Nothing typed. Tap a row for how it's worked out.</p>
    </section>
  );
}

function chipOf(t: Trend, good: "lower" | "higher", n: number, what = "weeks"): { text: string; good: boolean } {
  if (!t) return { text: `${n} of ${FIT.minWeeks} ${what}`, good: false };
  const d = r0(t.change), sign = d > 0 ? "+" : d < 0 ? "−" : "±";
  if (t.word === "same") return { text: "about the same", good: false };
  return { text: `${sign}${Math.abs(d)}${good === "lower" ? " bpm" : ""} · ${t.word === good ? "fitter" : t.word}`, good: t.word === good };
}

function Row({ id, open, onClick, name, color, big, unit, sub, chip, spark, from, trend, children }: {
  id: string; open: boolean; onClick: () => void; name: string; color: string; big: number; unit: string; sub: string; chip: { text: string; good: boolean };
  spark: [number, number][]; from: number; trend: Trend; children: ReactNode;
}) {
  return (
    <>
      <button type="button" className="cf-row" data-lane={id} aria-expanded={open} onClick={onClick}>
        <span className="cf-nm"><i style={{ background: color }} />{name}</span>
        <Spark pts={spark} from={from} color={color} line={!!trend} />
        <span className="cf-big">{big}<small>{unit}</small></span>
        <span className="cf-sub">{sub} <span className={`cf-chip${chip.good ? " good" : ""}`}>{chip.text}</span></span>
      </button>
      {open && <div className="cf-detail">{children}</div>}
    </>
  );
}

/** Dots on the 12 weeks (x: time), the last one bigger; a dashed straight line through them when there's a trend. */
function Spark({ pts, from, color, w = 118, h = 40, line = false }: { pts: [number, number][]; from: number; color: string; w?: number; h?: number; line?: boolean }) {
  if (!pts.length) return <svg className="cf-spark" width={w} height={h} aria-hidden="true" />;
  const ys = pts.map((p) => p[1]), lo = Math.min(...ys), hi = Math.max(...ys), pad = (hi - lo) * 0.15 || 1, a = lo - pad, b = hi + pad;
  const span = FIT.weeks * WEEK, X = (t: number) => 4 + Math.min(1, Math.max(0, (t - from) / span)) * (w - 8), Y = (v: number) => h - 4 - ((v - a) / (b - a)) * (h - 8);
  let fit: [number, number, number, number] | null = null;
  if (line && pts.length > 2) {
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = ys.reduce((s, v) => s + v, 0) / ys.length;
    const sl = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / (pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0) || 1), t0 = pts[0][0], t1 = pts.at(-1)![0];
    fit = [X(t0), Y(my + sl * (t0 - mx)), X(t1), Y(my + sl * (t1 - mx))];
  }
  return (
    <svg className="cf-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {fit && <line x1={fit[0]} y1={fit[1]} x2={fit[2]} y2={fit[3]} stroke={color} strokeOpacity=".45" strokeDasharray="3 3" strokeWidth="1.2" />}
      {pts.map(([t, v], i) => <circle key={t} cx={X(t)} cy={Y(v)} r={i === pts.length - 1 ? 3.6 : 2.1} fill={color} fillOpacity={i === pts.length - 1 ? 1 : 0.8} />)}
    </svg>
  );
}

/** Why: the first 3 weeks' windows (grey) against the last 3 (the lane's colour), each with its line; the gap at the step rate. */
function LaneDetail({ t, w }: { t: LaneTrend; w: number }) {
  const where = t.lane === "walk" ? `Outside workouts, ${FIT.walk[0]}–${FIT.walk[1]} steps a minute.` : t.lane === "run" ? `${FIT.run}+ steps a minute outside workouts, or inside a Run.` : "Inside a Stairmaster session; steps a minute stand in for the level.";
  const how = `${where} The first 5 minutes of each bout are left out (the heart is still catching up). Each week is read at ${t.ref} a minute along one shared line, so a faster week isn't taken for a less fit one. Heat, caffeine and a short night push it up.`;
  if (!t.then.length || t.thenAt == null || t.nowAt == null) return <><p className="cf-say">{laneLine(t)}</p><p className="sl-note">{how}</p></>;
  const all = [...t.then, ...t.now], H = 190, x0 = 30, x1 = w - 14, y0 = 10, y1 = H - 22;
  const sx = all.map((p) => p.spm), sy = all.map((p) => p.bpm), xa = Math.floor(Math.min(...sx) / 5) * 5, xb = Math.ceil(Math.max(...sx) / 5) * 5 || xa + 5;
  const ya = Math.floor(Math.min(...sy) / 5) * 5 - 2, yb = Math.ceil(Math.max(...sy) / 5) * 5 + 2;
  const X = (v: number) => x0 + ((v - xa) / (xb - xa || 1)) * (x1 - x0), Y = (v: number) => y1 - ((v - ya) / (yb - ya || 1)) * (y1 - y0);
  const ln = (at: number) => (v: number) => at + t.slope * (v - t.ref), gap = t.thenAt - t.nowAt;
  const step = yb - ya > 30 ? 10 : 5, ticks: number[] = [];
  for (let v = Math.ceil(ya / step) * step; v <= yb; v += step) ticks.push(v);
  const c = COLOR[t.lane];
  return (
    <>
      <span className="sl-note">Each dot is 5 minutes. Grey: {dm(t.then[0].t)} – {dm(t.then.at(-1)!.t)}. Coloured: the last 3 weeks.</span>
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={`Heart rate against steps a minute, the first 3 weeks against the last 3: at ${t.ref} a minute ${Math.abs(r0(gap))} bpm ${gap >= 0 ? "lower" : "higher"} now`}>
        {ticks.map((v) => <g key={v}><line x1={x0} x2={x1} y1={Y(v)} y2={Y(v)} className="he-grid" /><text x={x0 - 5} y={Y(v) + 3} textAnchor="end" className="hp-t">{v}</text></g>)}
        {[xa, (xa + xb) / 2, xb].map((v, i) => <text key={v} x={X(v)} y={H - 6} textAnchor={i === 2 ? "end" : i ? "middle" : "start"} className="hp-t">{r0(v)}</text>)}
        <text x={x1} y={y0} textAnchor="end" className="hp-t">bpm · steps a minute →</text>
        <line x1={X(t.ref)} x2={X(t.ref)} y1={y0} y2={y1} stroke="var(--i-ink-2)" strokeDasharray="2 3" />
        {t.then.map((p) => <circle key={`a${p.t}`} cx={X(p.spm)} cy={Y(p.bpm)} r="2" fill="var(--i-ink-2)" fillOpacity=".45" />)}
        {t.now.map((p) => <circle key={`b${p.t}`} cx={X(p.spm)} cy={Y(p.bpm)} r="2" fill={c} fillOpacity=".75" />)}
        <line x1={X(xa)} y1={Y(ln(t.thenAt)(xa))} x2={X(xb)} y2={Y(ln(t.thenAt)(xb))} stroke="#c4ccce" strokeWidth="1.6" />
        <line x1={X(xa)} y1={Y(ln(t.nowAt)(xa))} x2={X(xb)} y2={Y(ln(t.nowAt)(xb))} stroke={c} strokeWidth="2" />
        <line x1={X(t.ref) + 5} x2={X(t.ref) + 5} y1={Y(t.thenAt)} y2={Y(t.nowAt)} stroke="var(--sh-g)" strokeWidth="2" />
        <text x={X(t.ref) + 9} y={(Y(t.thenAt) + Y(t.nowAt)) / 2 + 3} className="hp-t cf-gap">{gap >= 0 ? "−" : "+"}{Math.abs(r0(gap))} bpm</text>
      </svg>
      <p className="cf-say">{laneLine(t)}</p>
      <p className="sl-note">{how}</p>
    </>
  );
}

function RecDetail({ r, w, from, now }: { r: ReturnType<typeof recoveryTrend>; w: number; from: number; now: number }) {
  const H = 100, x0 = 4, x1 = w - 30, ys = r.pts.map((p) => p.rec.drop), a = Math.floor(Math.min(...ys) / 5) * 5 - 2, b = Math.ceil(Math.max(...ys) / 5) * 5 + 2;
  const X = (t: number) => x0 + ((t - from) / Math.max(1, now - from)) * (x1 - x0), Y = (v: number) => H - 18 - ((v - a) / (b - a || 1)) * (H - 28);
  const ticks = [a + 2, Math.round((a + b) / 2), b - 2];
  return (
    <>
      <span className="sl-note">Each dot is one cardio session: how far your heart rate fell in the 2 minutes after the effort.</span>
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={`Heart-rate drop after each of ${r.pts.length} cardio sessions`}>
        {ticks.map((v) => <g key={v}><line x1={x0} x2={x1} y1={Y(v)} y2={Y(v)} className="he-grid" /><text x={x1 + 4} y={Y(v) + 3} className="hp-t">{v}</text></g>)}
        {r.pts.map((p) => <circle key={p.start} cx={X(p.start)} cy={Y(p.rec.drop)} r="3" fill={COLOR.rec}><title>{`${dayLabel(p.start)} · ${p.what}: ${p.rec.peak} → ${p.rec.then} bpm`}</title></circle>)}
        <text x={x0} y={H - 4} className="hp-t">{dm(from)}</text>
        <text x={x1} y={H - 4} textAnchor="end" className="hp-t">today</text>
      </svg>
      <p className="cf-say">{recLine(r)}</p>
      <p className="sl-note">A faster drop goes with fitter (Cole 1999). The end is where your heart rate came off the effort, not when the session was saved, so a forgotten Stop doesn't change it. Walking on fast afterwards makes the drop smaller.</p>
    </>
  );
}
