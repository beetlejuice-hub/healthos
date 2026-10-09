/**
 * Insights → Heart, the after-coffee / after-a-workout card (canvas C, owner's pick 8 Oct; part of the Heart page,
 * components/Heart.tsx, since 9 Oct). Every coffee lined up at zero against the same hours on coffee-free days;
 * every workout's way back down. Numbers from lib/hrusual (tested with planted effects); words say "goes with".
 */

import { useEffect, useState } from "react";
import { COFFEE_MIN_N, type AfterCoffee, type AfterWorkouts } from "../lib/hrusual";
import { useWidth } from "./useWidth";

type Pt = [number, number];
const sgn = (v: number, d = 1) => { const t = Math.abs(v).toFixed(d); return Number(t) === 0 ? `±${t}` : `${v > 0 ? "+" : "−"}${t}`; };
const path = (pts: Pt[], X: (m: number) => number, Y: (v: number) => number) => pts.map(([m, v], i) => `${i ? "L" : "M"}${X(m).toFixed(1)} ${Y(v).toFixed(1)}`).join("");

/** One small chart: thin lines, their average, zero, an optional strip and a marked point. */
export function Aligned({ width, height, x, y, each, avg, color, strip, mark, xTicks, yTicks, label }: {
  width: number; height: number; x: [number, number]; y: [number, number]; each: Pt[][]; avg: Pt[]; color: string;
  strip?: number; mark?: { m: number; text: string } | null; xTicks: [number, string][]; yTicks: number[]; label: string;
}) {
  const L = 34, R = 8, T = 10, B = 22;
  const X = (m: number) => L + ((m - x[0]) / (x[1] - x[0])) * (width - L - R);
  const Y = (v: number) => T + (1 - (Math.max(y[0], Math.min(y[1], v)) - y[0]) / (y[1] - y[0])) * (height - T - B);
  const at = mark ? avg.reduce((a, b) => (Math.abs(b[0] - mark.m) < Math.abs(a[0] - mark.m) ? b : a), avg[0]) : null;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="he-svg">
      {strip ? <rect x={L} y={Y(strip)} width={width - L - R} height={Math.max(1, Y(-strip) - Y(strip))} className="he-strip" /> : null}
      {yTicks.map((v) => <g key={v}><line x1={L} x2={width - R} y1={Y(v)} y2={Y(v)} className={v === 0 ? "he-zero" : "he-grid"} /><text x={L - 6} y={Y(v) + 3} textAnchor="end" className="he-t">{v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0"}</text></g>)}
      {xTicks.map(([m, t], i) => <text key={m} x={X(m)} y={height - 6} textAnchor={i === xTicks.length - 1 ? "end" : i === 0 && m !== 0 ? "start" : "middle"} className="he-t" style={m === 0 ? { fill: color } : undefined}>{t}</text>)}
      <line x1={X(0)} x2={X(0)} y1={T - 4} y2={height - B + 2} style={{ stroke: color }} strokeWidth="1.5" />
      {each.map((e, i) => <path key={i} d={path(e, X, Y)} fill="none" style={{ stroke: color }} strokeOpacity=".28" strokeWidth="1" />)}
      {avg.length > 1 && <path d={path(avg, X, Y)} fill="none" style={{ stroke: color }} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
      {at && mark && <>
        <circle cx={X(at[0])} cy={Y(at[1])} r="4.5" style={{ fill: color }} stroke="var(--i-panel)" strokeWidth="2" />
        <text x={Math.min(X(at[0]) + 9, width - R - 4)} y={Math.max(T + 10, Y(at[1]) - 9)} textAnchor={X(at[0]) + 120 > width ? "end" : "start"} className="he-mark">{mark.text}</text>
      </>}
    </svg>
  );
}

function coffeeWords(a: AfterCoffee): string {
  if (a.n === 0) return "No coffee to measure yet: it needs the band on for the half hour before and the 90 minutes after, and a few coffee-free days to compare with.";
  const head = `${a.n} ${a.n === 1 ? "coffee" : "coffees"} over ${a.days} ${a.days === 1 ? "day" : "days"}`;
  if (a.sure === "too few" || a.effect == null) return `${head} — about ${COFFEE_MIN_N} are needed before this says anything. Still checking.`;
  if (a.sure === "not clear") return `${head}. No clear change after coffee: ${sgn(a.effect)} bpm 30–90 min after, which chance alone could give (±${(2 * (a.se ?? 0)).toFixed(1)}).`;
  return `${head}. Coffee goes with ${sgn(a.effect)} bpm 30–90 min after, against the same hours on days without. How sure: ${a.sure}.`;
}

function workoutWords(a: AfterWorkouts, haveUsual: boolean): string {
  if (a.n === 0) return "Log a workout with the band on, and this shows how fast your heart rate comes back down after it.";
  const head = `${a.n} ${a.n === 1 ? "workout" : "workouts"}`;
  if (a.backMin == null) return `${head}. Not back to ${haveUsual ? "your usual" : "where you started"} within 2 hours yet.`;
  return `${head}. Back to ${haveUsual ? "your usual" : "where you started"} in ${a.backMin} min${a.backN > 1 ? " on average" : ""}.`;
}

/** Mounted only once there's data, so its width is measured from the start (the charts draw to it). */
export function AfterCards({ coffee, gym, usual }: { coffee: AfterCoffee; gym: AfterWorkouts; usual: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  // Full screen, like the timeline (owner, 8 Oct: "view it in big … other charts too").
  const [big, setBig] = useState(false);
  const [vh, setVh] = useState(() => (typeof window === "undefined" ? 800 : window.innerHeight));
  useEffect(() => {
    if (!big) return;
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setBig(false); };
    const size = () => setVh(window.innerHeight);
    size(); window.addEventListener("keydown", key); window.addEventListener("resize", size);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", key); window.removeEventListener("resize", size); };
  }, [big]);
  const chartH = (small: number) => (big ? Math.max(small, Math.round(vh * (w >= 680 ? 0.55 : 0.36))) : small);
  // The card's width less its padding: the columns are drawn to what's inside it.
  const iw = w - 32, two = iw >= 650, cw = two ? Math.floor((iw - 24) * 0.62) : iw, gw = two ? iw - 24 - cw : iw;
  const c = coffee, g = gym;
  const cHi = Math.max(8, Math.ceil(Math.max(0, ...c.curve.map((p) => p[1]), ...c.each.flat().map((p) => p[1])) / 4) * 4);
  const cLo = Math.min(-4, Math.floor(Math.min(0, ...c.each.flat().map((p) => p[1])) / 4) * 4);
  const gHi = Math.max(20, Math.ceil(Math.max(0, ...g.each.flat().map((p) => p[1])) / 20) * 20);
  const peak = c.effect != null && c.peakMin != null && c.sure !== "too few" ? { m: c.peakMin, text: `${sgn(c.curve.find((p) => p[0] === c.peakMin)?.[1] ?? 0, 0)} bpm at ${c.peakMin} min` } : null;
  return (
      <div className={`he-card${big ? " big" : ""}`} ref={ref} aria-label="Heart rate after coffee and after workouts">
        <button type="button" className="ibtn he-big" aria-pressed={big} onClick={() => setBig(!big)}>{big ? "✕ Close" : "⤢ Full screen"}</button>
        <div className={`he-row${two ? " two" : ""}`} style={{ gridTemplateColumns: two ? `${cw}px ${gw}px` : "1fr" }}>
          <div className="he-col">
            <h3>After coffee <span>bpm vs coffee-free days, same hours</span></h3>
            {c.n > 0 && <Aligned width={cw} height={chartH(two ? 240 : 200)} x={[-30, 180]} y={[cLo, cHi]} each={c.each} avg={c.curve} color="var(--caf)" strip={c.wobble || undefined}
              mark={peak} xTicks={[[-30, "−30"], [0, "coffee"], [60, "60"], [120, "120"], [180, "180 min"]]} yTicks={[cLo, 0, Math.round(cHi / 2), cHi].filter((v, i, a) => a.indexOf(v) === i)}
              label={`Heart rate after ${c.n} coffees, each lined up at the coffee, against coffee-free days`} />}
            <p className="he-words" data-sure={c.sure}>{coffeeWords(c)}</p>
          </div>
          <div className="he-col">
            <h3>After a workout <span>coming back down</span></h3>
            {g.n > 0 && <Aligned width={gw} height={chartH(two ? 240 : 180)} x={[0, 90]} y={[-5, gHi]} each={g.each} avg={g.curve} color="var(--gym)"
              mark={g.backMin != null ? { m: g.backMin, text: `back in ${g.backMin} min` } : null} xTicks={[[0, "end"], [30, "30"], [60, "60"], [90, "90 min"]]} yTicks={[0, gHi / 2, gHi]}
              label={`Heart rate above your usual after ${g.n} workouts`} />}
            <p className="he-words">{workoutWords(g, usual)}</p>
          </div>
        </div>
        {c.n > 0 && <p className="he-note">Thin lines: each coffee. Thick: their average. {c.wobble ? "Grey strip: what chance alone could draw. " : ""}Lined up so the half hour before each coffee is 0 — a day you're higher anyway doesn't count as the coffee.</p>}
      </div>
  );
}
