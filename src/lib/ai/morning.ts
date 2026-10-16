/**
 * When the morning read is written (owner, 16 Oct: "looks like app does daily read based on yyesterdays data"). It used to
 * be written from 20:00 the evening before, so its "last night" was the night before that and its "today" was yesterday.
 * Now it's written in the morning once last night is in — the band has a night ending this morning, or you rated your
 * sleep — and from 11:00 whatever came in, until 18:00. A read for today written before that morning is written again,
 * once. Pure.
 */

import type { SleepSession } from "../band";
import { atMinute, localDay } from "../time";

/** From 05:00 once last night is in, from 11:00 anyway; not after 18:00 — a "morning read" written at 20:30 is no use. */
export const MORNING = { from: 5, latest: 11, until: 18 } as const;
const H = 3_600_000;

/** Last night is in: a night (not a nap) of 3 h or more that ended this morning, or a sleep rating today. */
export function nightIn(sleep: SleepSession[] | undefined, ratedToday: boolean, now: number): boolean {
  if (ratedToday) return true;
  const today = localDay(now);
  return (sleep ?? []).some((s) => !s.nap && s.end <= now && localDay(s.end) === today && s.end - s.start >= 3 * H);
}

/** Written that morning — not the evening before (or by a version that didn't say when). */
export const freshRead = (d: { day: string; at?: number } | null | undefined): boolean => !!d && d.at != null && d.at >= atMinute(d.day, MORNING.from * 60);

/** The day to write the morning read for now, or null. */
export function digestDue(now: number, digest: { day: string; at?: number } | null, lastNight: boolean): string | null {
  const today = localDay(now), h = new Date(now).getHours();
  if (h < MORNING.from || h >= MORNING.until || (!lastNight && h < MORNING.latest)) return null;
  return digest?.day === today && freshRead(digest) ? null : today;
}
