import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readRoute } from "../lib/nav";
import { swipeTo } from "../lib/swipe";
import { useStore } from "../lib/store";
import { dailyFacts, lanes } from "../lib/insights";
import { MasterGraph } from "../components/MasterGraph";
import { Compare } from "../components/Compare";
import { SleepNights } from "../components/Sleep";
import { HeartPage } from "../components/Heart";
import { MindPage } from "../components/MindPage";
import { SuppAfter } from "../components/SuppAfter";
import { loadBandBefore, useBand } from "../lib/band-client";
import { lastNight } from "../lib/band";
import { Glance } from "../components/Glance";
import { Mind } from "../components/Mind";
import { Connections } from "../components/Connections";
import { Body } from "../components/Body";
import { SectionBar, TABS } from "../components/SectionBar";
import { Tip } from "../components/Tip";
import { Top } from "../components/Top";
import { Coverage, Methods, SuppMatrix, TrainingLoad } from "../components/Stack";
import { TrainingPage } from "../components/TrainingPage";
import { BodyLab } from "../components/BodyLab";
import { AiCheckLabel, HiddenByYou } from "../components/AiCheck";
import { glanceDays } from "../lib/glance";
import { LineChart } from "../components/Charts";
import type { Range } from "../lib/stats";
import { addDays, atMinute, dayLabel, localDay } from "../lib/time";
import { useNow } from "./Today";
import { notice, WINDOW_DAYS, type Report } from "../lib/findings";
import { StackCheckPanel } from "../components/StackCheck";
import { useScout, WorthALook } from "../components/Scout";
import { Experiments } from "../components/Ai";
import type { GraphFocus } from "../components/MasterGraph";
import { DOSE_MIN_DAYS, doseCompare } from "../lib/dose";
import { currentKg } from "../lib/body";

const f1 = (v: number) => v.toFixed(1);
const sgn = (v: number, f = f1) => `${v >= 0 ? "+" : "−"}${f(Math.abs(v))}`;

/** What each page is about, under its title. */
const PAGE_SUB: Record<string, string> = {
  week: "Your week against your own usual weeks — never against other people.",
  timeline: "Every metric on one clock. Read a day, or compare two things.",
  heart: "One day against your usual, each morning's resting heart rate and HRV, and what goes with them moving.",
  sleep: "Your own morning rating, and the band's nights.",
  mind: "How you felt, when, and around what.",
  intake: "What you ate and drank, and your weight.",
  training: "What you trained, and what you took.",
  connections: "What goes with better or worse days — with how sure each one is.",
  lab: "Your body's own numbers: fitness age, what each drink, a smoking day or late caffeine went with, when you're wound up, your body clock.",
  data: "How complete the picture is, and how the numbers are made.",
};
/** The period switch matters on these pages only. */
const PERIOD_PAGES = new Set(["week", "sleep", "mind", "intake", "training"]);

