/**
 * Watching, on screen (lib/watch; owner, 28 Oct: "make ai look out for these things … give me followup questions"; the
 * canvas's Watching boards). WatchAsk: a watch's evening question in Today's "For you" — one tap is the answer, kept as an
 * answer entry, Undo for a slip. WatchList: the AI tab's list — each with its days, your answers as little bars, what was
 * found with how sure, and Stop. Phase 2: "Your data" on each (lib/watch watchFindings) with early / not clear / clear,
 * and a watch tied to a walk or a session asks 30 minutes after it instead of each evening. Phase 3: WatchOfferAsk — a low
 * check-in brings your own fix, with your data and the studies ("Start a walk" starts the timer, so its after-question
 * follows); WatchDoneAsk — what a finished watch showed, then two more weeks or done.
 */

import { act, offerUndo, useStore } from "../lib/store";
import { tryKey, watchAfterOf, watchDay, watchDue, watchFindings, watchKey, watchLive, watchOffer, watchProgress, watchSteps, watchVerdict, type Watch, type WatchFinding } from "../lib/watch";
import { clock, dayLabel } from "../lib/time";

const NONE: never[] = [];

/** "Your data: … EARLY" — what the app's own test says, never more than it can. */
function Findings({ fs }: { fs: WatchFinding[] }) {
  return <ul className="watch-data">{fs.map((f, i) => <li key={i}><span>Your data:</span> {f.text} <i className={`sure wd-${f.label.replace(" ", "")}`}>{f.label}</i></li>)}</ul>;
}

const FEEL_NAME = { mood: "Mood", energy: "Energy", focus: "Focus", stress: "Stress" } as const;
const patch = (id: string, p: Partial<Watch>) => act.setAi((a) => ({ watches: (a.watches ?? []).map((x) => (x.id === id ? { ...x, ...p } : x)) }));

/** A low check-in: your own fix (owner, 28 Oct: "propose it when i log a bad mood, low energy etc"). */
export function WatchOfferAsk({ now }: { now: number }) {
  const watches = useStore((s) => s.ai.watches ?? NONE), entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts);
  const o = watchOffer(watches, { entries, workouts }, now);
  if (!o) return null;
  const say = (answer: string) => act.addEntry({ kind: "answer", at: Date.now(), key: tryKey(o.w), question: `${FEEL_NAME[o.feel]} ${o.value} — your watch: "${o.w.note}"`, answer });
  const c = o.w.cause!, study = o.w.found[0];
  return (
    <section className="card watchoffer" aria-label="Your own fix">
      <h3>{FEEL_NAME[o.feel]} {o.value} <span>you said it helps</span></h3>
      <q>{o.w.note}</q>
      {o.finding && <Findings fs={[o.finding]} />}
      {study && <p className="watch-study"><span>Studies:</span> {study.text} <i className={`sure sure-${study.sure}`}>{study.sure}</i>{study.source && <> <a href={study.source.url} target="_blank" rel="noreferrer">{study.source.title} ↗</a></>}</p>}
      <div className="watch-opts">
        {c.kind === "cardio"
          ? <button type="button" className="pill-btn pri" onClick={() => { act.startCardio(c.name); say("doing it"); }}>Start a {c.name.toLowerCase()}</button>
          : <button type="button" className="pill-btn pri" onClick={() => say("doing it")}>Doing it</button>}
        <button type="button" className="pill-btn" onClick={() => say("not now")}>Not now</button>
      </div>
      {o.w.afterMin && <small>{o.w.afterMin} minutes after, it asks “{o.w.question}” — your answer is data for next time.</small>}
    </section>
  );
}

