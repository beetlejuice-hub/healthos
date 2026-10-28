/**
 * Watching, on screen (lib/watch; owner, 28 Oct: "make ai look out for these things … give me followup questions"; the
 * canvas's Watching boards). WatchAsk: a watch's evening question in Today's "For you" — one tap is the answer, kept as an
 * answer entry, Undo for a slip. WatchList: the AI tab's list — each with its days, your answers as little bars, what was
 * found with how sure, and Stop.
 */

import { act, offerUndo, useStore } from "../lib/store";
import { watchDue, watchKey, watchLive, watchProgress, watchSteps, type Watch } from "../lib/watch";
import { dayLabel } from "../lib/time";

const NONE: never[] = [];

export function WatchAsk({ w, now }: { w: Watch; now: number }) {
  const entries = useStore((s) => s.entries);
  if (!watchDue(w, entries, now)) return null;
  const answer = (a: string) => { const e = act.addEntry({ kind: "answer", at: Date.now(), key: watchKey(w), question: w.question, answer: a }); offerUndo([e.id], `${w.what}: ${a}`); };
  return (
    <section className="card watchask" aria-label={`Watching: ${w.what}`}>
      <h3>Watching · {w.what}</h3>
      <b>{w.question}</b>
      <div className="watch-opts">{w.options.map((o) => <button key={o} type="button" className="pill-btn" onClick={() => answer(o)}>{o}</button>)}</div>
      <small>{watchProgress(w, entries, now)} · from your note “{w.note}”</small>
    </section>
  );
}

export function WatchList({ now }: { now: number }) {
  const watches = useStore((s) => s.ai.watches ?? NONE), entries = useStore((s) => s.entries);
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
            <small>{watchLive(w, now) ? `asks “${w.question}” each evening · ${watchProgress(w, entries, now).toLowerCase()}` : `ended · ${steps.length} answers — the reads say what it showed`}</small>
            {steps.length > 0 && <span className="watch-bars" role="img" aria-label={`Your answers: ${steps.map((s) => w.options[s]).join(", ")}`}>{steps.slice(-14).map((s, i) => <i key={i} style={{ height: `${6 + (s / top) * 14}px` }} data-top={s === top || undefined} />)}</span>}
            {w.found.length > 0 && <ul className="pr-found">{w.found.map((f, i) => <li key={i}><span>{f.text}</span> <i className={`sure sure-${f.sure}`}>{f.sure}</i>{f.source && <> <a href={f.source.url} target="_blank" rel="noreferrer">{f.source.title} ↗</a></>}</li>)}</ul>}
            <small className="watch-since">since {dayLabel(w.at)} · “{w.note}”</small>
          </div>
        );
      })}
    </section>
  );
}
