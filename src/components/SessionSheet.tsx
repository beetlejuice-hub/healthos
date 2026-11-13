/**
 * A past session, opened (PLAN 216; owner, 13 Nov: "on the latest workout session i should be able to open it, change
 * times, when it ended, and just look at what i did. nice simple ui for it … i didnt end the cardio session and not sure
 * when the app decided that its over" · "and should be able to add comment"). How it ended in words (lib/sessionend), its
 * start and end to change, the heart rate over it with the working line and the end marked, what you did, how it went,
 * and your comment.
 */

import { useMemo, useState } from "react";
import { useBand } from "../lib/band-client";
import { workingHr } from "../lib/autofinish";
import { maxHrOf } from "../lib/cardio";
import { howItEnded } from "../lib/sessionend";
import { act, useStore } from "../lib/store";
import { clock, dayLabel } from "../lib/time";
import type { Entry, Workout } from "../lib/types";
import { workoutWord } from "../lib/workoutfeel";
import { FeelSlider } from "./FeelSlider";

type SetE = Extract<Entry, { kind: "set" }>;
const MIN = 60_000;
const hhmm = (t: number) => clock(t);
/** "18:42" on the day of `ref` (the next day when it's before `after`). */
function atTime(v: string, ref: number, after?: number): number | null {
  const m = v.match(/^(\d{1,2}):(\d{2})$/); if (!m) return null;
  const d = new Date(ref); d.setHours(+m[1], +m[2], 0, 0);
  let t = d.getTime();
  if (after != null && t <= after) t += 24 * 60 * MIN;
  return t;
}

function SessionHr({ hr, start, end, line }: { hr: [number, number, ...number[]][]; start: number; end: number; line: number | null }) {
  const from = start - 10 * MIN, to = end + 30 * MIN, pts = hr.filter((m) => m[0] >= from && m[0] <= to);
  if (pts.length < 5) return null;
  const vals = pts.map((m) => m[1]), lo = Math.min(...vals, line ?? Infinity) - 5, hi = Math.max(...vals, line ?? 0) + 5;
  const X = (t: number) => ((t - from) / (to - from)) * 340, Y = (v: number) => 110 - ((v - lo) / (hi - lo)) * 100;
  return (
    <figure className="ss-hr">
      <svg viewBox="0 0 340 128" role="img" aria-label={`Heart rate from ${clock(from)} to ${clock(to)}${line ? `, the working line at ${line}` : ""}, the session ${clock(start)}–${clock(end)}`}>
        <rect x={X(start)} y={4} width={Math.max(1, X(end) - X(start))} height={108} className="ss-span" />
        {line && <><line x1={0} x2={340} y1={Y(line)} y2={Y(line)} className="ss-line" /><text x={4} y={Y(line) - 4} className="ss-t">working {line}</text></>}
        <polyline points={pts.map((m) => `${X(m[0]).toFixed(1)},${Y(m[1]).toFixed(1)}`).join(" ")} className="ss-hrl" />
        <line x1={X(end)} x2={X(end)} y1={4} y2={112} className="ss-end" />
        <text x={Math.min(300, X(end) + 4)} y={14} className="ss-t on">ended {clock(end)}</text>
        <text x={2} y={125} className="ss-t">{clock(from)}</text><text x={338} y={125} className="ss-t" textAnchor="end">{clock(to)}</text>
      </svg>
    </figure>
  );
}

