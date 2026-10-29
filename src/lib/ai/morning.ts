/**
 * When the morning read is written (owner, 16 Oct: "looks like app does daily read based on yyesterdays data"). It used to
 * be written from 20:00 the evening before, so its "last night" was the night before that and its "today" was yesterday.
 * Now it's written in the morning once last night is in — the band has a night ending this morning, or you rated your
 * sleep — and from 11:00 whatever came in, until 18:00. A read for today written before that morning is written again,
 * once. Pure.
 */

import type { SleepSession } from "../band";
import { addDays, atMinute, localDay } from "../time";

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

/**
 * Which read is on Today (PLAN 155; owner, 21 Oct: "make sure it does not sit for long. like if i get them at yesterday
 * morning, it should not be there/ or the same at next morning, asking about 2 days from before"). Each read until the
 * next one replaces it: the morning read until that evening's read is written, and never past 04:00 the next night; the
 * evening read until the next morning read is written, and never past noon the day after. Pure.
 */
export const SHOWN = { morningUntil: 4, nightUntil: 12 } as const;
type Read = { day: string; at?: number } | null | undefined;

export function morningShown(d: Read, night: Read, now: number): boolean {
  if (!d || !freshRead(d) || now < d.at!) return false;
  if (night && night.day === d.day && night.at != null && night.at > d.at! && night.at <= now) return false;
  return now < atMinute(addDays(d.day, 1), SHOWN.morningUntil * 60);
}

/**
 * When the morning read leaves For you by itself (reform T3: "At 12:00 it moves to “Done today: morning read ›” on its
 * own. It's still one tap away."): noon, but never before it's had 2 hours — one written at your first open at 13:00
 * stays till 15:00. Pure.
 */
export const AWAY = { morning: 12, minH: 2 } as const;
export const morningAway = (d: Read, now: number): boolean => !!d && d.at != null && now >= Math.max(atMinute(d.day, AWAY.morning * 60), d.at + AWAY.minH * H);

export function nightShown(n: Read, morning: Read, now: number): boolean {
  if (!n || n.at == null || now < n.at) return false;
  if (morning && freshRead(morning) && morning.day > n.day && morning.at! > n.at && morning.at! <= now) return false;
  return now < atMinute(addDays(n.day, 1), SHOWN.nightUntil * 60);
}
