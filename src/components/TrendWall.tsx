/**
 * Every trend (PLAN 207; owner, 11 Nov, on round 3 of the Insights canvas — K on the web, M on the phone: "nice letsgo.
 * build all"). Insights' landing: a panel per measure — each day a dot, the 7-day average as the yellow line, which way
 * it's heading and how far over the range (lib/trends), better / slipping / steady counted at the top; 30 days, 90 days or
 * a year. On a phone each is a compact row: the name and value, the little chart, the change. The measures come from the
 * band (sleep, bedtime, HRV, resting heart, VO2 max, steps), the log (weight, protein, calories, drinks, caffeine, mood,
 * energy, focus) and the lifts (strength). Only reads.
 */

import { useMemo, useState } from "react";
import { useBand } from "../lib/band-client";
import { eveningInputs } from "../lib/eveninputs";
import { dailyFacts } from "../lib/insights";
import { clockH, evenings, nights, regularityByDay } from "../lib/sleep";
import { sleepScore } from "../lib/sleepscore";
import { stepsByDay } from "../lib/steps";
import { useStore } from "../lib/store";
import { overallStrength } from "../lib/strength";
import { addDays, localDay } from "../lib/time";
import type { LoggedSet } from "../lib/training";
import { tally, trendOf, TRENDS, type Measure, type Trend } from "../lib/trends";
import type { EntryOf } from "../lib/types";
import { linksNow } from "../lib/ai/client";
import { getState } from "../lib/store";

