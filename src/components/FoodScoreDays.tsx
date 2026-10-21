/**
 * Insights → Intake: your food as whole days, out of 100 (owner, 21 Oct: "food notrution score can be bult too" … "do
 * whatever"). A bar a day for the period, coloured by how it went; tap one for its parts — protein, spread, calories,
 * fibre, plants, limits, last meal, alcohol — each with its points and why (lib/dayscore). Today isn't scored: it isn't
 * over. A day not logged in full shows as a gap, not a low score.
 */

import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { dayScore, type DayScore } from "../lib/dayscore";
import { atMinute, dayLabel } from "../lib/time";
import { Panel } from "./Body";
import { SleepScore } from "./SleepScore";
import { useWidth } from "./useWidth";

const zoneOf = (s: number) => (s >= 70 ? "ideal" : s >= 55 ? "fair" : "poor");
const COLOR = { ideal: "var(--z-ideal)", fair: "var(--z-fair)", poor: "var(--z-poor)" } as const;

export function FoodScoreDays({ days, today }: { days: string[]; today: string }) {
  const entries = useStore((s) => s.entries), foods = useStore((s) => s.foods), goals = useStore((s) => s.goals), bed = useStore((s) => s.settings.bedMinute);
  const list = useMemo(() => days.filter((d) => d < today).map((d) => ({ day: d, s: dayScore(entries, foods, goals, bed, d) })), [days, today, entries, foods, goals, bed]);
  const scored = list.filter((x): x is { day: string; s: DayScore } => !!x.s);
  const [pick, setPick] = useState<string | null>(null);
  const [ref, w] = useWidth<HTMLDivElement>();
  if (!scored.length) return null;
  const sel = scored.find((x) => x.day === pick) ?? scored[scored.length - 1];
  const avg = Math.round(scored.reduce((a, x) => a + x.s.score, 0) / scored.length);
  const best = scored.reduce((a, x) => (x.s.score > a.s.score ? x : a)), low = scored.reduce((a, x) => (x.s.score < a.s.score ? x : a));
  const L = 26, R = 6, top = 6, ph = 110, H = top + ph + 20, cw = (w - L - R) / list.length, bw = Math.max(3, Math.min(22, cw - 3));
  const Y = (v: number) => top + ph - (v / 100) * ph, x = (i: number) => L + i * cw + (cw - bw) / 2;
  const label = (d: string) => dayLabel(atMinute(d, 720)), date = (d: string) => label(d).slice(4);
  return (
    <Panel cls="gl-foodscore" kick="Food score" title="Your food, day by day"
      ans={<>Average <b>{avg}</b>/100 over {scored.length} day{scored.length === 1 ? "" : "s"} logged in full{scored.length > 2 ? <> · best {label(best.day)} ({best.s.score}), lowest {label(low.day)} ({low.s.score})</> : null}.</>}
      meta={`${list.length} days`}
      foot={<><span className="lgd"><i style={{ background: COLOR.ideal }} />70+</span><span className="lgd"><i style={{ background: COLOR.fair }} />55–69</span><span className="lgd"><i style={{ background: COLOR.poor }} />under 55</span><span>· a gap: not logged in full · tap a day</span></>}>
      <div ref={ref} className="gl-chart">
        <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label={`Food score each day: average ${avg}`}>
          {[0, 50, 100].map((v) => <g key={v}><line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} className={v ? "grid" : "axis"} /><text x={L - 6} y={Y(v) + 3.5} textAnchor="end">{v}</text></g>)}
          {list.map((d, i) => {
            const on = d.day === sel.day;
            if (!d.s) return <rect key={d.day} x={x(i)} y={Y(0) - 2} width={bw} height={2} rx={1} fill="var(--i-line-2, var(--c-track))" />;
            const y = Y(d.s.score), h = Y(0) - y, r = Math.min(4, bw / 2, h);
            return <g key={d.day} className="fs-day" data-day={d.day} data-score={d.s.score} onClick={() => setPick(d.day)} style={{ cursor: "pointer" }}>
              <rect x={L + i * cw} y={top} width={cw} height={ph} fill="transparent" />
              <path d={`M${x(i)},${Y(0)} V${y + r} q0,-${r} ${r},-${r} H${x(i) + bw - r} q${r},0 ${r},${r} V${Y(0)} Z`} fill={COLOR[zoneOf(d.s.score)]} opacity={on ? 1 : 0.55} />
              {on && <text x={x(i) + bw / 2} y={y - 4} textAnchor="middle" className="fs-n">{d.s.score}</text>}
            </g>;
          })}
          {list.map((d, i) => (i === 0 || i === list.length - 1 || (list.length <= 14 && i % 2 === 0) ? <text key={d.day} x={x(i) + bw / 2} y={H - 4} textAnchor="middle" className="fs-t">{date(d.day)}</text> : null))}
        </svg>
      </div>
      <div className="fs-sel" data-day={sel.day}>
        <p className="fs-head"><b>{dayLabel(atMinute(sel.day, 720))}</b> · {Math.round(sel.s.kcal).toLocaleString("en-GB")} kcal logged</p>
        <SleepScore s={sel.s} label="Food score" leftWhy={(l) => `${l.name.toLowerCase()} (${(sel.s.left.find((x) => x.id === l.id)?.why ?? "")})`} />
      </div>
    </Panel>
  );
}
