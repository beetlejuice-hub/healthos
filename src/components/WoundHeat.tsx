/**
 * Insights → Body lab: wound up while still (PLAN 177, body lab 5; owner, 27 Oct: "yes"). Minutes your heart was 10+
 * above your usual while barely moving, by weekday and hour over 4 weeks, and the hour that's wound up most weeks — if
 * one is. Numbers from lib/wound; this file only draws.
 */

import { useMemo } from "react";
import type { BandData } from "../lib/band";
import { usualByHour } from "../lib/hrusual";
import { useStore } from "../lib/store";
import { localDay } from "../lib/time";
import { WEEKDAYS, WOUND, woundHeat } from "../lib/wound";

/** Minutes an hour: one hue, dark to the heart's red (0 · under 5 · under 15 · under 30 · 30+); no data is an outline. */
const RAMP = ["#1a2226", "#2e2a2b", "#4a2f2e", "#8a443d", "#ef7d6d"];
const step = (v: number) => (v < 0.5 ? 0 : v < 5 ? 1 : v < 15 ? 2 : v < 30 ? 3 : 4);
const hh = (h: number) => String(h).padStart(2, "0");

export function WoundHeat({ band, now }: { band: BandData; now: number }) {
  const workouts = useStore((s) => s.workouts);
  const today = localDay(now);
  const spans = useMemo(() => workouts.map((w) => ({ start: w.startedAt, end: w.endedAt ?? w.startedAt + 3_600_000 })), [workouts]);
  const heat = useMemo(() => woundHeat(band.hr, band.sleep, spans, band.steps ?? [], usualByHour(band.hr, spans, today, 14), today), [band, spans, today]);
  const t = heat.top;
  return (
    <section className="sl-p bl-card" aria-label="Wound up while still" data-card="wound" data-minutes={heat.minutes} data-top={t ? `${t.wd}-${t.h}` : ""}>
      <span className="cmp-k">Wound up while still · last {WOUND.weeks} weeks</span>
      {heat.noSteps ? <p className="bl-need">Needs steps from the band — without them a walk can't be told from sitting still.</p>
        : heat.days < 14 ? <p className="bl-need">Needs 2 weeks of the band worn by day — {heat.days} days so far.</p>
          : <>
            <h3>{t ? <>Your most wound-up hour: <b>{t.name} {hh(t.h)}:00–{hh(t.h + 1)}:00</b> — {t.hot} of the last {t.weeks} {t.name}s.</>
              : heat.minutes === 0 ? "No minutes wound up while still in the last 4 weeks."
                : "No hour stands out — the wound-up minutes are spread across your week."}</h3>
            <div className="wh" role="img" aria-label={`Minutes an hour with your heart up while still, by weekday and hour${t ? `; the most: ${t.name} ${hh(t.h)}:00` : ""}`}>
              {WEEKDAYS.map((d, wd) => (
                <div className="wh-row" key={d}><span>{d}</span>
                  {heat.cells.filter((c) => c.wd === wd).map((c) => <i key={c.h} className={c.perHour == null ? "none" : undefined} data-hot={t && t.wd === wd && t.h === c.h ? "" : undefined}
                    style={c.perHour != null ? { background: RAMP[step(c.perHour)] } : undefined}
                    title={c.perHour == null ? `${d} ${hh(c.h)}:00 — no band data` : `${d} ${hh(c.h)}:00–${hh(c.h + 1)}:00: ${Math.round(c.perHour)} min an hour wound up · on ${c.hot} of ${c.weeks} weeks`} />)}
                </div>
              ))}
              <div className="wh-x"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
            </div>
            <span className="wh-legend">min an hour {[0, 5, 15, 30].map((v, i) => <span key={v}><i style={{ background: RAMP[i === 0 ? 0 : i + 1] }} />{v}{v === 30 ? "+" : ""}</span>)} <span><i className="none" />no data</span></span>
          </>}
      <p className="bl-foot">Counted: minutes with your heart {WOUND.over}+ above your usual for that time while the band counted no steps. Stress, deep focus, caffeine or a tense call all look like this — the heart asks on Today say which. Sleep and training are left out; an hour is named only when it's like this most weeks.</p>
    </section>
  );
}