/** A watch that's run its days: what it showed, then two more weeks or done. */
export function WatchDoneAsk({ w, now }: { w: Watch; now: number }) {
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts);
  const v = watchVerdict(w, { entries, workouts }, now);
  if (!v || w.closed || watchDay(w, now) > w.days + 3) return null;
  return (
    <section className="card watchdone" aria-label={`What ${w.what} showed`}>
      <h3>Watching · done <span>{w.what}</span></h3>
      <p>{v}</p>
      <div className="watch-opts">
        <button type="button" className="pill-btn pri" onClick={() => patch(w.id, { days: w.days + 14 })}>Two more weeks</button>
        <button type="button" className="pill-btn" onClick={() => patch(w.id, { closed: Date.now() })}>End it</button>
      </div>
    </section>
  );
}

export function WatchAsk({ w, now }: { w: Watch; now: number }) {
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts);
  if (!watchDue(w, entries, now, workouts)) return null;
  const after = watchAfterOf(w, { entries, workouts }, now), fs = watchFindings(w, { entries, workouts }, now);
  const answer = (a: string) => { const e = act.addEntry({ kind: "answer", at: Date.now(), key: watchKey(w), question: w.question, answer: a }); offerUndo([e.id], `${w.what}: ${a}`); };
  return (
    <section className="card watchask" aria-label={`Watching: ${w.what}`}>
      <h3>Watching · {w.what}</h3>
      <b>{w.question}</b>
      {after != null && w.cause && <small>{w.cause.name} at {clock(after)} — how is it now?</small>}
      <div className="watch-opts">{w.options.map((o) => <button key={o} type="button" className="pill-btn" onClick={() => answer(o)}>{o}</button>)}</div>
      {fs.length > 0 && <Findings fs={fs} />}
      <small>{watchProgress(w, entries, now)} · from your note “{w.note}”</small>
    </section>
  );
}

export function WatchList({ now }: { now: number }) {
  const watches = useStore((s) => s.ai.watches ?? NONE), entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts);
  // stopped ones go; finished ones stay a month with what they showed
  const shown = watches.filter((w) => !w.stopped && watchDay(w, now) <= w.days + 30).sort((a, b) => Number(watchLive(b, now)) - Number(watchLive(a, now)) || b.at - a.at);
  if (!shown.length) return null;
  const live = shown.filter((w) => watchLive(w, now)).length;
  return (
    <section className="card watchlist" aria-label="Watching">
      <h3>Watching · {live} <span>from your notes</span></h3>
      {shown.map((w) => {
        const steps = watchSteps(w, entries), top = Math.max(1, w.options.length - 1);
        return (
          <div key={w.id} className="watch-item" data-live={watchLive(w, now) || undefined}>
            <div className="watch-top"><b>{w.what}</b><button type="button" className="linkish" onClick={() => patch(w.id, { stopped: Date.now() })}>{watchLive(w, now) ? "Stop" : "Remove"}</button></div>
            {watchLive(w, now) ? <small>asks “{w.question}” {w.afterMin && w.cause ? `${w.afterMin} min after each ${w.cause.name.toLowerCase()}` : "each evening"} · {watchProgress(w, entries, now).toLowerCase()}</small>
              : <p className="watch-verdict"><span>What it showed:</span> {watchVerdict(w, { entries, workouts }, now)}{!w.closed && <> <button type="button" className="linkish" onClick={() => patch(w.id, { days: w.days + 14 })}>Two more weeks</button></>}</p>}
            {steps.length > 0 && <span className="watch-bars" role="img" aria-label={`Your answers: ${steps.map((s) => w.options[s]).join(", ")}`}>{steps.slice(-14).map((s, i) => <i key={i} style={{ height: `${6 + (s / top) * 14}px` }} data-top={s === top || undefined} />)}</span>}
            {w.cause && watchLive(w, now) && <Findings fs={watchFindings(w, { entries, workouts }, now)} />}
            {w.found.length > 0 && <ul className="pr-found">{w.found.map((f, i) => <li key={i}><span>{f.text}</span> <i className={`sure sure-${f.sure}`}>{f.sure}</i>{f.source && <> <a href={f.source.url} target="_blank" rel="noreferrer">{f.source.title} ↗</a></>}</li>)}</ul>}
            <small className="watch-since">since {dayLabel(w.at)} · “{w.note}”</small>
          </div>
        );
      })}
    </section>
  );
}
