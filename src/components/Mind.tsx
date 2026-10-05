/**
 * Insights → Mind (approved prototype v2, phase 3): mood each day against your average, with energy,
 * stress, sleep and events underneath (a clinical life chart), and mood by weekday × time of day.
 * Numbers from lib/mind; this file only draws.
 */

import { useMemo } from "react";
import { useWidth } from "./useWidth";
import { useStore } from "../lib/store";
import type { GlanceDay } from "../lib/glance";
import { BLOCKS, WEEKDAYS, moodCourse, moodRhythm, stepOf, type CourseDay } from "../lib/mind";
import { atMinute, dayLabel, DAY } from "../lib/time";
import { rolling7, weeklyTrend } from "../lib/patterns";
import { Patterns } from "./Patterns";

const f1 = (v: number) => v.toFixed(1);
const sg = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;
const noon = (d: string) => atMinute(d, 12 * 60);

export function Mind({ days, now, period }: { days: GlanceDay[]; now: number; period: number }) {
  const entries = useStore((s) => s.entries);
  const course = useMemo(() => moodCourse(days, period), [days, period]);
  const rhythmDays = Math.max(period, 28);
  const rhythm = useMemo(() => moodRhythm(entries, now - rhythmDays * DAY), [entries, now, rhythmDays]);
  if (!course.rated && !rhythm.n) return null;
  return (
    <>
      <div className="gl-group" id="ins-mind"><h2>Mind</h2><span>how you felt, when, and around what</span></div>
      <div className="gl">
        {course.rated > 0 && <CoursePanel course={course} roll={rolling7(days.map((d) => d.mood)).slice(-course.days.length)} trend={weeklyTrend(days, "mood")} />}
        {rhythm.n > 0 && <RhythmPanel rhythm={rhythm} days={rhythmDays} />}
        <Patterns days={days} />
      </div>
    </>
  );
}

