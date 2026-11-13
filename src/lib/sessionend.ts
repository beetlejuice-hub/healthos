/**
 * How a session ended, in words (PLAN 216; owner, 13 Nov: "i didnt end the cardio session and not sure when the app decided
 * that its over"). From what it kept (Workout.ended) or, for older ones, worked out: your heart rate came down
 * (lib/autofinish — the last working minute, the 15 minutes under the line, and that the app looks only while it's open);
 * a cardio timer left running stopped at 3 hours; an hour with no set; another workout started; or you. Pure.
 */

import { AUTOFIN } from "./autofinish";
import { AUTO_END } from "./training";
import { clock, localDay } from "./time";
import type { Workout } from "./types";

export type EndBy = "you" | "heart" | "timer" | "idle" | "next";
export type EndStory = { by: EndBy; at: number; auto: boolean; noticed: number | null; line: number | null; words: string };

const MIN = 60_000;
const when = (t: number, ref: number) => (localDay(t) === localDay(ref) ? clock(t) : `${clock(t)} the next day`);

/** `others`: the other workouts (a start right at this end means you started the next); `lastSet`: this one's last set. */
export function howItEnded(w: Workout, o: { others: Workout[]; lastSet: number | null; line?: number | null }): EndStory | null {
  if (w.endedAt == null) return null;
  // you moved the end: say so, then how it had ended
  if (w.ended?.was != null && w.ended.was !== w.endedAt) {
    const before = howItEnded({ ...w, endedAt: w.ended.was, ended: { ...w.ended, was: undefined } }, o)!;
    return { ...before, by: "you", at: w.endedAt, auto: false, words: `You set the end to ${clock(w.endedAt)}. Before that: ${before.words.charAt(0).toLowerCase()}${before.words.slice(1)}` };
  }
  const at = w.endedAt, kept = w.ended;
  const by: EndBy = kept?.by
    ?? (w.autoEnded && w.kind === "cardio" && at - w.startedAt >= (AUTO_END.cardioMaxMin - 0.5) * MIN ? "timer"
      : w.autoEnded ? "heart"
      : o.others.some((x) => x.id !== w.id && Math.abs(x.startedAt - at) < MIN) ? "next"
      : o.lastSet != null && Math.abs(at - (o.lastSet + AUTO_END.coolDownMin * MIN)) < MIN && w.kind !== "cardio" ? "idle"
      : "you");
  const noticed = kept?.noticed ?? null, line = kept?.line ?? o.line ?? null;
  const seen = noticed != null && noticed - at > 2 * MIN ? ` The app noticed at ${when(noticed, at)} — it checks only while it's open, then sets the end back to when it happened.` : "";
  const words = by === "heart"
    ? `Ended by itself: your heart rate was last at working level${line ? ` (${line} bpm or more)` : ""} at ${clock(at - MIN)}. After ${AUTOFIN.doneMin} minutes under it, the app counted the session over from ${clock(at)}.${seen || (noticed == null ? " It checks only while the app is open, so it may have noticed later." : "")}`
    : by === "timer" ? `Ended by itself: the timer was left running, so the app stopped it after ${AUTO_END.cardioMaxMin / 60} hours, at ${clock(at)}.${seen} If you stopped earlier, set the end below.`
    : by === "idle" ? `Ended by itself: no set for an hour, so it ended ${AUTO_END.coolDownMin} minutes after your last one${o.lastSet ? ` (${clock(o.lastSet)})` : ""}, at ${clock(at)}.${seen}`
    : by === "next" ? `Ended when you started your next workout, at ${clock(at)}.`
    : `You finished it at ${clock(at)}.`;
  return { by, at, auto: by !== "you" && by !== "next", noticed, line, words };
}
