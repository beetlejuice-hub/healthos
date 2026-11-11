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
import { standOut } from "../lib/vsfix";
import { currentKg } from "../lib/body";
import { useDayTable } from "./useDayTable";
import { nights } from "../lib/sleep";
import { stepsByDay } from "../lib/steps";
import { useStore } from "../lib/store";
import { overallStrength } from "../lib/strength";
import { addDays, localDay } from "../lib/time";
import type { LoggedSet } from "../lib/training";
import type { EntryOf } from "../lib/types";

export function HowYouCompare({ now }: { now: number }) {
  const entries = useStore((s) => s.entries), age = useStore((s) => s.settings.age), sex = useStore((s) => s.settings.sex), bodyKg = useStore((s) => s.settings.bodyKg);
  const { days } = useDayTable(now);
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
  // PLAN 211: the last 14 days of logging against the guidelines, and the bars — the two strongest and two weakest
  const stand = useMemo(() => {
    const two = days.filter((d) => d.day < today && d.day >= addDays(today, -14)), logged = two.filter((d) => d.logged), kg = currentKg(entries, bodyKg, now);
    const pro = two.map((d) => d.proteinG).filter((v): v is number => v != null && v > 0);
    const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
    return standOut(stats, { loggedDays: logged.length, drinksG: logged.length ? (logged.reduce((a, d) => a + d.alcoholG, 0) / logged.length) * 7 : null,
      proteinGkg: pro.length >= 7 && kg ? mean(pro)! / kg : null, kg, caffeineMg: mean(logged.map((d) => d.caffeineMg)) });
  }, [days, stats, entries, bodyKg, today, now]);
  const shown = stats.filter((s) => s.p != null);
  if (!shown.length && !stand.good.length && !stand.bad.length) return null;
  return (
    <section className="card vsall" aria-label="How you compare">
      <h3>How you compare <span>this week, against big studies</span></h3>
      <ul>
        {stats.map((s) => (
          <li key={s.key} data-stat={s.key} className={s.p == null ? "none" : undefined}>
            <span className="vs-w"><b>{s.word}</b>{s.p != null && <> <small>{s.says}{s.avg ? ` · ${s.avg}` : ""}</small></>}</span>
            {s.p != null
              ? <><span className="vs-bar" aria-hidden="true"><i style={{ width: `${Math.round(s.p * 100)}%` }} className={s.p >= 0.5 ? "up" : "down"} /><em /></span>
                <span className="vs-p">{s.own ? (s.p >= 0.5 ? "gaining" : "slipping") : `ahead of ${pctWords(s.p)}`} <small>· {s.against}</small></span></>
              : <span className="vs-p"><small>{s.says}</small></span>}
          </li>
        ))}
      </ul>
      {stand.good.length || stand.bad.length ? <div className="vs-stand" aria-label="You vs everyone">
        <b className="vs-h">You vs everyone</b>
        {stand.good.length > 0 && <><small className="vs-k good">Where you stand out</small>
          {stand.good.map((i) => <div key={i.key} className="vs-i good" data-key={i.key}><b>{i.title}</b><span>{i.vs}</span></div>)}</>}
        {stand.bad.length > 0 && <><small className="vs-k bad">Where you're behind</small>
          {stand.bad.map((i) => <div key={i.key} className="vs-i bad" data-key={i.key}><b>{i.title}</b><span>{i.vs}</span>{i.fix && <span className="vs-fix"><b>Fix:</b> {i.fix}</span>}</div>)}</>}
        <small className="note">Bars: this week. Drinks, protein, caffeine: the last 14 days. Fixes are options, not orders.</small>
      </div> : vs && <p className="wk-vs"><b>You vs everyone</b> · {vs}</p>}
    </section>
  );
}
