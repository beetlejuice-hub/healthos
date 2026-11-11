/**
 * How you compare (PLAN 206; owner, 11 Nov: "i like the comparisons, etc, but the whole gamification idea is not that good
 * … keep the charts, keep the not so dry"). Where the game's week card was on Today: each thing a big study measured the
 * way your band does, as a bar — about what share of its people you're ahead of, the middle marked — and the most
 * striking of yesterday's steps, last night's sleep and this morning's resting heart rate in a line. Numbers from lib/card
 * and lib/norms; this file only draws.
 */

import { useMemo } from "react";
import { useBand } from "../lib/band-client";
import { compareOf, middle, pctWords } from "../lib/card";
import { fitAge } from "../lib/fitage";
import { vsBest } from "../lib/norms";
import { nights } from "../lib/sleep";
import { stepsByDay } from "../lib/steps";
import { useStore } from "../lib/store";
import { overallStrength } from "../lib/strength";
import { addDays, localDay } from "../lib/time";
import type { LoggedSet } from "../lib/training";
import type { EntryOf } from "../lib/types";

export function HowYouCompare({ now }: { now: number }) {
  const entries = useStore((s) => s.entries), age = useStore((s) => s.settings.age), sex = useStore((s) => s.settings.sex);
  const band = useBand().data, today = localDay(now);
  const ns = useMemo(() => (band ? nights(band.sleep, band.hr, band.rhr, band.hrv) : []), [band]);
  const sets = useMemo(() => entries.filter((e): e is EntryOf<"set"> => e.kind === "set") as LoggedSet[], [entries]);
  const { stats, vs } = useMemo(() => {
    const steps = band ? stepsByDay(band.steps ?? [], band.hr, today) : new Map<string, number>();
    const week = (d: string) => d <= today && d > addDays(today, -7);
    const stats = compareOf({
      vo2: band ? fitAge(band.vo2, today, sex ?? "male")?.vo2 ?? null : null, age: age ?? null, sex: sex ?? null,
      rhr: band ? middle(Object.entries(band.rhr).filter(([d]) => week(d)).map(([, v]) => v)) : null,
      asleepMin: middle(ns.filter((n) => week(n.day)).map((n) => n.asleep)),
      steps: middle([...steps.entries()].filter(([d, v]) => d < today && d >= addDays(today, -7) && v > 0).map(([, v]) => v)),
      strPerWeek: overallStrength(sets, now).perWeek,
    });
    const night = ns.find((n) => n.day === today);
    const vs = band ? vsBest({ steps: steps.get(addDays(today, -1)) ?? null, sleepMin: night?.asleep ?? null, rhr: band.rhr[today] ?? null }) : null;
    return { stats, vs };
  }, [band, ns, sets, age, sex, today, now]);
  const shown = stats.filter((s) => s.p != null);
  if (!shown.length) return null;
  return (
    <section className="card vsall" aria-label="How you compare">
      <h3>How you compare <span>this week, against big studies</span></h3>
      <ul>
        {stats.map((s) => (
          <li key={s.key} data-stat={s.key} className={s.p == null ? "none" : undefined}>
            <span className="vs-w"><b>{s.word}</b>{s.p != null && <> <small>{s.says}</small></>}</span>
            {s.p != null
              ? <><span className="vs-bar" aria-hidden="true"><i style={{ width: `${Math.round(s.p * 100)}%` }} className={s.p >= 0.5 ? "up" : "down"} /><em /></span>
                <span className="vs-p">{s.own ? (s.p >= 0.5 ? "gaining" : "slipping") : `ahead of ${pctWords(s.p)}`} <small>· {s.against}</small></span></>
              : <span className="vs-p"><small>{s.says}</small></span>}
          </li>
        ))}
      </ul>
      {vs && <p className="wk-vs"><b>You vs everyone</b> · {vs}</p>}
    </section>
  );
}
