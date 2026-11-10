/**
 * A running workout finishes itself when your heart rate comes down (PLAN 202; owner, 10 Nov: "Workout should be finished
 * automatically, app should detect when my heartrate started to come down … if its just for a couple minutes it should
 * ask if its just a break or finished"). lib/autofinish reads the band; this asks ("a break, or done?") or finishes it at
 * the minute it came down, with Undo. Shown on Today's running line and on the workout screen.
 */

import { useEffect, useMemo } from "react";
import { useBand } from "../lib/band-client";
import { workoutEnding, type Ending } from "../lib/autofinish";
import { maxHrOf } from "../lib/cardio";
import { act, offerUndo, useStore } from "../lib/store";
import { clock } from "../lib/time";
import type { Workout } from "../lib/types";
import { FeelSlider } from "./FeelSlider";
import { workoutWord } from "../lib/workoutfeel";

/** Your resting heart rate now: the middle of the band's last 7 days. */
const restOf = (rhr: Record<string, number>) => { const v = Object.keys(rhr).sort().slice(-7).map((d) => rhr[d]).filter((x) => x > 30).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : null; };

export function useAutoFinish(w: Workout | undefined, now: number): Ending | null {
  const { data, status } = useBand(), settings = useStore((s) => s.settings);
  const gapSec = status && status !== "off" ? status.gapSec ?? null : null;
  const e = useMemo(() => {
    const max = maxHrOf(settings)?.bpm, rest = data ? restOf(data.rhr) : null;
    if (!w || w.endedAt != null || !data || !max || !rest) return null;
    return workoutEnding(data.hr, { startedAt: w.startedAt, now, rest, max, resting: w.restUntil != null && w.restUntil > now, breakAt: w.breakAt ?? null, gapSec });
  }, [w, data, settings, now, gapSec]);
  const doneAt = e?.kind === "done" ? e.at : null;
  useEffect(() => {
    if (!w || doneAt == null) return;
    act.updateWorkout(w.id, { endedAt: doneAt, autoEnded: true, ...(w.kind === "cardio" ? { cardio: { what: w.cardio?.what || "Cardio", startedAt: w.startedAt, done: true, at: doneAt } } : {}) });
    offerUndo([], `${w.template} finished at ${clock(doneAt)} — your heart rate came down`, undefined, () => act.updateWorkout(w.id, { endedAt: null, autoEnded: undefined, breakAt: doneAt }));
  }, [w?.id, doneAt]); // eslint-disable-line react-hooks/exhaustive-deps
  return e;
}

/** "Heart rate down since 18:42 — a break, or done?" */
export function BreakOrDone({ w, e }: { w: Workout; e: Ending | null }) {
  if (e?.kind !== "pause") return null;
  return (
    <div className="breakask" role="region" aria-label="A break, or done?">
      <span>Your heart rate's been down since {clock(e.since)} — a break, or done?</span>
      <span className="acts">
        <button type="button" className="pill-btn" onClick={() => act.updateWorkout(w.id, { breakAt: e.since })}>A break</button>
        <button type="button" className="pill-btn pri" onClick={() => act.updateWorkout(w.id, { endedAt: e.since, ...(w.kind === "cardio" ? { cardio: { what: w.cardio?.what || "Cardio", startedAt: w.startedAt, done: true, at: e.since } } : {}) })}>Done</button>
      </span>
    </div>
  );
}

/**
 * For you: how the last workout went, 1–10, when it ended without one — finished by itself, or from Today's Finish —
 * within the day after it (PLAN 202: the 1–10 is what sleep, food and how you felt are compared against).
 */
export function RateWorkout({ now }: { now: number }) {
  const w = useStore((s) => [...s.workouts].reverse().find((x) => x.endedAt != null));
  if (!w || w.rating != null || w.endedAt == null || now - w.endedAt > 24 * 3_600_000) return null;
  return (
    <div className="card catchup rateworkout" role="region" aria-label="How the workout went">
      <h3>{w.template} <span>{clock(w.startedAt)}–{clock(w.endedAt)}{w.autoEnded ? " · finished by itself" : ""}</span></h3>
      <FeelSlider label="How did it go?" name="workout" value={undefined} word={workoutWord} color="var(--gym)" onChange={(v) => act.updateWorkout(w.id, { rating: v })} />
    </div>
  );
}