export function SessionSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const workouts = useStore((s) => s.workouts), entries = useStore((s) => s.entries), settings = useStore((s) => s.settings);
  const band = useBand().data;
  const w = workouts.find((x) => x.id === id);
  const sets = useMemo(() => entries.filter((e): e is SetE => e.kind === "set" && e.workoutId === id).sort((a, b) => a.at - b.at), [entries, id]);
  const line = useMemo(() => {
    const max = maxHrOf(settings)?.bpm, r = band ? Object.keys(band.rhr).sort().slice(-7).map((d) => band.rhr[d]).filter((x) => x > 30).sort((a, b) => a - b) : [];
    return max && r.length ? workingHr(r[r.length >> 1], max) : null;
  }, [band, settings]);
  const [start, setStart] = useState(() => (w ? hhmm(w.startedAt) : "")), [end, setEnd] = useState(() => (w?.endedAt ? hhmm(w.endedAt) : ""));
  if (!w || w.endedAt == null) return null;
  const story = howItEnded(w, { others: workouts, lastSet: sets.length ? sets[sets.length - 1].at : null, line });
  const ns = atTime(start, w.startedAt), ne = ns != null ? atTime(end, w.startedAt, ns) : null;
  const changed = ns != null && ne != null && (ns !== w.startedAt || ne !== w.endedAt);
  const save = () => {
    if (ns == null || ne == null) return;
    const patch: Partial<Workout> = { startedAt: ns, endedAt: ne };
    // moved the end of one the app ended: keep how it had ended, and where (the story then says you moved it)
    const by = w.ended?.by ?? story?.by;
    if (ne !== w.endedAt && (by === "heart" || by === "timer" || by === "idle")) patch.ended = { ...(w.ended ?? { by }), was: w.ended?.was ?? w.endedAt! };
    if (w.kind === "cardio") patch.cardio = { what: w.cardio?.what || "Cardio", startedAt: ns, done: true, at: ne };
    if (w.phases?.length) patch.phases = w.phases.filter((p, i) => i === 0 || (p.start > ns && p.start < ne)).map((p, i) => (i === 0 ? { ...p, start: ns } : p));
    act.updateWorkout(w.id, patch);
  };
  const byEx = sets.reduce((m, s) => m.set(s.exercise, [...(m.get(s.exercise) ?? []), s]), new Map<string, SetE[]>());
  const mins = Math.round((w.endedAt - w.startedAt) / MIN);
  return (
    <>
      <div className="sheet-bg" onClick={onClose} aria-hidden="true" />
      <section className="sheet session" role="dialog" aria-modal="true" aria-label={`${w.template}, ${dayLabel(w.startedAt)}`}>
        <header className="ss-head"><b>{w.kind === "cardio" ? w.cardio?.what || "Cardio" : w.template}</b><span>{dayLabel(w.startedAt)} · {clock(w.startedAt)}–{clock(w.endedAt)} · {mins} min</span>
          <button type="button" className="x" aria-label="Close" onClick={onClose}>✕</button></header>
        {story && <p className={`ss-end-why${story.auto ? " auto" : ""}`} data-by={story.by}><b>How it ended</b> {story.words}</p>}
        <div className="ss-times" role="group" aria-label="Times">
          <label>Started<input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label>Ended<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          <button type="button" className="pill-btn pri" disabled={!changed} onClick={save}>Save times</button>
        </div>
        {band && <SessionHr hr={band.hr} start={w.startedAt} end={w.endedAt} line={story?.line ?? line} />}
        <div className="ss-did" aria-label="What you did">
          {w.kind === "cardio" && <p><b>{w.cardio?.what || "Cardio"}</b> · {mins} min{w.phases?.length ? ` — ${w.phases.map((p) => `${p.what}${p.km ? ` ${p.km} km` : ""}${p.incline ? ` at ${p.incline} %` : ""}`).join(", then ")}` : ""}</p>}
          {[...byEx.entries()].map(([ex, ss]) => <p key={ex}><b>{ex}</b> {ss.map((s) => `${s.warmup ? "w " : ""}${s.kg} × ${s.reps}`).join(" · ")}</p>)}
          {w.kind !== "cardio" && w.cardio && <p><b>Cardio after</b> {w.cardio.what}{w.cardio.startedAt && w.cardio.at ? ` · ${clock(w.cardio.startedAt)}–${clock(w.cardio.at)}` : w.cardio.done === false ? " · skipped" : ""}</p>}
          {!sets.length && w.kind !== "cardio" && <p className="note">No sets logged.</p>}
        </div>
        <FeelSlider label="How did it go?" name="session" value={w.rating} word={workoutWord} color="var(--gym)" onChange={(v) => act.updateWorkout(w.id, { rating: v })} />
        <label className="ss-note">Comment<textarea defaultValue={w.note ?? ""} placeholder="How it felt, what was off, anything" rows={3} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (w.note ?? "")) act.updateWorkout(w.id, { note: v || undefined }); }} /></label>
      </section>
    </>
  );
}
