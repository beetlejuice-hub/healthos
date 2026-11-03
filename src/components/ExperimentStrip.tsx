/**
 * The experiments you're running, on Today (PLAN 160; owner, 21 Oct: "make experiments easier to find … start on these"):
 * one line each — its day and what to do today; when it's done, the result until you've opened it. A tap opens it on
 * Insights → Training (lib/ai/experiment experimentStrip).
 */

import { useMemo } from "react";
import { act, getState, offerUndo, useStore, type Experiment } from "../lib/store";
import { experimentStrip } from "../lib/ai/experiment";
import { XP, xpCounted, xpEnd, xpSkipped, xpToAsk } from "../lib/ai/xpdays";
import { judge } from "../lib/ai/apply";
import { dailyFacts } from "../lib/insights";
import { addDays, dayLabel, localDay } from "../lib/time";
import { go } from "../lib/nav";

export function ExperimentStrip({ now }: { now: number }) {
  const xs = useStore((s) => s.ai.experiments), entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), settings = useStore((s) => s.settings);
  const today = localDay(now);
  const lines = useMemo(() => {
    // the 120 days of facts only when one has finished without a verdict (the app's own result is shown then)
    let facts: ReturnType<typeof dailyFacts> | null = null;
    return experimentStrip(xs, today, (x) => judge(x, (facts ??= dailyFacts(entries, workouts, settings, addDays(today, -120), addDays(today, -1))), today).state);
  }, [xs, entries, workouts, settings, today]);
  if (!lines.length) return null;
  const open = (id: string, done: boolean) => {
    if (done) act.setAi((a) => ({ experiments: a.experiments.map((x) => (x.id !== id ? x : x.verdict ? { ...x, verdict: { ...x.verdict, seen: Date.now() } } : { ...x, seen: Date.now() })) }));
    go("insights", "training");
    setTimeout(() => document.getElementById("experiments")?.scrollIntoView({ block: "start", behavior: "smooth" }), 250);
  };
  return (
    <ul className="xp-strip" aria-label="Your experiments">
      {lines.map((l) => (
        <li key={l.id} data-done={l.done || undefined}>
          <button type="button" onClick={() => open(l.id, l.done)}><span aria-hidden="true">🧪</span><b>{l.text}</b><span className="xp-sub">{l.sub}</span><span className="chev" aria-hidden="true">›</span></button>
        </li>
      ))}
    </ul>
  );
}

const atNoon = (d: string) => new Date(`${d}T12:00`).getTime();
/** "Thu 19 Nov": an experiment's last day. */
export const xpLastDay = (x: Experiment) => dayLabel(atNoon(addDays(xpEnd(x), -1)));

/** Mark a day of an experiment done or not (PLAN 189), with Undo putting the answer back as it was. */
export function markDay(id: string, day: string, yes: boolean, label?: string) {
  const was = (x: Experiment) => x.did?.[day];
  const prev = getState().ai.experiments.find((x) => x.id === id);
  const before = prev ? was(prev) : undefined;
  const set = (v: boolean | undefined) => act.setAi((a) => ({ experiments: a.experiments.map((x) => {
    if (x.id !== id) return x;
    const did = { ...(x.did ?? {}) };
    if (v == null) delete did[day]; else did[day] = v;
    return { ...x, did };
  }) }));
  set(yes);
  if (label) offerUndo([], label, undefined, () => set(before));
}

/**
 * The morning's question (PLAN 189; owner, 3 Nov: "follow up every morning on last days experiment- if i did it or not. If
 * not it should skip that day"): yesterday — did you? For each day of it in the last 3 not answered yet. "Didn't" leaves
 * the day out and the experiment runs a day longer (lib/ai/xpdays).
 */
export function ExperimentDid({ x, now }: { x: Experiment; now: number }) {
  const today = localDay(now), days = new Date(now).getHours() >= XP.from ? xpToAsk(x, today) : [];
  if (!days.length) return null;
  const yday = addDays(today, -1), out = xpSkipped(x).length;
  const answer = (d: string, yes: boolean) => {
    const when = d === yday ? "yesterday" : dayLabel(atNoon(d));
    const after = { ...x, did: { ...(x.did ?? {}), [d]: yes } };
    markDay(x.id, d, yes, yes ? `${x.name}: did it ${when}` : `${when.charAt(0).toUpperCase()}${when.slice(1)} left out — ${x.name} now runs to ${xpLastDay(after)}`);
  };
  return (
    <section className="card xpdid" aria-label={`Experiment: ${x.name}`}>
      <h3>Experiment · {Math.min(xpCounted(x, today), x.days)} of {x.days} days{out ? ` · ${out} left out` : ""}</h3>
      <b>{x.name}</b>
      {x.how && <small>{x.how}</small>}
      {days.map((d) => (
        <div key={d} className="xpdid-row">
          <span>{d === yday ? "Yesterday" : dayLabel(atNoon(d))} — did you?</span>
          <div className="watch-opts">
            <button type="button" className="pill-btn" onClick={() => answer(d, true)}>Did it</button>
            <button type="button" className="pill-btn" onClick={() => answer(d, false)}>Didn't</button>
          </div>
        </div>
      ))}
      <small>A day you didn't is left out, and it runs a day longer — {x.days} days means {x.days} done. Now to {xpLastDay(x)}.</small>
    </section>
  );
}

/** Insights: its days as squares — done, left out, to come; a tap on a past one changes it. */
export function ExperimentDays({ x, today }: { x: Experiment; today: string }) {
  const end = xpEnd(x), all: string[] = [];
  for (let d = x.start; d < end && all.length < XP.stretch * x.days; d = addDays(d, 1)) all.push(d);
  return (
    <div className="xp-days" role="group" aria-label={`${x.name}: its days`}>
      {all.map((d) => {
        const past = d < today && !x.ended, v = x.did?.[d], st = x.ended && d >= x.ended ? "stopped" : d >= today ? "tocome" : v === false ? "out" : "done";
        const say = `${dayLabel(atNoon(d))}: ${st === "stopped" ? "after you stopped it" : st === "tocome" ? "to come" : st === "out" ? "left out — you didn't" : v ? "done" : "counted (not answered)"}`;
        return <button key={d} type="button" className={`xp-sq ${st}${v == null && st === "done" ? " unsaid" : ""}`} disabled={!past} title={say} aria-label={say}
          onClick={() => markDay(x.id, d, v === false, `${dayLabel(atNoon(d))}: ${v === false ? "done" : "left out"}`)} />;
      })}
    </div>
  );
}
