/**
 * Insights → Heart: cardio fitness (PLAN 52; owner, 21 Oct: "do 1" — VO2 max as a trend). The band's daily VO2 max over
 * the last 90 days, each day a dot, and what lib/vo2 says of it: where it is, which way it went over 8 weeks, and — while
 * the weight's going down — how much of the change is fitness and how much the kilos (it's per kg). Draws only.
 */

import { useMemo, useState, type PointerEvent } from "react";
import type { Vo2Day } from "../lib/vo2";
import { kgByDay, levelWords, vo2Trend } from "../lib/vo2";
import { addDays, atMinute, dayLabel } from "../lib/time";
import type { Entry } from "../lib/types";

const COLOR = "#8fb3f5", SPAN = 90;
const f1 = (v: number) => v.toFixed(1);

export function CardioFitness({ vo2, entries, today, w }: { vo2: Record<string, Vo2Day> | undefined; entries: Entry[]; today: string; w: number }) {
  const kg = useMemo(() => kgByDay(entries), [entries]);
  const t = useMemo(() => vo2Trend(vo2, today, kg), [vo2, today, kg]);
  const days = useMemo(() => Array.from({ length: SPAN }, (_, i) => addDays(today, i - SPAN + 1)), [today]);
  const [hov, setHov] = useState<number | null>(null);
  const vals = days.map((d) => vo2?.[d]?.v ?? null), have = vals.filter((v): v is number => v != null);
  if (!have.length) return (
    <section className="sl-p hp-vo2" aria-label="Cardio fitness, VO2 max">
      <h3 className="cmp-k">Cardio fitness · VO2 max</h3>
      <p className="sl-note">Nothing from the band yet. Fitbit works it out from your heart rate as you wear it; it shows here as it comes.</p>
    </section>
  );
  const H = w < 640 ? 150 : 170, x0 = 8, x1 = w - 2 - 52, y0 = 14, y1 = H - 26, cw = (x1 - x0) / SPAN, cx = (k: number) => x0 + (k + 0.5) * cw;
  const lo = Math.min(...have), hi = Math.max(...have), pad = Math.max(1, (hi - lo) * 0.2), a = Math.floor(lo - pad), b = Math.ceil(hi + pad);
  const Y = (v: number) => y1 - ((v - a) / (b - a)) * (y1 - y0);
  const step = b - a > 12 ? 5 : b - a > 5 ? 2 : 1, ticks: number[] = [];
  for (let v = Math.ceil(a / step) * step; v <= b; v += step) ticks.push(v);
  let line = "", pen = false;
  vals.forEach((v, i) => { if (v == null) { pen = false; return; } line += `${pen ? "L" : "M"}${f1(cx(i))} ${f1(Y(v))}`; pen = true; });
  const lastI = vals.reduce<number>((m, v, i) => (v != null ? i : m), -1), lastV = vals[lastI]!;
  const at = (e: PointerEvent<SVGRectElement>) => { const r = e.currentTarget.getBoundingClientRect(), i = Math.floor(((e.clientX - r.left) / r.width) * SPAN); return i >= 0 && i < SPAN ? i : null; };
  const k = hov != null && vals[hov] != null ? hov : null, kd = k != null ? vo2![days[k]] : null;
  const c8 = t?.changes.at(-1);
  return (
    <section className="sl-p hp-vo2" aria-label="Cardio fitness, VO2 max" data-now={t ? f1(t.now) : undefined} data-trend={c8?.word}>
      <h3 className="cmp-k">Cardio fitness · VO2 max <span>ml of oxygen a minute per kg</span></h3>
      <svg width={w - 2} height={H} viewBox={`0 0 ${w - 2} ${H}`} role="img" aria-label={`VO2 max each day for the last ${SPAN} days; latest ${f1(lastV)}`}>
        {ticks.filter((v) => Math.abs(Y(v) - Y(lastV)) >= 12).map((v) => <g key={v}><line x1={x0} x2={x1} y1={Y(v)} y2={Y(v)} className="he-grid" /><text x={x1 + 6} y={Y(v) + 3} className="hp-t">{v}</text></g>)}
        {c8 && <line x1={cx(SPAN - 1 - 7 * c8.weeks)} x2={cx(SPAN - 1 - 7 * c8.weeks)} y1={y0} y2={y1} className="vo2-then" />}
        {k != null && <line x1={cx(k)} x2={cx(k)} y1={y0 - 6} y2={y1} className="vo2-hov" />}
        <path d={line} stroke={COLOR} strokeWidth="2" fill="none" strokeLinejoin="round" />
        {vals.map((v, i) => (v == null ? null : <circle key={i} cx={cx(i)} cy={Y(v)} r={i === k ? 4 : 2.2} fill={vo2![days[i]].est ? "var(--i-panel)" : COLOR} stroke={COLOR} strokeWidth="1.2" />))}
        <text x={x1 + 6} y={Y(lastV) + 4} className="hp-last" style={{ fill: COLOR }}>{f1(lastV)}</text>
        {c8 && <text x={cx(SPAN - 1 - 7 * c8.weeks) + 4} y={y1 + 14} className="hp-t">{c8.weeks} weeks ago</text>}
        <text x={x1} y={y1 + 14} textAnchor="end" className="hp-t">Today</text>
        <rect x={x0} y={0} width={x1 - x0} height={H} fill="transparent" onPointerMove={(e) => setHov(at(e))} onPointerDown={(e) => setHov(at(e))} onPointerLeave={(e) => { if (e.pointerType === "mouse") setHov(null); }} />
      </svg>
      <p className="sl-note vo2-hov-note" aria-live="polite">{kd ? `${dayLabel(atMinute(days[k!], 720))}: ${f1(kd.v)}${levelWords(kd.level) ? ` · ${levelWords(kd.level)}` : ""}${kd.est ? " · an estimate" : ""}` : " "}</p>
      {t && <p className="vo2-line">{t.line}</p>}
      <p className="sl-note">Dots: each day's VO2 max from the band (hollow: Google calls it an estimate){c8 ? ` · the line ${c8.weeks} weeks ago: the week today's is set against` : ""}. It's per kg, so losing weight lifts it on its own.</p>
    </section>
  );
}
