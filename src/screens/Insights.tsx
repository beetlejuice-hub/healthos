import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { adherence, dailyFacts, lanes, pairs, suppEffects, type DayFacts, type Pair } from "../lib/insights";
import { MasterGraph } from "../components/MasterGraph";
import { Bars, LineChart } from "../components/Charts";
import { averageOver, byDay, againstGoals, add, macrosOf, split, ZERO } from "../lib/nutrition";
import { e1rmHistory, setsPerMuscle, suggestNext, volume } from "../lib/training";
import { mean, median, slope, strength, type Range } from "../lib/stats";
import { addDays, dayLabel, localDay, DAY } from "../lib/time";
import type { EntryOf } from "../lib/types";
import { useNow } from "./Today";
import { notice, WINDOW_DAYS, type Report } from "../lib/findings";
import { StackCheckPanel } from "../components/StackCheck";
import { useScout, WorthALook } from "../components/Scout";
import { Experiments } from "../components/Ai";
import { Weekly } from "../components/Weekly";
import type { GraphFocus } from "../components/MasterGraph";
import { CAF_SLEEP } from "../lib/caffeine-sleep";
import { DOSE_MIN_DAYS, doseCompare } from "../lib/dose";

const f0 = (v: number) => Math.round(v).toLocaleString("en-GB");
const f1 = (v: number) => v.toFixed(1);
const sgn = (v: number, f = f1) => `${v >= 0 ? "+" : "−"}${f(Math.abs(v))}`;
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m) % 60).padStart(2, "0")}`;

export function Insights() {
  const now = useNow(60_000);
  const s = useStore((x) => x);
  const today = localDay(now);
  const data = useMemo(() => lanes(s.entries, s.workouts, s.supplements, s.settings, now), [s.entries, s.workouts, s.supplements, s.settings, now]);
  const facts = useMemo(() => dailyFacts(s.entries, s.workouts, s.settings, addDays(today, -89), today), [s.entries, s.workouts, s.settings, today]);
  const sample = s.entries.some((e) => e.id.startsWith("sample:"));
  const scouted = useScout();
  const [focus, setFocus] = useState<GraphFocus | null>(null);
  const showOnGraph = (f: GraphFocus) => { setFocus(f); setTimeout(() => document.querySelector(".master")?.scrollIntoView({ behavior: "smooth" }), 50); };
  const report = useMemo(() => notice(s.entries, s.goals, now, s.settings.bodyKg, { workouts: s.workouts, supplements: s.supplements, settings: s.settings }), [s.entries, s.goals, now, s.settings, s.workouts, s.supplements]);
  // Show a section only once there's something in it; list the rest in one line each, so a new
  // account sees a short page instead of ten empty panels (owner: "looks really complex").
  const has = useMemo(() => {
    const kinds = new Set(s.entries.map((e) => e.kind));
    const workoutsPerExercise = new Map<string, Set<string>>();
    s.entries.forEach((e) => { if (e.kind === "set") workoutsPerExercise.set(e.exercise, (workoutsPerExercise.get(e.exercise) ?? new Set()).add(e.workoutId)); });
    return {
      food: kinds.has("food"),
      caffeine: facts.some((d) => d.caffeineMg > 0 || d.alcoholG > 0),
      strength: [...workoutsPerExercise.values()].some((w) => w.size >= 2),
      sets: kinds.has("set"),
      supps: kinds.has("supp"),
      effects: suppEffects(facts, s.supplements).some((e) => e.diff),
      pairs: pairs(facts).some((p) => p.r),
    };
  }, [s.entries, s.supplements, facts]);
  const locked: [string, string][] = [
    !has.food && ["Nutrition", "log food on a few days to see averages against your goals"],
    !has.caffeine && ["Caffeine and alcohol", "log drinks to see what's left in you at bedtime"],
    !has.strength && ["Strength", "log the same exercise in two workouts"],
    !has.sets && ["Sets per muscle", "log a workout"],
    !has.supps && ["Supplements", "tick your stack on Today"],
    !has.effects && ["Does it do anything?", "needs 5+ days both on and off a supplement, plus how you felt the next day"],
    !has.pairs && ["What moves what", "needs 10+ days with both the cause and next-day feeling logged"],
  ].filter((x): x is [string, string] => !!x);
  const nothing = s.entries.length === 0;

  return (
    <div className="inst">
      <header>
        <div>
          <h1>Insights</h1>
          <p>Every metric on one timeline, then the numbers behind nutrition, training, supplements and what affects how you feel. Each comparison shows its size, how many days it's based on and how certain it is.</p>
        </div>
        {sample && <span className="badge">INCLUDES SAMPLE DATA · remove it in Settings</span>}
      </header>
      {nothing && <div className="needs">Nothing logged yet. Log food, drinks and supplements for a few days and this fills in — or load sample data in Settings to see what it will look like.</div>}
      {!nothing && <Weekly now={now} />}
      {!nothing && <Noticed report={report} />}
      {!nothing && <WorthALook items={scouted} onShow={showOnGraph} />}
      {!nothing && <Kpis facts={facts} today={today} now={now} />}
      {!nothing && <MasterGraph data={data} supplements={s.supplements} focus={focus} />}
      <div className="pgrid">
        {has.food && <Nutrition now={now} />}
        {has.caffeine && <CaffeineAlcohol facts={facts} />}
        {has.strength && <Strength now={now} />}
        {has.sets && <Muscles now={now} />}
        {has.supps && <Supplements facts={facts} today={today} />}
        {has.effects && <SuppEffects facts={facts} />}
        <DoseEffects />
        {has.pairs && <WhatMovesWhat facts={facts} />}
        <Experiments />
        <StackCheckPanel />
        {locked.length > 0 && (
          <section className="p w12">
            <h2>Unlocks as you log <span>{locked.length} more sections</span></h2>
            <ul className="notes">{locked.map(([name, how]) => <li key={name}><b>{name}</b>: {how}</li>)}</ul>
          </section>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Noticed */

/** What the findings engine has to say: cards with their evidence, then what it's still checking. */
function Noticed({ report }: { report: Report }) {
  if (!report.found.length && !report.checking.length && !report.none.length) return null;
  return (
    <section className="noticed" id="noticed" aria-label="Noticed">
      <h2>Noticed <span>computed from your own days · compared fairly · silent until sure</span></h2>
      {report.found.length > 0 && <div className="ncards">
        {report.found.map((f) => (
          <article className="ncard" key={f.id} id={`n-${f.id}`}>
            <div className="k">{f.area} · {f.sure}</div>
            <h3>{f.title}</h3>
            <div className="v">{f.value}<small>{f.unit}</small></div>
            <p>{f.detail}</p>
            {f.chart?.kind === "trend" && (() => {
              const c = f.chart, days = c.days ?? WINDOW_DAYS;
              const ys = c.pts.map((p) => p[1]);
              const lo = Math.floor(Math.min(...ys) - 0.3), hi = Math.ceil(Math.max(...ys) + 0.3);
              return <LineChart label={f.title} h={120} lo={lo} hi={hi} xs={[0, days - 1]} yfmt={(v) => v.toFixed(1)}
                xlabels={[[0, c.firstDay.slice(5)], [days - 1, "today"]]}
                series={[{ pts: c.pts, color: "var(--wt)", dots: true, line: false, dotOpacity: 0.8 }, { pts: c.fit, color: "var(--i-ink)", width: 1.5, end: true }]} />;
            })()}
            {f.chart?.kind === "compare" && <CompareBars c={f.chart} />}
            <p className="ev">{f.evidence}</p>
          </article>
        ))}
      </div>}
      {report.checking.length > 0 && <div className="checking">
        <h3>Still checking</h3>
        {report.checking.map((c) => (
          <div className="chk" key={c.id}>
            <span>{c.question}<small>needs {c.missing}</small></span>
            <span className="bar" aria-label={`${Math.round(c.progress * 100)}% of the data needed`}><i style={{ width: `${Math.round(c.progress * 100)}%` }} /></span>
          </div>
        ))}
      </div>}
      {report.none.length > 0 && <details className="checking none">
        <summary>Checked — no effect <span>{report.none.length}</span></summary>
        <ul className="notes">{report.none.map((q) => <li key={q.id}>{q.text}</li>)}</ul>
      </details>}
    </section>
  );
}

/** Two averages side by side: days with the thing vs without, on the outcome's own scale. */
function CompareBars({ c }: { c: Extract<NonNullable<Report["found"][number]["chart"]>, { kind: "compare" }> }) {
  const max = c.unit === "points" ? 10 : Math.max(...c.values) * 1.1;
  const fmt = (v: number) => (c.unit === "points" ? v.toFixed(1) : Math.round(v).toLocaleString("en-GB"));
  return (
    <div className="cmp" role="img" aria-label={`${c.labels[0]} ${fmt(c.values[0])}, ${c.labels[1]} ${fmt(c.values[1])}`}>
      {c.values.map((v, i) => (
        <div className="cmp-row" key={i}>
          <span>{c.labels[i]}</span>
          <span className="cmp-bar"><i className={i ? "off" : "on"} style={{ width: `${Math.max(2, (v / max) * 100)}%` }} /></span>
          <b>{fmt(v)}</b><small>{c.ns[i]} days</small>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ KPIs: last 7 days vs 28 */

function Kpis({ facts, today, now }: { facts: DayFacts[]; today: string; now: number }) {
  const entries = useStore((s) => s.entries);
  const past = facts.filter((d) => d.day < today);
  const last = (n: number) => past.slice(-n);
  const kcal = (d: DayFacts[]) => d.filter((x) => x.kcal != null).map((x) => x.kcal!);
  const k7 = kcal(last(7)), k28 = kcal(last(28));
  const p7 = last(7).filter((x) => x.proteinG != null).map((x) => x.proteinG!);
  const weights = entries.filter((e): e is EntryOf<"weight"> => e.kind === "weight" && e.at > now - 28 * DAY);
  const wSlope = weights.length >= 5 ? slope(weights.map((w) => w.at / DAY), weights.map((w) => w.kg)) * 7 : NaN;
  const sets = entries.filter((e): e is EntryOf<"set"> => e.kind === "set");
  const vol = (days: number) => volume(sets.filter((x) => x.at > now - days * DAY));
  const caf7 = last(7).map((x) => x.caffeineMg), caf28 = last(28).map((x) => x.caffeineMg);
  const bed7 = last(7).map((x) => x.caffeineAtBed);
  const items: [string, string, string, string][] = [
    ["Calories", k7.length ? f0(mean(k7)) : "—", "kcal", k7.length ? `${k28.length ? `${sgn(mean(k7) - mean(k28), f0)} vs 28d · ` : ""}${k7.length}/7 days logged` : "no logged days"],
    ["Protein", p7.length ? f0(mean(p7)) : "—", "g/day", p7.length ? `logged days, last 7` : ""],
    ["Weight trend", Number.isFinite(wSlope) ? sgn(wSlope, (v) => v.toFixed(2)) : "—", "kg/wk", Number.isFinite(wSlope) ? `28d fit · ${weights.length} weigh-ins` : "needs 5 weigh-ins"],
    ["Training volume", sets.length ? f1(vol(7) / 1000) : "—", "t", sets.length ? `${f1(vol(28) / 4000)} t avg week` : "no sets yet"],
    ["Caffeine / day", caf7.some((v) => v > 0) ? f0(mean(caf7)) : "—", "mg", caf28.some((v) => v > 0) ? `${f0(mean(caf28))} mg over 28d` : ""],
    ["Left at bedtime", bed7.some((v) => v > 0) ? f0(median(bed7)) : "—", "mg", "median, last 7 nights"],
  ];
  return (
    <section className="kpis" aria-label="Last 7 days">
      {items.filter(([, v]) => v !== "—").map(([k, v, u, d]) => <div className="kpi" key={k}><span className="k">{k}</span><span className="v">{v}<small>{u}</small></span><span className="d">{d}</span></div>)}
    </section>
  );
}

/* ------------------------------------------------------------------ nutrition */

function Nutrition({ now }: { now: number }) {
  const entries = useStore((s) => s.entries);
  const goals = useStore((s) => s.goals);
  const bodyKg = useStore((s) => s.settings.bodyKg);
  const today = localDay(now);
  const intake = useMemo(() => byDay(entries), [entries]);
  const todays = entries.filter((e) => localDay(e.at) === today).reduce((a, e) => { const m = macrosOf(e); return m ? add(a, m) : a; }, ZERO);
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, -30 + i));
  const av = averageOver(days, intake);
  const hist: [number, number | null][] = days.map((d, i) => { const x = intake.get(d); return [i, x?.logged ? x.totals.kcal : null]; });
  const onGoal = days.filter((d) => { const x = intake.get(d); return x?.logged && Math.abs(x.totals.kcal - goals.kcal) <= 200; }).length;
  const pHit = days.filter((d) => { const x = intake.get(d); return x?.logged && x.totals.p >= goals.p; }).length;
  const sp = split(av.avg), gsp = split(goals);
  const colors = { kcal: "var(--kcal)", p: "var(--pro)", c: "var(--carb)", f: "var(--fat)" } as const;
  const names = { kcal: "Calories", p: "Protein", c: "Carbs", f: "Fat" } as const;
  return (
    <section className="p">
      <h2>Nutrition <span>goals: settings</span></h2>
      <div className="sub"><h3>Today so far</h3><div className="bars">
        {againstGoals(todays, goals).map((r) => (
          <div className="mb" key={r.key}><span>{names[r.key]}</span><div className="trk"><i style={{ width: `${Math.min(100, r.pct * 100)}%`, background: colors[r.key] }} /></div>
            <span className="val"><b>{f0(r.value)}</b> / {f0(r.goal)}{r.key === "kcal" ? " kcal" : " g"} · {f0(r.left)} left</span></div>
        ))}
      </div></div>
      <div className="sub"><h3>Last 30 days · {av.loggedDays} logged, {30 - av.loggedDays} not logged (left out)</h3>
        <Bars label="Calories per day, last 30 days" pts={hist} lo={0} hi={Math.max(goals.kcal * 1.3, ...hist.map((h) => h[1] ?? 0))} xs={[0, 29]} color="var(--kcal)" targets={[[goals.kcal, `goal ${f0(goals.kcal)}`]]} yfmt={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))} xlabels={[[0, dayLabel(now - 30 * DAY).slice(4)], [29, dayLabel(now - DAY).slice(4)]]} />
      </div>
      {av.loggedDays > 0 ? (
        <div className="tw"><table><tbody>
          <tr><th>30 days, logged days</th><th className="n">Average</th><th className="n">Goal</th><th className="n">Days on goal</th></tr>
          <tr><td>Calories</td><td className="n">{f0(av.avg.kcal)} kcal</td><td className="n">{f0(goals.kcal)}</td><td className="n">{onGoal}/{av.loggedDays} within ±200</td></tr>
          <tr><td>Protein</td><td className="n">{f0(av.avg.p)} g · {f1(av.avg.p / bodyKg)} g/kg</td><td className="n">{goals.p}</td><td className="n">{pHit}/{av.loggedDays} ≥ goal</td></tr>
          <tr><td>Split P / C / F</td><td className="n">{Math.round(sp.p * 100)} / {Math.round(sp.c * 100)} / {Math.round(sp.f * 100)}%</td><td className="n">{Math.round(gsp.p * 100)} / {Math.round(gsp.c * 100)} / {Math.round(gsp.f * 100)}%</td><td /></tr>
        </tbody></table></div>
      ) : <div className="needs">Log food on a few days to see averages against your goals.</div>}
    </section>
  );
}

/* ------------------------------------------------------------------ caffeine & alcohol */

function CaffeineAlcohol({ facts }: { facts: DayFacts[] }) {
  const { lowBelowMg: low, higherFromMg: high } = CAF_SLEEP;
  const last30 = facts.slice(-31, -1);
  const has = last30.some((d) => d.caffeineMg > 0);
  const lastCoffee = last30.map((d) => d.lastCaffeineMin).filter((v): v is number => v != null);
  const possible = last30.filter((d) => d.caffeineAtBed >= low && d.caffeineAtBed < high).length, higher = last30.filter((d) => d.caffeineAtBed >= high).length;
  const alcWeeks = [0, 1, 2, 3].map((k) => facts.slice(-1 - 7 * (k + 1), -1 - 7 * k).reduce((a, d) => a + d.alcoholG, 0));
  return (
    <section className="p">
      <h2>Caffeine and alcohol <span>last 30 days</span></h2>
      {has ? <>
        <div className="sub"><h3>Caffeine left at planned bedtime, per night · {low} and {high} mg lines</h3>
          <Bars label="Caffeine left at bedtime each night" pts={last30.map((d, i) => [i, d.caffeineAtBed])} lo={0} hi={Math.max(high * 1.4, ...last30.map((d) => d.caffeineAtBed))} xs={[0, last30.length - 1]} color="var(--caf)" targets={[[low, `${low} mg`], [high, `${high} mg`]]} />
        </div>
        <ul className="notes">
          <li>Average <b>{f0(mean(last30.map((d) => d.caffeineMg)))} mg</b> a day; median last caffeine at <b>{lastCoffee.length ? hm(median(lastCoffee)) : "—"}</b>.</li>
          <li>Median left at bedtime: <b>{f0(median(last30.map((d) => d.caffeineAtBed)))} mg</b>. {low}–{high} mg (could affect sleep a little for some people) on <b>{possible}</b> nights; {high}+ mg on <b>{higher}</b> of {last30.length}.</li>
          <li>Alcohol per week, last 4 weeks (newest first): <b>{alcWeeks.map((g) => `${f0(g)} g`).join(" · ")}</b>. One drink ≈ 14 g.</li>
        </ul>
      </> : <div className="needs">Log drinks for a few days to see your caffeine pattern and how much is left at bedtime.</div>}
    </section>
  );
}

/* ------------------------------------------------------------------ strength */

const PALETTE = ["var(--hr)", "var(--gym)", "var(--caf)", "var(--fat)", "var(--kcal)", "var(--supp)"];

function Strength({ now: nowMs }: { now: number }) {
  const entries = useStore((s) => s.entries);
  const templates = useStore((s) => s.templates);
  const sets = useMemo(() => entries.filter((e): e is EntryOf<"set"> => e.kind === "set"), [entries]);
  const exercises = useMemo(() => {
    const count = new Map<string, Set<string>>();
    sets.forEach((s) => count.set(s.exercise, (count.get(s.exercise) ?? new Set()).add(s.workoutId)));
    return [...count.entries()].filter(([, w]) => w.size >= 2).sort((a, b) => b[1].size - a[1].size).slice(0, 6).map(([e]) => e);
  }, [sets]);
  if (!exercises.length) return <section className="p w8"><h2>Strength <span>estimated 1-rep max</span></h2><div className="needs">Log the same exercise in two workouts to start seeing strength trends.</div></section>;
  const hist = exercises.map((e) => e1rmHistory(sets, e));
  const first = Math.min(...hist.map((h) => h[0].at)), lastT = nowMs;
  const allPct = hist.flatMap((h) => h.map((x) => (x.e1rm / h[0].e1rm) * 100));
  const target = (ex: string) => templates.flatMap((t) => t.exercises).find((x) => x.name === ex)?.reps ?? 8;
  return (
    <section className="p w8">
      <h2>Strength <span>estimated 1-rep max (Epley)</span></h2>
      <div className="twocol">
        <div className="sub"><h3>e1RM, % of where each lift started</h3>
          <LineChart label="Estimated one-rep max over time, as a percentage of the first session" series={hist.map((h, i) => ({ pts: h.map((x) => [x.at, (x.e1rm / h[0].e1rm) * 100] as [number, number]), color: PALETTE[i], end: true }))}
            lo={Math.floor(Math.min(95, ...allPct))} hi={Math.ceil(Math.max(110, ...allPct))} xs={[first, lastT]} yfmt={(v) => `${Math.round(v)}%`} xlabels={[[first, dayLabel(first).slice(4)], [lastT, "now"]]} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>{exercises.map((e, i) => <span key={e} className="muted" style={{ fontSize: 11.5 }}><i style={{ display: "inline-block", width: 10, height: 3, background: PALETTE[i], verticalAlign: "middle", marginRight: 5 }} />{e}</span>)}</div>
        </div>
        <div className="sub tw"><h3>Lifts</h3><table><tbody>
          <tr><th>Lift</th><th className="n">Last top set</th><th className="n">e1RM</th><th className="n">vs 4 wk</th><th className="n">Next</th></tr>
          {exercises.map((e, i) => {
            const h = hist[i], now = h[h.length - 1], old = [...h].reverse().find((x) => x.at <= nowMs - 28 * DAY) ?? h[0];
            const lastW = sets.filter((s) => s.workoutId === now.workoutId && s.exercise === e);
            const nx = suggestNext(lastW, target(e));
            return <tr key={e}><td>{e}</td><td className="n">{now.kg} × {now.reps}</td><td className="n">{f1(now.e1rm)}</td><td className="n">{sgn(now.e1rm - old.e1rm)}</td><td className="n">{nx ? `${nx.kg} × ${nx.reps}` : "—"}</td></tr>;
          })}
        </tbody></table>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>Next = double progression: +2.5 kg once every set of the last session hit the target reps.</p></div>
      </div>
    </section>
  );
}

function Muscles({ now }: { now: number }) {
  const entries = useStore((s) => s.entries);
  const sets = entries.filter((e): e is EntryOf<"set"> => e.kind === "set");
  const wk = setsPerMuscle(sets.filter((s) => s.at > now - 7 * DAY));
  const avg = setsPerMuscle(sets.filter((s) => s.at > now - 28 * DAY));
  const muscles = Object.keys({ ...avg, ...wk }).sort((a, b) => (avg[b] ?? 0) - (avg[a] ?? 0));
  return (
    <section className="p w4">
      <h2>Sets per muscle <span>last 7 days</span></h2>
      {muscles.length ? <div className="bars">{muscles.map((m) => { const v = wk[m] ?? 0, a = (avg[m] ?? 0) / 4; return (
        <div className="mb" key={m}><span>{m}</span><div className="trk"><i style={{ width: `${Math.min(100, (v / 20) * 100)}%`, background: v >= 10 ? "var(--gym)" : "var(--i-dim)" }} /><i style={{ left: "50%", width: 1, background: "var(--i-ink-2)", opacity: .5 }} /></div><span className="val"><b>{f1(v)}</b> · 4wk avg {f1(a)}</span></div>
      ); })}</div> : <div className="needs">No sets logged yet.</div>}
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>Marker at 10 sets, the low end of the common 10–20 sets/week guideline. Secondary muscles count half.</p>
    </section>
  );
}

/* ------------------------------------------------------------------ supplements */

function Supplements({ facts, today }: { facts: DayFacts[]; today: string }) {
  const entries = useStore((s) => s.entries);
  const supps = useStore((s) => s.supplements);
  const active = supps.filter((s) => s.active);
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, -29 + i));
  const a = adherence(entries, supps, days.slice(0, -1));
  const byDayFact = new Map(facts.map((f) => [f.day, f]));
  return (
    <section className="p">
      <h2>Supplements <span>last 30 days</span></h2>
      {active.length ? <>
        <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: "0 12px" }}>
          <div>{active.map((s) => <div key={s.id} className="muted" style={{ height: 16, fontSize: 12, lineHeight: "12px", whiteSpace: "nowrap" }}>{s.name}</div>)}</div>
          <div style={{ overflowX: "auto" }}>
            <svg viewBox={`0 0 ${days.length * 11} ${active.length * 16}`} width={days.length * 11} height={active.length * 16} role="img" aria-label="Supplements taken each day">
              {active.map((s, i) => days.map((d, k) => { const on = byDayFact.get(d)?.taken.has(s.id); return <rect key={d + s.id} x={k * 11} y={i * 16} width="9" height="12" rx="2" fill={on ? "var(--supp)" : "var(--i-line)"} fillOpacity={on ? .85 : 1} />; }))}
            </svg>
          </div>
        </div>
        <div className="tw"><table><tbody>
          <tr><th>Supplement</th><th>When</th><th className="n">Taken</th><th className="n">Rate</th></tr>
          {a.map((x) => { const s = supps.find((y) => y.id === x.suppId)!; return <tr key={x.suppId}><td>{s.name} {s.dose}</td><td>{s.slot}</td><td className="n">{x.taken}/{x.due} days</td><td className="n">{Math.round((x.taken / Math.max(1, x.due)) * 100)}%</td></tr>; })}
        </tbody></table></div>
      </> : <div className="needs">Add your stack in Log → Stack.</div>}
    </section>
  );
}

function RangeCell({ r, f = f1, unit = "" }: { r: Range; f?: (v: number) => string; unit?: string }) {
  return <>{sgn(r.value, f)}{unit} <span className="dimt">[{sgn(r.lo, f)}, {sgn(r.hi, f)}]</span></>;
}

function SuppEffects({ facts }: { facts: DayFacts[] }) {
  const supps = useStore((s) => s.supplements);
  const effects = suppEffects(facts, supps).filter((e) => e.metric === "energy" || e.metric === "mood");
  return (
    <section className="p">
      <h2>Does it do anything? <span>next day, on vs off</span></h2>
      <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Your ratings the day after taking each supplement vs the day after not taking it. To really test one, pause it for 2–3 weeks in Log → Stack. Without "off" days there's nothing to compare against.</p>
      {effects.some((e) => e.diff) && <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>This table runs {effects.filter((e) => e.diff).length} comparisons, so about {Math.max(1, Math.round(effects.filter((e) => e.diff).length * 0.05))} could look "clear" by chance alone. Trust a result that stays clear after a planned off block.</p>}
      <div className="tw"><table><tbody>
        <tr><th>Supplement</th><th>Next-day</th><th className="n">Difference [95% range]</th><th className="n">On / off days</th><th className="n" /></tr>
        {effects.map((e) => { const s = supps.find((x) => x.id === e.suppId)!; return (
          <tr key={e.suppId + e.metric}><td>{s.name}</td><td>{e.metric}</td>
            <td className="n">{e.diff ? <RangeCell r={e.diff} unit=" pts" /> : <span className="dimt">needs {e.need} more {e.off < e.on ? "off" : "on"} days</span>}</td>
            <td className="n">{e.on} / {e.off}</td>
            <td className="n">{e.diff ? <span className={`tag ${e.diff.clear ? "s" : "w"}`}>{e.diff.clear ? "clear" : "unclear"}</span> : null}</td></tr>
        ); })}
      </tbody></table></div>
    </section>
  );
}

/** Higher vs lower dose (lib/dose): shown once a supplement has been taken at two doses. */
function DoseEffects() {
  const entries = useStore((s) => s.entries);
  const supps = useStore((s) => s.supplements);
  const list = useMemo(() => doseCompare(entries, supps), [entries, supps]);
  if (!list.length) return null;
  return (
    <section className="p" id="doses">
      <h2>Higher vs lower dose <span>next day, and that night's sleep</span></h2>
      <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Days on each dose compared, once there are {DOSE_MIN_DAYS}+ of each. A dose change is also a change in time: if something else changed the same week, it shows up here too.</p>
      {list.map((c) => {
        const rows = c.rows.filter((r) => r.hi != null || r.lo != null);
        return (
          <div key={c.suppId} className="sub">
            <h3>{c.name} · {c.hi.dose} ({c.hi.days} days) vs {c.lo.dose} ({c.lo.days} days)</h3>
            {c.need > 0 && <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Needs {c.need} more day{c.need === 1 ? "" : "s"} on {c.hi.days < c.lo.days ? c.hi.dose : c.lo.dose} before it compares.</p>}
            {rows.length > 0 && <div className="tw"><table><tbody>
              <tr><th /><th className="n">{c.hi.dose}</th><th className="n">{c.lo.dose}</th><th className="n">Diff [95%]</th></tr>
              {rows.map((r) => (
                <tr key={r.metric}><td>{r.metric === "sleep" ? "sleep" : r.metric}</td>
                  <td className="n">{r.hi != null ? f1(r.hi) : "—"}</td><td className="n">{r.lo != null ? f1(r.lo) : "—"}</td>
                  <td className="n">{r.diff ? <><RangeCell r={r.diff} /> <span className={`tag ${r.diff.clear ? "s" : "w"}`}>{r.diff.clear ? (r.diff.value > 0 ? "higher: more" : "higher: less") : "unclear"}</span></> : <span className="dimt">—</span>}</td></tr>
              ))}
            </tbody></table></div>}
          </div>
        );
      })}
    </section>
  );
}

/* ------------------------------------------------------------------ correlations */

function Scatter({ p, color }: { p: Pair; color: string }) {
  const w = 160, h = 90, pad = 6;
  const xmn = Math.min(...p.xs), xmx = Math.max(...p.xs), ymn = Math.min(...p.ys), ymx = Math.max(...p.ys);
  const X = (v: number) => pad + ((v - xmn) / (xmx - xmn || 1)) * (w - pad * 2), Y = (v: number) => 4 + (1 - (v - ymn) / (ymx - ymn || 1)) * (h - pad - 4);
  const sl = slope(p.xs, p.ys), mx = mean(p.xs), my = mean(p.ys);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      {p.xs.map((x, i) => <circle key={i} cx={X(x)} cy={Y(p.ys[i])} r="1.9" fill={color} fillOpacity=".5" />)}
      {Number.isFinite(sl) && <line x1={pad} y1={Y(my + sl * (xmn - mx))} x2={w - pad} y2={Y(my + sl * (xmx - mx))} stroke="var(--i-ink)" strokeOpacity=".7" strokeWidth="1.2" />}
    </svg>
  );
}

function WhatMovesWhat({ facts }: { facts: DayFacts[] }) {
  const list = pairs(facts);
  const color = (id: string) => (id.startsWith("caf") ? "var(--caf)" : id.startsWith("alc") ? "var(--alc)" : id.startsWith("kcal") ? "var(--kcal)" : "var(--gym)");
  return (
    <section className="p w12">
      <h2>What moves what <span>cause today → effect tomorrow · last 90 days</span></h2>
      <div className="tw"><table><tbody>
        <tr><th /><th>Pair and size of the effect</th><th className="n">r [95% range]</th><th className="n">n</th><th className="n">Verdict</th></tr>
        {list.map((p) => (
          <tr key={p.id}>
            <td style={{ width: 170 }}>{p.r ? <Scatter p={p} color={color(p.id)} /> : null}</td>
            <td><b>{p.cause}</b> → {p.effect}
              <div className="muted" style={{ fontSize: 12 }}>{p.r ? (p.id === "train-mood" ? `${sgn(mean(p.ys.filter((_, i) => p.xs[i] === 1)) - mean(p.ys.filter((_, i) => p.xs[i] === 0)))} pts after training days` : `${sgn(slope(p.xs, p.ys) * (p.unitX === "mg" ? 10 : p.unitX === "kcal" ? 500 : p.unitX === "g" ? 14 : 1), (v) => v.toFixed(2))} pts per ${p.unitX === "mg" ? "10 mg" : p.unitX === "kcal" ? "500 kcal" : p.unitX === "g" ? "drink (14 g)" : p.unitX}`) : `needs ${p.need} more days with both logged`}</div></td>
            <td className="n">{p.r ? <RangeCell r={p.r} f={(v) => v.toFixed(2)} /> : "—"}</td>
            <td className="n">{p.xs.length}</td>
            <td className="n">{p.r ? <span className={`tag ${p.r.clear ? "s" : "w"}`}>{strength(p.r)}</span> : null}</td>
          </tr>
        ))}
      </tbody></table></div>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>A correlation isn't proof of cause: late caffeine and alcohol often land on the same nights. Once a wearable is connected, sleep, HRV and resting heart rate join this table.</p>
    </section>
  );
}