function CoursePanel({ course, roll, trend }: { course: ReturnType<typeof moodCourse>; roll: (number | null)[]; trend: ReturnType<typeof weeklyTrend> }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const list = course.days, base = course.base!;
  const L = 60, R = 8, top = 10, mh = 150, cw = (w - L - R) / list.length, ext = 3, y0 = top + mh / 2;
  const ys = (v: number) => y0 - (Math.max(-ext, Math.min(ext, v)) / ext) * (mh / 2);
  const strips: [keyof CourseDay, string, string][] = [["energy", "Energy", "var(--gym)"], ["stress", "Stress", "var(--hr)"], ["sleep", "Slept", "var(--ok)"]];
  const shown = strips.filter(([k]) => list.some((d) => d[k] != null));
  const sh = 12, sy = top + mh + 10, evY = sy + shown.length * (sh + 4) + 12, H = evY + 50;
  const gap = cw > 5 ? 1 : 0, bw = Math.max(1, cw - 2 * gap);
  const ev = (d: CourseDay) => [d.trained && "●", d.drinksBefore && "◆", d.lateCaffeine && "✕", d.note && "✎"].filter(Boolean) as string[];
  // Date labels on Mondays, at least 50 px apart.
  const labels = new Set<number>(); list.reduce((last, d, j) => { if (new Date(noon(d.day)).getDay() === 1 && L + j * cw - last >= 50) { labels.add(j); return L + j * cw; } return last; }, -1e9);
  const best = course.best!, low = course.lowest!;
  return (
    <section className="gp gl-course" aria-label="Mood course">
      <header className="gp-h"><div><span className="gp-k">Mood course</span><h2>Each day against your average</h2>
        <p className="gp-ans"><b>{course.above} of {course.rated}</b> days above your average of {f1(base)}. Best: {dayLabel(noon(best.day))} ({f1(best.mood!)}{best.trained ? ", trained" : ""}). Lowest: {dayLabel(noon(low.day))} ({f1(low.mood!)}{low.drinksBefore ? ", after drinks" : ""}).{trend && <> Last 4 weeks: <b>{trend.clear ? (trend.perWeek > 0 ? "rising" : "falling") : "steady"}</b> ({sg(trend.perWeek)} a week, 95% range {sg(trend.lo)} to {sg(trend.hi)}).</>}</p></div>
        <span className="gp-meta">{list.length} days · {list.reduce((a, d) => a + d.checkins, 0)} check-ins</span></header>
      <div ref={ref} className="gl-chart">
        <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label="Daily mood against your average, with energy, stress, sleep and events">
          {[-2, -1, 1, 2].map((v) => <g key={v}><line x1={L} x2={w - R} y1={ys(v)} y2={ys(v)} className="grid" /><text x={L - 6} y={ys(v) + 3.5} textAnchor="end">{v > 0 ? `+${v}` : `−${-v}`}</text></g>)}
          {list.map((d, j) => d.weekend ? <rect key={`w${j}`} x={L + j * cw} y={top} width={cw} height={mh} className="wkend" /> : null)}
          <line x1={L} x2={w - R} y1={y0} y2={y0} className="axis" />
          {shown.map(([, name], k) => <text key={name} x={L - 6} y={sy + k * (sh + 4) + 9.5} textAnchor="end" className="c">{name}</text>)}
          <text x={L - 6} y={evY + 4} textAnchor="end" className="c">Events</text>
          {list.map((d, j) => {
            const x = L + j * cw + gap, dt = new Date(noon(d.day)), mon = dt.getDay() === 1;
            const lab = labels.has(j);
            const r = 3, top2 = d.dev != null ? ys(d.dev) : y0, hgt = Math.abs(top2 - y0), rr = Math.min(r, bw / 2, hgt);
            const bar = d.dev == null || hgt < .5 ? null : d.dev >= 0
              ? <path d={`M${x},${y0} V${top2 + rr} q0,-${rr} ${rr},-${rr} H${x + bw - rr} q${rr},0 ${rr},${rr} V${y0} Z`} className="up" />
              : <path d={`M${x},${y0} V${top2 - rr} q0,${rr} ${rr},${rr} H${x + bw - rr} q${rr},0 ${rr},-${rr} V${y0} Z`} className="down" />;
            const tip = `${dayLabel(noon(d.day))}\nMood ${d.mood != null ? `${f1(d.mood)} (${sg(d.dev!)} vs your average)` : "–"}\nEnergy ${d.energy != null ? f1(d.energy) : "–"} · Stress ${d.stress != null ? f1(d.stress) : "–"}${d.sleep != null ? `\nSlept: rated ${d.sleep}/10` : ""}${d.trained ? "\nTrained" : ""}${d.drinksBefore ? "\nDrinks the night before" : ""}${d.lateCaffeine ? "\nCaffeine after 14:00" : ""}`;
            return (
              <g key={d.day}>
                {mon && <line x1={L + j * cw} x2={L + j * cw} y1={top} y2={top + mh} className="grid" />}
                {bar}
                {shown.map(([k, , color], s) => { const v = d[k] as number | null; return v == null ? null : <rect key={k} x={x} y={sy + s * (sh + 4)} width={bw} height={sh} rx={Math.min(2, bw / 2)} fill={color} opacity={(.12 + .88 * Math.max(0, Math.min(1, (v - 2) / 7))).toFixed(2)} />; })}
                {cw >= 8 && ev(d).map((g, k) => <text key={k} x={x + bw / 2} y={evY + k * 10} textAnchor="middle" className="ev" style={{ fontSize: cw < 12 ? 8 : 9 }}>{g}</text>)}
                {lab && <text x={L + j * cw + 2} y={evY + 44}>{dt.getDate()} {dayLabel(noon(d.day)).slice(-3)}</text>}
                <rect x={L + j * cw} y={top} width={cw} height={evY + 40 - top} fill="transparent" data-tip={tip} />
              </g>
            );
          })}
          <path d={roll.reduce((acc, v, j) => (v == null ? acc : acc + `${acc && roll[j - 1] != null ? "L" : "M"}${(L + (j + .5) * cw).toFixed(1)},${ys(v - base).toFixed(1)}`), "")} className="roll" /><text x={L - 6} y={y0 + 4} textAnchor="end" className="v">avg {f1(base)}</text>
        </svg>
      </div>
      <footer className="gp-f"><span className="lgd"><i style={{ background: "var(--g-now)" }} />above your average</span><span className="lgd"><i style={{ background: "var(--g-down)" }} />below</span><span className="lgd"><i className="ln" style={{ background: "var(--i-ink)" }} />7-day average</span>
        {shown.map(([, name, color]) => <span key={name} className="lgd"><i style={{ background: color }} />{name.toLowerCase()} (stronger = higher)</span>)}
        <span>● trained</span><span>◆ drinks the night before</span><span>✕ caffeine after 14:00</span><span>✎ a note</span><span className="gl-dim">shaded: weekends</span></footer>
    </section>
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
