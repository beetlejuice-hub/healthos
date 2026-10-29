/**
 * Cigarettes, one question a day (PLAN 177; owner, 27 Oct: "we could implement a small tick that says cigarettes...or like a
 * better way to track smoking days and not" — then "cigarettes lets do B": "i may not log them immediately"). Asked before
 * bed (from 20:00, and past midnight for the evening just ending), and in the next morning's catch-up if it was missed.
 * Kept as an answer on that day (key smoke:<day>): None, 1–2, 3–5 or 6+ — counted at the middle of the band. Pure.
 */

import type { Entry } from "./types";
import { addDays, atMinute, localDay, minuteOfDay } from "./time";

/** askFrom: the evening's question from this minute; morningTo: the morning catch-up asks about yesterday until then. */
export const SMOKE = { askFrom: 20 * 60, nightEnds: 4 * 60, morningTo: 14 * 60 } as const;
export const SMOKE_BANDS = ["0", "1-2", "3-5", "6+"] as const;
export type SmokeBand = (typeof SMOKE_BANDS)[number];
export const SMOKE_LABEL: Record<SmokeBand, string> = { "0": "None", "1-2": "1–2", "3-5": "3–5", "6+": "6+" };
/** A band as a number, for the averages and the tests: its middle. */
export const SMOKE_MID: Record<SmokeBand, number> = { "0": 0, "1-2": 1.5, "3-5": 4, "6+": 7 };
export const smokeKey = (day: string) => `smoke:${day}`;
/**
 * "Don't remember" (reform T1; owner, 29 Oct: "keep it, w the option to skip, so if i dont remember something i can just
 * skip"): kept as the day's answer so it isn't asked again — and never read as a number, so the day stays unknown.
 */
export const SMOKE_UNSURE = "don't remember";
export const SMOKE_QUESTION = "Cigarettes that day?";

/** The days with an answer of any kind, "don't remember" too: not asked again. */
export const smokeAnswered = (entries: Entry[]) => new Set(entries.flatMap((e) => (e.kind === "answer" && e.key.startsWith("smoke:") ? [e.key.slice(6)] : [])));

/** What you said, by day (the latest answer wins). */
export function smokeSaid(entries: Entry[]): Map<string, SmokeBand> {
  const out = new Map<string, SmokeBand>();
  for (const e of [...entries].sort((a, b) => a.at - b.at)) if (e.kind === "answer" && e.key.startsWith("smoke:") && (SMOKE_BANDS as readonly string[]).includes(e.answer)) out.set(e.key.slice(6), e.answer as SmokeBand);
  return out;
}

/**
 * What to ask now, or null: tonight's (from 20:00, or before 04:00 for the evening just ending), else yesterday's in the
 * morning (until 14:00) when it wasn't answered. Never in the afternoon, never twice.
 */
export function smokeAsk(entries: Entry[], now: number): { day: string; when: "tonight" | "yesterday" } | null {
  const m = minuteOfDay(now), today = localDay(now), said = smokeAnswered(entries);
  if (m < SMOKE.nightEnds) { const d = addDays(today, -1); return said.has(d) ? null : { day: d, when: "tonight" }; }
  if (m >= SMOKE.askFrom) return said.has(today) ? null : { day: today, when: "tonight" };
  if (m < SMOKE.morningTo) { const d = addDays(today, -1); return said.has(d) ? null : { day: d, when: "yesterday" }; }
  return null;
}

/** The answer kept on that day, at 21:00 — so it's that day's however late it was given. */
export const smokeEntry = (day: string, band: SmokeBand | typeof SMOKE_UNSURE) => ({ kind: "answer" as const, at: atMinute(day, 21 * 60), key: smokeKey(day), question: SMOKE_QUESTION, answer: band });