/** True on a phone-width screen, kept current. */
function usePhone() {
  const q = "(max-width: 700px)";
  const [on, setOn] = useState(() => typeof matchMedia !== "undefined" && matchMedia(q).matches);
  useEffect(() => { const m = matchMedia(q), f = () => setOn(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  return on;
}

/** A phone tab from the URL; an unknown `#insights/x` keeps the current one. */
const ALL_TABS = TABS.map(([t]) => t);
const tabOf = (t?: string) => (t && ALL_TABS.includes(t) ? t : undefined);

export function Insights() {
  const now = useNow(60_000);
  const s = useStore((x) => x);
  const band = useBand().data;
  // With the band's nights the Sleep page is the band's (components/Sleep.tsx); the old rating panels are its fallback.
  const bandNights = !!band?.sleep.some((x) => !x.nap);
  const today = localDay(now);
  const data = useMemo(() => lanes(s.entries, s.workouts, s.supplements, s.settings, now), [s.entries, s.workouts, s.supplements, s.settings, now]);
  const facts = useMemo(() => dailyFacts(s.entries, s.workouts, s.settings, addDays(today, -89), today), [s.entries, s.workouts, s.settings, today]);
  const logged = useMemo(() => new Set(facts.filter((f) => f.logged).map((f) => f.day)), [facts]);
  const sample = s.entries.some((e) => e.id.startsWith("sample:"));
  const gdays = useMemo(() => glanceDays(s.entries, s.workouts, s.settings, addDays(today, -119), today), [s.entries, s.workouts, s.settings, today]);
  const scouted = useScout();
  const [focus, setFocus] = useState<GraphFocus | null>(null);
  const [period, setPeriod] = useState<7 | 30 | 84>(30);
  // One page at a time, on a laptop (sidebar) and a phone (tabs); #insights/<page> opens one directly.
  const phone = usePhone();
  const [tab, setTab] = useState<string>(() => tabOf(readRoute()[1]) ?? "week");
  // Tabs with something in them (SectionBar finds out after render; until then assume all, so a phone never paints the whole page first).
  const [tabs, setTabs] = useState<string[]>(ALL_TABS);
  const onTabs = useCallback((ts: string[]) => setTabs((p) => (p.join() === ts.join() ? p : ts)), []);
  // The open page: one with content (else the first), and none — everything — when there is only one.
  const shown = tabs.length >= 2 ? (tabs.includes(tab) ? tab : tabs[0]) : undefined;
  // Timeline: Read (the panes) or Compare (two things against each other) — #insights/timeline/compare.
  const [cmp, setCmp] = useState(() => location.hash.split("/")[2] === "compare");
  const cmpRef = useRef(cmp);
  useEffect(() => { cmpRef.current = cmp; }, [cmp]);
  const openTab = useCallback((t: string) => { setTab(t); history.replaceState(null, "", `#insights/${t}${t === "timeline" && cmpRef.current ? "/compare" : ""}`); window.scrollTo(0, 0); }, []);
  const setMode = (on: boolean) => { setCmp(on); cmpRef.current = on; history.replaceState(null, "", `#insights/timeline${on ? "/compare" : ""}`); };
  // Swipe sideways to the next or previous tab — but not on anything that already drags sideways
  // (the timeline, its overview, the tab bar, wide tables) or on a form control.
  const inst = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = inst.current; if (!el || !shown || !phone) return;
    let start: { x: number; y: number; t: number } | null = null;
    const sideways = (n: Element | null): boolean => {
      for (; n && n !== el; n = n.parentElement) {
        if (n.matches("canvas, input, select, textarea, [role=slider], .secbar")) return true;
        if (n.scrollWidth > n.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return true;
      }
      return false;
    };
    const down = (e: TouchEvent) => { start = e.touches.length === 1 && !sideways(e.target as Element) ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: e.timeStamp } : null; };
    const up = (e: TouchEvent) => {
      if (!start) return; const p = e.changedTouches[0];
      const next = swipeTo(tabs, shown, p.clientX - start.x, p.clientY - start.y, e.timeStamp - start.t); start = null;
      if (next) openTab(next);
    };
    el.addEventListener("touchstart", down, { passive: true }); el.addEventListener("touchend", up, { passive: true });
    return () => { el.removeEventListener("touchstart", down); el.removeEventListener("touchend", up); };
  }, [shown, tabs, openTab, phone]);
  useEffect(() => { const on = () => { const t = tabOf(readRoute()[1]); if (t) setTab(t); if (t === "timeline") setCmp(location.hash.split("/")[2] === "compare"); }; addEventListener("hashchange", on); return () => removeEventListener("hashchange", on); }, []);
  const showOnGraph = (f: GraphFocus) => { setFocus(f); cmpRef.current = false; setCmp(false); openTab("timeline"); };
  const report = useMemo(() => notice(s.entries, s.goals, now, currentKg(s.entries, s.settings.bodyKg, now), { workouts: s.workouts, supplements: s.supplements, settings: s.settings }), [s.entries, s.goals, now, s.settings, s.workouts, s.supplements]);
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
      // PLAN 146: cardio on its own is training too
      cardio: s.workouts.some((w) => w.kind === "cardio" && w.endedAt != null),
    };
  }, [s.entries, s.workouts, facts]);
  const locked: [string, string][] = [
    !has.strength && ["Your lifts", "log the same exercise in three workouts"],
    !has.sets && ["Training load", "log a workout"],
    !has.supps && ["Supplements", "tick your stack on Today"],
  ].filter((x): x is [string, string] => !!x);
  const nothing = s.entries.length === 0;
  // A small live number beside each page in the laptop sidebar.
  const values = useMemo(() => {
    const v: Record<string, string> = {}, todays = s.entries.filter((e) => localDay(e.at) === today);
    const hr = band?.hr.at(-1); if (hr && now - hr[0] < 3 * 3600_000) v.heart = `${Math.round(hr[1])} bpm`;
    const night = band ? lastNight(band.sleep, now) : null;
    const rated = todays.filter((e) => e.kind === "sleep").at(-1);
    if (night?.asleepMin != null) v.sleep = `${Math.floor(night.asleepMin / 60)} h ${String(Math.round(night.asleepMin % 60)).padStart(2, "0")}`;
    else if (rated?.kind === "sleep") v.sleep = `${rated.rating}/10`;
    const moods = todays.flatMap((e) => (e.kind === "feel" && e.mood != null ? [e.mood] : []));
    if (moods.length) v.mind = (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1);
    const kcal = todays.reduce((a, e) => a + (e.kind === "food" ? e.macros.kcal : 0), 0);
    if (kcal) v.intake = `${Math.round(kcal).toLocaleString("en-GB")} kcal`;
    const week = s.workouts.filter((w) => now - w.startedAt < 7 * 86_400_000).length;
    if (week) v.training = `${week} this wk`;
    if (report.found.length) v.connections = `${report.found.length} found`;
    return v;
  }, [s.entries, s.workouts, band, now, today, report]);

  return (
    <div className="ins-shell">
    {!nothing && <SectionBar version={`${s.entries.length}-${period}-${tab}-${band ? 1 : 0}`} tab={shown ?? tab} onTabs={onTabs} onTab={openTab} values={values} />}
    <div className="inst" ref={inst} data-tab={nothing ? undefined : shown}>
      <header>
        <div>
          <h1>{shown ? TABS.find(([t]) => t === shown)?.[1] : "Insights"}</h1>
          <p>{shown ? PAGE_SUB[shown] : "Your week against your own usual weeks — never against other people. Then every metric on one timeline, and what goes with better or worse days, with how sure each one is."}</p>
        </div>
        <div className="ins-ctrls">
          {sample && <span className="badge">INCLUDES SAMPLE DATA · remove it in Settings</span>}
          {!nothing && shown === "timeline" && <div className="iseg" role="group" aria-label="Read or compare">
            <button type="button" aria-pressed={!cmp} onClick={() => setMode(false)}>Read</button>
            <button type="button" aria-pressed={cmp} onClick={() => setMode(true)}>Compare</button>
          </div>}
          {!nothing && (!shown || (PERIOD_PAGES.has(shown) && !(shown === "sleep" && bandNights))) && <div className="iseg" role="group" aria-label="Period for the charts">
            {([[7, "7 days"], [30, "30 days"], [84, "12 weeks"]] as const).map(([n, l]) => <button type="button" key={n} aria-pressed={period === n} onClick={() => setPeriod(n)}>{l}</button>)}
          </div>}
        </div>
      </header>
      {nothing && <div className="needs">Nothing logged yet. Log food, drinks and supplements for a few days and this fills in — or load sample data in Settings to see what it will look like.</div>}
      <Tip />
      {!nothing && <Glance now={now} trendDays={period} report={report} />}
      {!nothing && <div className="gl" data-sec="week"><Top days={gdays} /></div>}
      {!nothing && (cmp && shown === "timeline" ? <Compare data={data} band={band} now={now} logged={logged} />
        : <MasterGraph data={data} supplements={s.supplements} focus={focus} days={gdays} band={band} onView={loadBandBefore} />)}
      {!nothing && <HeartPage data={data} band={band} now={now} entries={s.entries} halfLifeMin={s.settings.halfLifeMin} />}
      {!nothing && <MindPage data={data} band={band} now={now} entries={s.entries} halfLifeMin={s.settings.halfLifeMin} days={gdays} period={period} />}
      {!nothing && <Mind days={gdays} now={now} period={period} />}
      {!nothing && <Connections days={gdays} />}
      {!nothing && <div data-sec="connections" className="sec-wrap"><Noticed report={report} /><WorthALook items={scouted} onShow={showOnGraph} /></div>}
      {!nothing && <BodyLab band={band} entries={s.entries} now={now} active={shown === "lab" || !shown} />}
      {!nothing && <SleepNights data={data} band={band} now={now} entries={s.entries} halfLifeMin={s.settings.halfLifeMin} />}
      {!nothing && <Body days={gdays} period={period} now={now} bandNights={bandNights} />}
      {!nothing && (has.sets || has.cardio) && <TrainingPage now={now} />}
      {!nothing && (has.sets || has.supps) && <>
        <div className="gl-group" id="ins-training" data-sec="training"><h2>Training &amp; stack</h2><span>what you trained, what you took</span></div>
        <div className="gl" data-sec="training"><TrainingLoad now={now} period={period} /><SuppMatrix days={gdays} period={period} /></div>
      </>}
      <div className="pgrid" data-sec="training">
        <DoseEffects />
        <SuppAfter band={band} data={data} />
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
        <div className="gl-group" id="ins-data" data-sec="data"><h2>Your data</h2><span>how complete the picture is, and how the numbers are made</span></div>
        <div className="gl" data-sec="data"><Coverage days={gdays} /><Methods /></div>
      </>}
    </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Noticed */

/** What the findings engine has to say: cards with their evidence, then what it's still checking. */
function Noticed({ report: all }: { report: Report }) {
  // PLAN 137: a finding he hid after the month's overall check stays out, listed under the rest
  const checks = useStore((s) => s.ai.checks);
  const hidden = new Set((checks ?? []).filter((c) => c.hidden).map((c) => c.id));
  const report = { ...all, found: all.found.filter((f) => !hidden.has(`n:${f.id}`)) };
  if (!all.found.length && !report.checking.length && !report.none.length) return null;
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
                xlabels={[[0, dayLabel(atMinute(c.firstDay, 720)).slice(4)], [days - 1, "today"]]}
                series={[{ pts: c.pts, color: "var(--wt)", dots: true, line: false, dotOpacity: 0.8 }, { pts: c.fit, color: "var(--i-ink)", width: 1.5, end: true }]} />;
            })()}
            {f.chart?.kind === "compare" && <CompareBars c={f.chart} />}
            <p className="ev">{f.evidence}</p>
            <AiCheckLabel id={`n:${f.id}`} />
          </article>
        ))}
      </div>}
      <HiddenByYou prefix="n:" />
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
