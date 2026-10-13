/**
 * Supplements logged like food (PLAN 87; owner, 13 Oct: "rn its like took or not - i want it to be able to log almost like
 * food - one click, but i can log morning and night too if i take something twice"). One tap logs an intake now:
 * - the plan has it in this part of the day and it isn't answered yet → the tap is that answer;
 * - it was answered "didn't take" → it becomes "took";
 * - otherwise it's another intake (`again`), on top of the first.
 * The plan's ✓ / ✗ stay as they are: "didn't take" is what lets the app compare days with and without (PLAN 74). Pure.
 */

import { answerSlot, slotOf, slotsOf, type Entry, type EntryOf, type Supplement } from "./types";
import { localDay, minuteOfDay } from "./time";

export type Intake = { op: "add"; entry: Omit<EntryOf<"supp">, "id"> } | { op: "update"; id: string; patch: Partial<EntryOf<"supp">> };

/** What one tap on "+ name" does at `now`. */
export function logIntake(s: Supplement, entries: Entry[], now: number): Intake {
  const slot = slotOf(minuteOfDay(now)), day = localDay(now);
  const answer = entries.find((e): e is EntryOf<"supp"> => e.kind === "supp" && e.suppId === s.id && !e.again && localDay(e.at) === day && answerSlot(e, s) === slot);
  if (answer?.status === "skipped") return { op: "update", id: answer.id, patch: { status: "taken", at: now } };
  return { op: "add", entry: { kind: "supp", at: now, suppId: s.id, status: "taken", slot, ...(answer ? { again: true as const } : {}) } };
}

/** Intakes on `day` the plan didn't ask for: another one in a slot already answered, or one in a slot it isn't planned in. */
export function extrasOn(entries: Entry[], supplements: Supplement[], day: string): EntryOf<"supp">[] {
  return entries.filter((e): e is EntryOf<"supp"> => {
    if (e.kind !== "supp" || e.status !== "taken" || localDay(e.at) !== day) return false;
    const s = supplements.find((x) => x.id === e.suppId);
    return !!s && (!!e.again || !slotsOf(s).includes(answerSlot(e, s)));
  });
}

/** How many times each supplement was taken on `day`. */
export function takenCount(entries: Entry[], day: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) if (e.kind === "supp" && e.status === "taken" && localDay(e.at) === day) out.set(e.suppId, (out.get(e.suppId) ?? 0) + 1);
  return out;
}
