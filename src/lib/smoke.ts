/**
 * Cigarettes, one question a day (PLAN 177; owner, 27 Oct: "we could implement a small tick that says cigarettes...or like a
 * better way to track smoking days and not" — then "cigarettes lets do B": "i may not log them immediately"). Always about
 * yesterday (owner, 9 Nov: "it should ask abput yesterday, always"): from 04:00 until it's answered — not "today?" in the
 * evening, when the day isn't over.
 * Kept as an answer on that day (key smoke:<day>): None, 1–2, 3–5 or 6+ — counted at the middle of the band. Pure.
 */

import type { Entry } from "./types";
import { addDays, atMinute, localDay, minuteOfDay } from "./time";

/** nightEnds: before this minute the night's still on, and nothing's asked. */
export const SMOKE = { nightEnds: 4 * 60 } as const;
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

/** What to ask now, or null: yesterday's, from 04:00, while it isn't answered. Never about today, never twice. */
export function smokeAsk(entries: Entry[], now: number): { day: string; when: "yesterday" } | null {
  if (minuteOfDay(now) < SMOKE.nightEnds) return null;
  const d = addDays(localDay(now), -1);
  return smokeAnswered(entries).has(d) ? null : { day: d, when: "yesterday" };
}

/** The answer kept on that day, at 21:00 — so it's that day's however late it was given. */
export const smokeEntry = (day: string, band: SmokeBand | typeof SMOKE_UNSURE) => ({ kind: "answer" as const, at: atMinute(day, 21 * 60), key: smokeKey(day), question: SMOKE_QUESTION, answer: band });