const hm = (h: number) => { const m = Math.round(h * 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
const FMT: Record<string, (v: number) => string> = {
  score: (v) => String(Math.round(v)), asleep: (v) => `${Math.floor(v)} h ${String(Math.round((v % 1) * 60)).padStart(2, "0")}`, bed: hm,
  hrv: (v) => String(Math.round(v)), rhr: (v) => String(Math.round(v)), vo2: (v) => v.toFixed(1), steps: (v) => `${v.toFixed(1)}k`,
  weight: (v) => v.toFixed(1), protein: (v) => String(Math.round(v)), kcal: (v) => Math.round(v).toLocaleString("en-GB"), drinks: (v) => v.toFixed(1),
  caffeine: (v) => String(Math.round(v)), mood: (v) => v.toFixed(1), energy: (v) => v.toFixed(1), focus: (v) => v.toFixed(1), strength: (v) => String(Math.round(v)),
};
const RANGES: Record<number, string> = { 30: "Last 30 days", 90: "Last 90 days", 365: "Last year" };

function change(t: Trend, n: number): string {
  if (!t.moved) return "steady";
  const f = FMT[t.key] ?? ((v: number) => v.toFixed(1)), d = t.delta;
  const amount = t.key === "bed" ? `${Math.round(Math.abs(d) * 60)} min ${d > 0 ? "later" : "earlier"}` : `${d > 0 ? "+" : "−"}${f(Math.abs(d))}${t.unit && !["/10", "a day"].includes(t.unit) ? ` ${t.unit}` : ""}`;
  return `${amount} in ${n === 365 ? "a year" : `${n} days`}`;
}

function Panel({ t, n }: { t: Trend; n: number }) {
  const f = FMT[t.key] ?? ((v: number) => v.toFixed(1)), pad = (t.hi - t.lo) * 0.08 || 1;
  const X = (i: number) => 2 + (i / Math.max(1, n - 1)) * 296, Y = (v: number) => 94 - ((v - (t.lo - pad)) / (t.hi - t.lo + 2 * pad)) * 88;
  const last = t.avg[t.avg.length - 1];
  return (
    <section className={`tw-p ${t.tone}`} aria-label={t.name} data-trend={t.key} data-tone={t.tone}>
      <span className="tw-name">{t.name}</span>
      <span className="tw-ch">{t.way === "up" ? "↗" : t.way === "down" ? "↘" : "→"} {change(t, n)}</span>
      <span className="tw-now"><b>{f(t.now)}</b><small>{t.unit ? `${t.unit} · ` : ""}7-day average</small></span>
      <svg viewBox="0 0 300 100" className="tw-svg" role="img" aria-label={`${t.name}: 7-day average ${f(t.now)}, ${t.moved ? (t.way === "up" ? "up" : "down") : "steady"} over the ${RANGES[n].toLowerCase()}`}>
        {t.days.map((d) => <circle key={d.day} cx={X(d.i)} cy={Y(d.v)} r={n > 120 ? 1.6 : 2.4} className="tw-dot"><title>{`${new Date(`${d.day}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}: ${f(d.v)}`}</title></circle>)}
        <polyline points={t.avg.map((a) => `${X(a.i).toFixed(1)},${Y(a.v).toFixed(1)}`).join(" ")} className="tw-avg" />
        <circle cx={X(last.i)} cy={Y(last.v)} r="4.5" className="tw-end" />
      </svg>
      <small className="tw-foot">{t.days.length} days · range {f(t.lo)}–{f(t.hi)}</small>
    </section>
  );
}

export function TrendWall({ now }: { now: number }) {
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), settings = useStore((s) => s.settings);
  const band = useBand().data, today = localDay(now);
  const [n, setN] = useState<number>(() => { try { return Number(localStorage.getItem("healthos.trendRange")) || 90; } catch { return 90; } });
  const measures = useMemo((): Measure[] => {
    const from = addDays(today, -366), days = dailyFacts(entries, workouts, settings, from, addDays(today, -1));
    const s = (f: (d: (typeof days)[number]) => number | null | undefined) => { const o: Record<string, number> = {}; for (const d of days) { const v = f(d); if (v != null && Number.isFinite(v)) o[d.day] = v; } return o; };
    const ms: Measure[] = [];
    if (band) {
      const ns = nights(band.sleep, band.hr, band.rhr, band.hrv).filter((x) => x.day > from && x.day <= today).sort((a, b) => a.bed - b.bed);
      const evs = evenings(ns, eveningInputs(entries, workouts, settings.halfLifeMin));
      const score: Record<string, number> = {}, asleep: Record<string, number> = {}, bed: Record<string, number> = {};
      ns.forEach((x, i) => { score[x.day] = sleepScore(x, evs[i].rating, ns).score; asleep[x.day] = x.asleep / 60; bed[x.eve] = clockH(x.bed, x.eve); });
      const steps = Object.fromEntries([...stepsByDay(band.steps ?? [], band.hr, today).entries()].filter(([d, v]) => d < today && v > 0).map(([d, v]) => [d, v / 1000]));
      ms.push({ key: "score", name: "Sleep score", unit: "", better: 1, series: score }, { key: "asleep", name: "Asleep", unit: "", better: 1, series: asleep },
        { key: "bed", name: "In bed", unit: "", better: -1, series: bed },
        // PLAN 210: how alike the last 7 nights were, morning by morning (on the Sleep page as one number)
        { key: "regular", name: "Sleep regularity", unit: "/100", better: 1, series: regularityByDay(ns) }, { key: "hrv", name: "HRV", unit: "ms", better: 1, series: band.hrv },
        { key: "rhr", name: "Resting heart", unit: "bpm", better: -1, series: band.rhr },
        { key: "vo2", name: "VO2 max", unit: "", better: 1, series: Object.fromEntries(Object.entries(band.vo2 ?? {}).map(([d, v]) => [d, v.v])) },
        { key: "steps", name: "Steps", unit: "", better: 1, series: steps });
    }
    const weight: Record<string, number> = {};
    for (const e of entries) if (e.kind === "weight") weight[localDay(e.at)] = e.kg;
    const sets = entries.filter((e): e is EntryOf<"set"> => e.kind === "set") as LoggedSet[];
    const strength = Object.fromEntries(overallStrength(sets, now).weeks.map((w) => [localDay(w.week), w.index]));
    ms.push({ key: "weight", name: "Weight", unit: "kg", better: -1, series: weight },
      { key: "protein", name: "Protein", unit: "g", better: 1, series: s((d) => d.proteinG) },
      { key: "kcal", name: "Calories", unit: "kcal", better: 0, series: s((d) => d.kcal) },
      { key: "drinks", name: "Drinks", unit: "a day", better: -1, series: s((d) => (d.logged ? d.alcoholG / 14 : null)) },
      { key: "caffeine", name: "Caffeine", unit: "mg", better: 0, series: s((d) => (d.logged ? d.caffeineMg : null)) },
      { key: "mood", name: "Mood", unit: "/10", better: 1, series: s((d) => d.mood) },
      { key: "energy", name: "Energy", unit: "/10", better: 1, series: s((d) => d.energy) },
      { key: "focus", name: "Focus", unit: "/10", better: 1, series: s((d) => d.focus) },
      { key: "strength", name: "Strength", unit: "index", better: 1, series: strength });
    return ms;
  }, [entries, workouts, settings, band, today, now]);
  const trends = useMemo(() => measures.map((m) => trendOf(m, today, n)).filter((t): t is Trend => !!t), [measures, today, n]);
  // the surest link the app found (PLAN 207, M): one line under the trends, opening Findings
  const top = useMemo(() => linksNow(getState(), now, 1)[0] ?? null, [entries, workouts, band, now]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!trends.length) return null;
  const c = tally(trends);
  const pick = (k: number) => { setN(k); try { localStorage.setItem("healthos.trendRange", String(k)); } catch { /* private mode: not kept */ } };
  return (
    <section className="tw" id="every-trend" aria-label="Every trend" data-sec="week">
      <div className="tw-head">
        <div>
          <h2>Every trend <span>each dot a day · the yellow line the 7-day average · which way it's heading over the {RANGES[n].toLowerCase()}</span></h2>
          <p className="tw-tally"><span><b className="better">{c.better}</b> getting better</span><span><b className="worse">{c.worse}</b> slipping</span><span><b>{c.steady}</b> steady</span></p>
        </div>
        <div className="tw-range" role="group" aria-label="Range">{TRENDS.ranges.map((k) => <button key={k} type="button" aria-pressed={n === k} onClick={() => pick(k)}>{RANGES[k]}</button>)}</div>
      </div>
      <div className="tw-grid">{trends.map((t) => <Panel key={t.key} t={t} n={n} />)}</div>
      {top && <a className="tw-link" href="#insights/connections"><small>Connected in your days</small><b>{top.split(" (90 %")[0]}.</b><span>All the connections, and what they started ›</span></a>}
    </section>
  );
}
