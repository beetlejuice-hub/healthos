/**
 * Saved for later (PLAN 159; owner, 21 Oct: "i reaaally liked the morning digest, liked the study, thing to try … can make
 * it better if possible" — the reads are replaced by the next one, so a study or a thing to try you wanted to come back
 * to was gone). Any read item can be saved; it stays in the AI tab until you remove it, can be marked tried, and an
 * untried one comes up as a follow-up question a couple of days later. Pure.
 */

import type { DigestItem } from "./tasks";
import { DAY, dayLabel } from "../time";

export type Saved = DigestItem & { id: string; savedAt: number; from: "morning" | "evening"; day: string; tried?: number };
export const SAVED = { max: 30, followAfterDays: 2, followMax: 3 } as const;

const same = (a: { title: string }, b: { title: string }) => a.title.trim().toLowerCase() === b.title.trim().toLowerCase();
export const isSaved = (list: Saved[] | undefined, item: { title: string }) => (list ?? []).some((s) => same(s, item));

/** Save it, or unsave it if it's saved — newest first, the oldest dropped past the cap. */
export function toggleSaved(list: Saved[] | undefined, item: DigestItem, from: Saved["from"], day: string, now: number): Saved[] {
  const l = list ?? [];
  if (isSaved(l, item)) return l.filter((s) => !same(s, item));
  return [{ ...item, id: `${day}:${from}:${now}`, savedAt: now, from, day }, ...l].slice(0, SAVED.max);
}

/** For a read's follow-up question: saved and not tried, saved long enough ago to have had a chance, newest first. */
export function savedFollowups(list: Saved[] | undefined, now: number): string[] {
  return (list ?? []).filter((s) => !s.tried && now - s.savedAt >= SAVED.followAfterDays * DAY).slice(0, SAVED.followMax)
    .map((s) => `you saved this ${dayLabel(s.savedAt)}: ${s.title}${s.tip ? ` — "${s.tip}"` : ""}`);
}
