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

export type SessionPart = { name: string; start: number; end: number; cardio: boolean; /** cardio started, its end never saved */ noEnd?: true };

/**
 * A session in its parts (PLAN 217; owner, 13 Nov): lifting, then the cardio after it when that was started — each from
 * its own start to its own end. Cardio that was never closed runs to the session's end (or is a moment long, when the
 * session was closed before it) and says so. Anything else is one part. Pure.
 */
export function sessionParts(w: Workout): SessionPart[] {
  const end = w.endedAt ?? w.startedAt;
  if (w.kind === "cardio") return [{ name: w.cardio?.what || "Cardio", start: w.startedAt, end, cardio: true }];
  const c = w.cardio;
  if (c?.startedAt == null || c.done === false) return [{ name: w.template, start: w.startedAt, end, cardio: false }];
  const cs = Math.min(Math.max(c.startedAt, w.startedAt), Math.max(end, c.startedAt));
  const ce = c.done && c.at != null ? Math.max(cs, c.at) : Math.max(cs, end);
  return [{ name: w.template, start: w.startedAt, end: cs, cardio: false }, { name: c.what || "Cardio", start: cs, end: ce, cardio: true, ...(c.done && c.at != null ? {} : { noEnd: true as const }) }];
}
