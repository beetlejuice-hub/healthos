/**
 * The overall check (PLAN 137; owner, 20 Oct: "from time to time the app should do an overall check of what we are doing …
 * catch things like findings that are irrelevant, nonsense, or its just simply clear that they are not affecting eachother
 * - and just name these, not delete" — then "go"). Once a month, riding the month read (no call of its own): the findings
 * shown right now, each with its evidence, go to the AI, which may name the ones that look like noise (thin evidence, one
 * odd stretch, chance-sized) or plain sense (two measures of the same thing). They're labelled where they're shown; his tap
 * hides one or keeps it; hidden ones stay listed and come back with a tap. Nothing is deleted. Pure.
 */

import type { Finding } from "./findings";
import type { Pattern } from "./scout";

export type Verdict = "noise" | "obvious";
export type Check = { id: string; verdict: Verdict; why: string; at: number; /** what it said, for the hidden list */ title?: string; hidden?: true; kept?: true };
export const CHECK_MAX = 5;

/** The findings on show, one line each with an id the answer can point at: n: Noticed, s: Worth a look. */
export function checkList(found: Finding[], patterns: Pattern[]): string[] {
  return [
    ...found.map((f) => `- [n:${f.id}] ${f.title} — ${f.value}${f.unit ? ` ${f.unit}` : ""}; ${f.evidence} (${f.sure})`),
    ...patterns.map((p) => `- [s:${p.id}] ${p.text} — held on ${p.held} of ${p.of}; ${p.n} days, correlation ${p.r.toFixed(2)}, p ${p.p < 0.001 ? "< 0.001" : p.p.toFixed(3)}`),
  ];
}

/** The answer's checks, kept only for findings that were on the list (id → its title); one each, at most 5; his earlier taps stay. */
export function mergeChecks(prev: Check[], answer: { id: string; verdict: string; why: string }[] | undefined, offered: Map<string, string>, at: number): Check[] {
  const fresh: Check[] = [];
  for (const c of answer ?? []) {
    if (!offered.has(c.id) || (c.verdict !== "noise" && c.verdict !== "obvious") || !c.why?.trim() || fresh.some((x) => x.id === c.id)) continue;
    fresh.push({ id: c.id, verdict: c.verdict, why: c.why.trim().slice(0, 200), at, title: offered.get(c.id) });
    if (fresh.length >= CHECK_MAX) break;
  }
  // a finding he already hid or kept keeps his answer; the rest take the new month's word
  const mine = prev.filter((p) => p.hidden || p.kept);
  return [...mine, ...fresh.filter((f) => !mine.some((m) => m.id === f.id))];
}

export const verdictWords = (v: Verdict) => (v === "noise" ? "looks like noise" : "plain sense, not a finding");
