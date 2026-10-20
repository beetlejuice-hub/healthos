/**
 * Not logged = not taken (owner, 20 Oct: "if i dont take a supp, like not log it, it should be taken as if i did not take
 * it. if i click in the followup that i took it, data should be modified accordingly"). This replaces the 13 Oct rule
 * (PLAN 74) that a day without a tick was unknown. A supplement on a day is:
 *   - taken: logged as taken that day (one tap, the stack's ✓, or the next morning's follow-up, which logs it then);
 *   - not taken: anything else, on a day you used the app (logged anything at all), from the first day you ever logged it;
 *   - unknown: a day with nothing logged at all (the app wasn't opened — no evidence either way), and the days before its
 *     first log (you may have been taking it before it was in the app).
 * Every engine that compares days with and without a supplement reads its days from here. Pure.
 */

import type { Entry } from "./types";
import { atMinute, localDay } from "./time";

export type SuppAnswer = { at: number; suppId: string; status: "taken" | "skipped"; /** Not logged, so not taken. */ inferred?: true };

/** What was logged, plus a "skipped" at noon for each supplement on each day you used the app without logging it. */
export function suppAnswers(entries: Entry[]): SuppAnswer[] {
  const used = new Set<string>(), first = new Map<string, string>(), answered = new Set<string>(), out: SuppAnswer[] = [];
  for (const e of entries) {
    const d = localDay(e.at);
    used.add(d);
    if (e.kind !== "supp") continue;
    out.push({ at: e.at, suppId: e.suppId, status: e.status });
    answered.add(`${d}|${e.suppId}`);
    if (!first.has(e.suppId) || d < first.get(e.suppId)!) first.set(e.suppId, d);
  }
  for (const [id, from] of first) for (const d of used) if (d >= from && !answered.has(`${d}|${id}`)) out.push({ at: atMinute(d, 12 * 60), suppId: id, status: "skipped", inferred: true });
  return out;
}

/** Each day's answer per supplement: true taken, false not (logged "didn't" or not logged), missing when unknown. */
export function suppByDay(entries: Entry[]): Map<string, Map<string, boolean>> {
  const out = new Map<string, Map<string, boolean>>();
  for (const a of suppAnswers(entries)) {
    const d = localDay(a.at), m = out.get(d) ?? new Map<string, boolean>();
    m.set(a.suppId, m.get(a.suppId) === true || a.status === "taken");
    out.set(d, m);
  }
  return out;
}
