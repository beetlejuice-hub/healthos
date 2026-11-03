/**
 * Cardio on the Training page, next to strength (PLAN 146; owner, 20 Oct: "Cardio is important for my weight loss" —
 * "do these"). This week's minutes against his usual (the 3 weeks before), minutes a week for 8 weeks, and the last
 * sessions with the band's heart rate and about how many kcal (lib/cardio).
 */

import { useMemo } from "react";
import { Bars, LineChart } from "./Charts";
import { cardioHr, cardioKcal, cardioSpans, cardioWeeks, minutesOf } from "../lib/cardio";
import { currentKg } from "../lib/body";
import { useStore } from "../lib/store";
import { dayLabel } from "../lib/time";
import type { HrMinute } from "../lib/band";
import { ZoneBar } from "./ZoneBar";
import { allPhases, beatsText, distText, kindStats, paceText, type DistUnit, type KindStats } from "../lib/cardiostats";

export function CardioCard({ now, hr }: { now: number; hr: HrMinute[] }) {
  const workouts = useStore((s) => s.workouts), entries = useStore((s) => s.entries);
  const kg = currentKg(entries, 0, now) || null;
  const spans = useMemo(() => cardioSpans(workouts, now).filter((s) => !s.running), [workouts, now]);
  const weeks = useMemo(() => cardioWeeks(spans, kg, now, 8), [spans, kg, now]);
  if (!spans.length) return null;
  const cur = weeks[weeks.length - 1], before = weeks.slice(-4, -1), usual = Math.round(before.reduce((a, w) => a + w.min, 0) / before.length);
  return (
    <section className="sl-p tp-cardio" aria-label="Cardio">
      <span className="cmp-k">Cardio</span>
      <div className="os-head"><b className="os-big">{cur.min} min</b><span className="s">this week · {cur.sessions} session{cur.sessions === 1 ? "" : "s"}{cur.kcal ? ` · about ${cur.kcal.toLocaleString("en-GB")} kcal` : ""} · usual {usual} min a week</span></div>
      <Bars label="Cardio minutes a week, the last 8 weeks" h={80} pts={weeks.map((w, i): [number, number] => [i, w.min])} lo={0} hi={Math.max(30, ...weeks.map((w) => w.min)) * 1.1} xs={[0, weeks.length - 1]} color="var(--ok)"
        yfmt={(v) => String(Math.round(v))} xlabels={[[0, dayLabel(weeks[0].week).replace(/^\w+ /, "")], [weeks.length - 1, "this week"]]} />
      <ul className="tp-cardio-list">{spans.slice(-3).reverse().map((s) => {
        const h = cardioHr(hr, s.start, s.end), kc = cardioKcal(s.what, minutesOf(s), kg);
        return <li key={s.workoutId + s.start}><b>{s.what}</b> <span>{dayLabel(s.start)} · {minutesOf(s)} min{h ? ` · avg ${h.avg} bpm` : ""}{kc ? ` · ~${kc.kcal} kcal` : ""}{s.own ? "" : " · after lifting"}</span>{h && <ZoneBar hr={hr} start={s.start} end={s.end} />}</li>;
      })}</ul>
      <CardioKinds now={now} hr={hr} />
    </section>
  );
}

/**
 * Pace and distance, a card per kind (PLAN 191; owner, 3 Nov: "just want the app to calculate some stats from my average
 * pace average miles average hbpm etc."; the canvas's stats A): average pace and the best, distance, heart rate, beats a
 * mile, each session's pace, and the first 3 against the last 3. Only kinds with a distance logged.
 */
export function CardioKinds({ now, hr }: { now: number; hr: HrMinute[] }) {
  const workouts = useStore((s) => s.workouts), u: DistUnit = useStore((s) => s.settings.distUnit) ?? "mi";
  const kinds = useMemo(() => kindStats(allPhases(workouts, hr, now)).filter((k) => k.withDist > 0), [workouts, hr, now]);
  if (!kinds.length) return null;
  const per = u === "mi" ? "a mile" : "a km";
  return <div className="ck-list">{kinds.map((k) => <KindCard key={k.kind} k={k} u={u} per={per} />)}</div>;
}

function KindCard({ k, u, per }: { k: KindStats; u: DistUnit; per: string }) {
  const first = k.series[0]?.start, label = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const word = k.kind === "Run" ? "run" : k.kind === "Incline walk" ? "walk" : "session";
  const moved = k.then && k.now ? (() => {
    const d = k.now.pace - k.then.pace, b = k.now.beats != null && k.then.beats != null ? Math.round(((k.now.beats - k.then.beats) * (u === "mi" ? 1.609344 : 1)) / 10) * 10 : null;
    return `The first 3 against the last 3: ${paceText(k.then.pace, u)} → ${paceText(k.now.pace, u)} ${per}${Math.abs(d) < 1 ? " (the same)" : d < 0 ? " (faster)" : " (slower)"}${b ? `, and about ${Math.abs(b).toLocaleString("en-GB")} ${b < 0 ? "fewer" : "more"} beats ${per}` : ""}.`;
  })() : null;
  return (
    <article className="ck" aria-label={`${k.kind}: pace and distance`}>
      <div className="ck-h"><b>{k.kind}</b><span className="s">{label(k.withDist, word)} with a distance{first ? ` since ${dayLabel(first).replace(/^\w+ /, "")}` : ""}</span></div>
      <div className="ck-tiles">
        <div><b>{paceText(k.pace!, u)}</b><span>avg pace /{u}{k.best && k.withDist > 1 ? ` · best ${paceText(k.best, u)}` : ""}</span></div>
        <div><b>{distText(k.avgKm!, u)}</b><span>avg a {word}{k.withDist > 1 ? ` · ${distText(k.km, u)} in all` : ""}</span></div>
        <div><b>{k.hr ?? "—"}</b><span>{k.hr ? `avg bpm · peak ${k.peak}` : "avg bpm — from the band"}</span></div>
        {k.beats != null ? <div><b>{beatsText(k.beats, u)}</b><span>beats {per} · fewer is fitter</span></div>
          : k.incline != null ? <div><b>{Math.round(k.incline * 10) / 10} %</b><span>avg incline</span></div> : null}
      </div>
      {k.series.length >= 2 && (() => {
        // pace in minutes a mile (or km), each session: dots and a line, the axis around them (from 0 the change vanishes)
        const pts = k.series.slice(-12).map((x, i): [number, number] => [i, (x.pace * (u === "mi" ? 1.609344 : 1)) / 60]), ys = pts.map((q) => q[1]);
        const lo = Math.floor(Math.min(...ys) * 2) / 2 - 0.25, hi = Math.ceil(Math.max(...ys) * 2) / 2 + 0.25, mmss = (v: number) => `${Math.floor(v)}:${String(Math.round((v % 1) * 60) % 60).padStart(2, "0")}`;
        return <LineChart label={`${k.kind}: pace ${per}, each ${word} (lower is faster)`} h={90} lo={lo} hi={hi} xs={[0, Math.max(1, pts.length - 1)]} yfmt={mmss}
          xlabels={[[0, dayLabel(k.series.slice(-12)[0].start).replace(/^\w+ /, "")], [pts.length - 1, "last"]]} series={[{ pts, color: "var(--ok)", dots: true, width: 1.5 }]} />;
      })()}
      {moved && <p className="s ck-moved">{moved}</p>}
    </article>
  );
}
