/**
 * One engine, one set of words (PLAN 188 phase 2; owner, 3 Nov: "make a thorough investigation of how findings, and compare
 * engines work and come up w a better fixd solution" — then "1 and 2"). Noticed's test is the one test: each question
 * (cause → outcome, its lag) answered with weekends, the day before and slow drift taken out, false alarms controlled
 * across every question at once (Benjamini–Hochberg 10 %), the same direction in both halves of the days. Connections'
 * rows that ask the same thing — drinks, late caffeine, training, each supplement, against mood, energy, stress and that
 * night's sleep — read its answer instead of their own raw with/without test, so the two pages can't disagree.
 *
 * The words, everywhere: clear (passed all of it and big enough to matter) · likely (the same way in both halves and under
 * 5 % on its own, not yet past the correction) · no effect (enough days, any effect too small to matter) · early (not
 * enough yet, or could be chance). Pure.
 */

import type { DayFacts } from "./insights";
import type { Supplement } from "./types";
import { questions, runAll, type Result } from "./detectors/effects";
import type { Claim } from "./record";
import { median } from "./stats";

export type Word = "clear" | "likely" | "early" | "no effect";
export const WORD_TEXT: Record<Word, string> = { clear: "clear", likely: "likely", early: "early · could be chance", "no effect": "no effect" };

/** One result in words. */
export function wordOf(r: Result): Word {
  if (r.status === "found") return "clear";
  if (r.status === "none") return "no effect";
  if (r.b != null && r.enough && r.p < 0.05 && r.replicated && Math.abs(r.b) >= r.o.minEffect) return "likely";
  return "early";
}

export type Evidence = Map<string, { word: Word; r: Result }>;
const RANK: Record<Word, number> = { clear: 3, likely: 2, "no effect": 1, early: 0 };

/** Every question the app asks, answered once: by "<group>:<outcome>" (the stronger of a group's two ways of asking it). */
export function evidence(facts: DayFacts[], supplements: Supplement[]): Evidence {
  const k = facts.map((d) => d.kcal).filter((x): x is number => x != null), usual = k.length >= 7 ? median(k) : null;
  const out: Evidence = new Map();
  for (const r of runAll(questions(supplements, usual), facts)) {
    const key = `${r.q.group}:${r.o.key}`, w = wordOf(r), had = out.get(key);
    if (!had || RANK[w] > RANK[had.word] || (RANK[w] === RANK[had.word] && r.p < had.r.p)) out.set(key, { word: w, r });
  }
  return out;
}

/** The Connections row that asks what an engine question asks, by row id → "<group>:<outcome>". */
const TWINS: Record<string, string> = {
  "train-mood": "gym:mood", "train-stress": "gym:stress", "train-sleep": "gym:sleep", "train-energy": "gym-next:energy",
  "drinks-mood": "alc:mood", "drinks-energy": "alc:energy", "drinks-sleep": "alc:sleep",
  "caf-energy": "late-caf:energy", "caf-sleep": "late-caf:sleep",
};
export function twinOf(rowId: string): string | null {
  if (TWINS[rowId]) return TWINS[rowId];
  const m = /^supp-(.+)-(mood|energy|sleep)$/.exec(rowId);
  return m ? `supp-${m[1]}:${m[2]}` : null;
}

/** A clear answer as the record's claim — the same id Noticed's card gets, so one claim however many pages show it. */
export function evidenceClaim(key: string, e: { r: Result }, text: string): Claim | null {
  if (e.r.b == null) return null;
  const [group, outcome] = key.split(":");
  return { id: `noticed:${group}:${outcome}`, from: "noticed", text, said: "", x: e.r.q.id, y: outcome, lag: 0, sign: e.r.b >= 0 ? 1 : -1 };
}
