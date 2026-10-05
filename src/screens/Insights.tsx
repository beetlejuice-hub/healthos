import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { dailyFacts, lanes } from "../lib/insights";
import { MasterGraph } from "../components/MasterGraph";
import { Glance } from "../components/Glance";
import { Mind } from "../components/Mind";
import { Connections } from "../components/Connections";
import { Body } from "../components/Body";
import { SectionBar } from "../components/SectionBar";
import { Tip } from "../components/Tip";
import { Top } from "../components/Top";
import { Coverage, Methods, SuppMatrix, TrainingLoad } from "../components/Stack";
import { glanceDays } from "../lib/glance";
import { LineChart } from "../components/Charts";
import { e1rmHistory, suggestNext } from "../lib/training";
import type { Range } from "../lib/stats";
import { addDays, dayLabel, localDay, DAY } from "../lib/time";
import type { EntryOf } from "../lib/types";
import { useNow } from "./Today";
import { notice, WINDOW_DAYS, type Report } from "../lib/findings";
import { StackCheckPanel } from "../components/StackCheck";
import { useScout, WorthALook } from "../components/Scout";
import { Experiments } from "../components/Ai";
import type { GraphFocus } from "../components/MasterGraph";
import { DOSE_MIN_DAYS, doseCompare } from "../lib/dose";

const f1 = (v: number) => v.toFixed(1);
const sgn = (v: number, f = f1) => `${v >= 0 ? "+" : "−"}${f(Math.abs(v))}`;

export function Insights() {
  const now = useNow(60_000);
  const s = useStore((x) => x);
  const today = localDay(now);
  const data = useMemo(() => lanes(s.entries, s.workouts, s.supplements, s.settings, now), [s.entries, s.workouts, s.supplements, s.settings, now]);
  const facts = useMemo(() => dailyFacts(s.entries, s.workouts, s.settings, addDays(today, -89), today), [s.entries, s.workouts, s.settings, today]);
  const sample = s.entries.some((e) => e.id.startsWith("sample:"));
  const gdays = useMemo(() => glanceDays(s.entries, s.workouts, s.settings, addDays(today, -119), today), [s.entries, s.workouts, s.settings, today]);
  const scouted = useScout();
  const [focus, setFocus] = useState<GraphFocus | null>(null);
  const [period, setPeriod] = useState<7 | 30 | 84>(30);
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
    };
  }, [s.entries, facts]);
  const locked: [string, string][] = [
    !has.strength && ["Strength", "log the same exercise in two workouts"],
    !has.sets && ["Training load", "log a workout"],
    !has.supps && ["Supplements", "tick your stack on Today"],
  ].filter((x): x is [string, string] => !!x);
  const nothing = s.entries.length === 0;

  return (
    <div className="inst">
      <header>
        <div>
          <h1>Insights</h1>
          <p>Your week against your own usual weeks — never against other people. Then every metric on one timeline, and what goes with better or worse days, with how sure each one is.</p>
        </div>
        <div className="ins-ctrls">
          {sample && <span className="badge">INCLUDES SAMPLE DATA · remove it in Settings</span>}
          {!nothing && <div className="iseg" role="group" aria-label="Period for the charts">
            {([[7, "7 days"], [30, "30 days"], [84, "12 weeks"]] as const).map(([n, l]) => <button type="button" key={n} aria-pressed={period === n} onClick={() => setPeriod(n)}>{l}</button>)}
          </div>}
        </div>
      </header>
      {nothing && <div className="needs">Nothing logged yet. Log food, drinks and supplements for a few days and this fills in — or load sample data in Settings to see what it will look like.</div>}
      <Tip />
      {!nothing && <SectionBar version={`${s.entries.length}-${period}`} />}
      {!nothing && <Glance now={now} trendDays={period} report={report} />}
      {!nothing && <div className="gl"><Top days={gdays} /></div>}
      {!nothing && <MasterGraph data={data} supplements={s.supplements} focus={focus} days={gdays} />}
      {!nothing && <Mind days={gdays} now={now} period={period} />}
      {!nothing && <Connections days={gdays} />}
      {!nothing && <Noticed report={report} />}
      {!nothing && <WorthALook items={scouted} onShow={showOnGraph} />}
      {!nothing && <Body days={gdays} period={period} now={now} />}
      {!nothing && (has.sets || has.supps) && <>
        <div className="gl-group" id="ins-training"><h2>Training &amp; stack</h2><span>what you trained, what you took</span></div>
        <div className="gl"><TrainingLoad now={now} period={period} /><SuppMatrix days={gdays} period={period} /></div>
      </>}
      <div className="pgrid">
        {has.strength && <Strength now={now} />}
        <DoseEffects />
        <Experiments />
        <StackCheckPanel />
        {locked.length > 0 && (
          <section className="p w12">
            <h2>Unlocks as you log <span>{locked.length} more sections</span></h2>
            <ul className="notes">{locked.map(([name, how]) => <li key={name}><b>{name}</b>: {how}</li>)}</ul>
          </section>
        )}
      </div>
      {!nothing && <>
        <div className="gl-group" id="ins-data"><h2>Your data</h2><span>how complete the picture is, and how the numbers are made</span></div>
        <div className="gl"><Coverage days={gdays} /><Methods /></div>
      </>}
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
  if (!exercises.length) return <section className="p w12"><h2>Strength <span>estimated 1-rep max</span></h2><div className="needs">Log the same exercise in two workouts to start seeing strength trends.</div></section>;
  const hist = exercises.map((e) => e1rmHistory(sets, e));
  const first = Math.min(...hist.map((h) => h[0].at)), lastT = nowMs;
  const allPct = hist.flatMap((h) => h.map((x) => (x.e1rm / h[0].e1rm) * 100));
  const target = (ex: string) => templates.flatMap((t) => t.exercises).find((x) => x.name === ex)?.reps ?? 8;
  return (
    <section className="p w12">
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

/* ------------------------------------------------------------------ supplements */

function RangeCell({ r, f = f1, unit = "" }: { r: Range; f?: (v: number) => string; unit?: string }) {
  return <>{sgn(r.value, f)}{unit} <span className="dimt">[{sgn(r.lo, f)}, {sgn(r.hi, f)}]</span></>;
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
