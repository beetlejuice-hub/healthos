/**
 * Insights → Mind, under the new page (components/MindPage): mood by weekday × time of day, and what comes before your
 * best and worst days. The old mood course went (owner, 21 Oct, PLAN 151: the old panels go, these two "move into the
 * new design" — nothing else shows them). Numbers from lib/mind and lib/patterns; this file only draws.
 */

import { useMemo } from "react";
import { useWidth } from "./useWidth";
import { useStore } from "../lib/store";
import type { GlanceDay } from "../lib/glance";
import { BLOCKS, WEEKDAYS, moodRhythm, stepOf } from "../lib/mind";
import { DAY } from "../lib/time";
import { Patterns } from "./Patterns";

const f1 = (v: number) => v.toFixed(1);

export function Mind({ days, now, period }: { days: GlanceDay[]; now: number; period: number }) {
  const entries = useStore((s) => s.entries);
  const rhythmDays = Math.max(period, 28);
  const rhythm = useMemo(() => moodRhythm(entries, now - rhythmDays * DAY), [entries, now, rhythmDays]);
  if (!rhythm.n && !days.some((d) => d.mood != null)) return null;
  return (
    <>
      <div className="gl-group" id="ins-mind" data-sec="mind"><h2>When, and before what</h2><span>mood by weekday and time of day · what comes before your best and worst days</span></div>
      <div className="gl" data-sec="mind">
        {rhythm.n > 0 && <RhythmPanel rhythm={rhythm} days={rhythmDays} />}
        <Patterns days={days} />
      </div>
    </>
  );
}

function RhythmPanel({ rhythm, days }: { rhythm: ReturnType<typeof moodRhythm>; days: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const L = 36, top = 18, gap = 3, cwid = (w - L - 4) / BLOCKS.length - gap, ch = 30, H = top + 7 * (ch + gap) + 2;
  const lo = rhythm.lo!, hi = rhythm.hi!;
  const name = (c: { row: number; col: number }) => `${WEEKDAYS[c.row]} ${String(BLOCKS[c.col]).padStart(2, "0")}:00–${String(BLOCKS[c.col] + 3).padStart(2, "0")}:00`;
  return (
    <section className="gp gl-rhythm" aria-label="Mood by weekday and time">
      <header className="gp-h"><div><span className="gp-k">Rhythm</span><h2>Mood by weekday and time</h2>
        <p className="gp-ans">{rhythm.best ? <>Best: <b>{name(rhythm.best)}</b> ({f1(rhythm.best.mean!)}).{rhythm.lowest && rhythm.lowest.mean! < rhythm.best.mean! ? <> Lowest: <b>{name(rhythm.lowest)}</b> ({f1(rhythm.lowest.mean!)}).</> : null}</> : "Needs 2+ check-ins at the same weekday and time to name a best and lowest."}</p></div>
        <span className="gp-meta">last {days} days</span></header>
      <div ref={ref} className="gl-chart">
        <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label="Average mood for each weekday and 3-hour block">
          {BLOCKS.map((b, k) => <text key={b} x={L + k * (cwid + gap) + cwid / 2} y={12} textAnchor="middle" className="c">{String(b).padStart(2, "0")}–{String(b + 3).padStart(2, "0")}</text>)}
          {WEEKDAYS.map((d, r) => <text key={d} x={L - 6} y={top + r * (ch + gap) + ch / 2 + 4} textAnchor="end" className="c">{d}</text>)}
          {rhythm.cells.map((c) => {
            const x = L + c.col * (cwid + gap), y = top + c.row * (ch + gap);
            if (c.mean == null) return <rect key={`${c.row}-${c.col}`} x={x} y={y} width={cwid} height={ch} rx="4" className="empty" />;
            const st = stepOf(c.mean, lo, hi);
            return (
              <g key={`${c.row}-${c.col}`}>
                <rect x={x} y={y} width={cwid} height={ch} rx="4" fill={`var(--q${st})`} data-tip={`${name(c)}\nMood ${f1(c.mean)} on average\n${c.n} check-in${c.n === 1 ? "" : "s"}`} />
                <text x={x + cwid / 2} y={y + ch / 2 + 4} textAnchor="middle" className="cell" style={{ fill: `var(--qt${st})` }} pointerEvents="none">{f1(c.mean)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <footer className="gp-f"><span className="lgd"><i style={{ background: "var(--q0)" }} />lower ({f1(lo)})</span><span className="lgd"><i style={{ background: "var(--q2)" }} /></span><span className="lgd"><i style={{ background: "var(--q5)" }} />higher ({f1(hi)})</span><span className="gl-dim">empty = no check-ins then · before 06:00 counts as the night before</span></footer>
    </section>
  );
}
