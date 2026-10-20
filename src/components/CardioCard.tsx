/**
 * Cardio on the Training page, next to strength (PLAN 146; owner, 20 Oct: "Cardio is important for my weight loss" —
 * "do these"). This week's minutes against his usual (the 3 weeks before), minutes a week for 8 weeks, and the last
 * sessions with the band's heart rate and about how many kcal (lib/cardio).
 */

import { useMemo } from "react";
import { Bars } from "./Charts";
import { cardioHr, cardioKcal, cardioSpans, cardioWeeks, minutesOf } from "../lib/cardio";
import { currentKg } from "../lib/body";
import { useStore } from "../lib/store";
import { dayLabel } from "../lib/time";
import type { HrMinute } from "../lib/band";
import { ZoneBar } from "./ZoneBar";

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
    </section>
  );
}
