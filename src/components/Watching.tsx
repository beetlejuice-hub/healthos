/**
 * Watching, on screen (lib/watch; owner, 28 Oct: "make ai look out for these things … give me followup questions"; the
 * canvas's Watching boards). WatchAsk: a watch's evening question in Today's "For you" — one tap is the answer, kept as an
 * answer entry, Undo for a slip. WatchList: the AI tab's list — each with its days, your answers as little bars, what was
 * found with how sure, and Stop. Phase 2: "Your data" on each (lib/watch watchFindings) with early / not clear / clear,
 * and a watch tied to a walk or a session asks 30 minutes after it instead of each evening.
 */

import { act, offerUndo, useStore } from "../lib/store";
import { watchAfterOf, watchDue, watchFindings, watchKey, watchLive, watchProgress, watchSteps, type Watch, type WatchFinding } from "../lib/watch";
import { clock, dayLabel } from "../lib/time";

const NONE: never[] = [];

/** "Your data: … EARLY" — what the app's own test says, never more than it can. */
function Findings({ fs }: { fs: WatchFinding[] }) {
  return <ul className="watch-data">{fs.map((f, i) => <li key={i}><span>Your data:</span> {f.text} <i className={`sure wd-${f.label.replace(" ", "")}`}>{f.label}</i></li>)}</ul>;
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
  const shown = watches.filter((w) => !w.stopped).sort((a, b) => Number(watchLive(b, now)) - Number(watchLive(a, now)) || b.at - a.at);
  if (!shown.length) return null;
  const live = shown.filter((w) => watchLive(w, now)).length;
  return (
    <section className="card watchlist" aria-label="Watching">
      <h3>Watching · {live} <span>from your notes</span></h3>
      {shown.map((w) => {
        const steps = watchSteps(w, entries), top = Math.max(1, w.options.length - 1);
        return (
          <div key={w.id} className="watch-item" data-live={watchLive(w, now) || undefined}>
            <div className="watch-top"><b>{w.what}</b><button type="button" className="linkish" onClick={() => act.setAi((a) => ({ watches: (a.watches ?? []).map((x) => (x.id === w.id ? { ...x, stopped: Date.now() } : x)) }))}>Stop</button></div>
            <small>{watchLive(w, now) ? `asks “${w.question}” ${w.afterMin && w.cause ? `${w.afterMin} min after each ${w.cause.name.toLowerCase()}` : "each evening"} · ${watchProgress(w, entries, now).toLowerCase()}` : `ended · ${steps.length} answers — the reads say what it showed`}</small>
            {steps.length > 0 && <span className="watch-bars" role="img" aria-label={`Your answers: ${steps.map((s) => w.options[s]).join(", ")}`}>{steps.slice(-14).map((s, i) => <i key={i} style={{ height: `${6 + (s / top) * 14}px` }} data-top={s === top || undefined} />)}</span>}
            {w.cause && <Findings fs={watchFindings(w, { entries, workouts }, now)} />}
            {w.found.length > 0 && <ul className="pr-found">{w.found.map((f, i) => <li key={i}><span>{f.text}</span> <i className={`sure sure-${f.sure}`}>{f.sure}</i>{f.source && <> <a href={f.source.url} target="_blank" rel="noreferrer">{f.source.title} ↗</a></>}</li>)}</ul>}
            <small className="watch-since">since {dayLabel(w.at)} · “{w.note}”</small>
          </div>
        );
      })}
    </section>
  );
}
