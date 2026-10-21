/** Start a read's protocol as an experiment you run (the app compares before and during); and its verdict when it ends. */

import { act, newId, type Experiment } from "../store";
import type { DigestItem } from "./tasks";
import { addDays, localDay } from "../time";
import { judge, type Verdict } from "./apply";
import type { DayFacts } from "../insights";

export function startExperiment(p: NonNullable<DigestItem["protocol"]>) {
  const x: Experiment = { id: newId(), name: p.name, how: p.how, days: p.days, measure: p.measure, start: localDay(Date.now()) };
  act.setAi((a) => ({ experiments: [...a.experiments, x] }));
}

/** The app's result in words (PLAN 160): it decides whether it worked; the AI only explains. */
export const RESULT_WORDS = { better: "worked for you", worse: "went the wrong way", "no-clear-change": "no clear change" } as const;
type Final = keyof typeof RESULT_WORDS;
const isFinal = (s: Verdict["state"]): s is Final => s in RESULT_WORDS;

/**
 * The experiments that ended and have no verdict yet (PLAN 160; owner, 21 Oct: "do … 4" — experiments end with a
 * verdict): run their full days, with enough ratings for the app's test to say better, worse or no clear change. One
 * stopped early, or with too few ratings, gets none — the app says so itself.
 */
export function verdictsDue(xs: Experiment[], days: DayFacts[], today: string): { x: Experiment; v: Verdict & { state: Final } }[] {
  return xs.filter((x) => !x.verdict && addDays(x.start, x.days) <= (x.ended ?? today)).flatMap((x) => {
    const v = judge(x, days, today);
    return isFinal(v.state) ? [{ x, v: v as Verdict & { state: Final } }] : [];
  });
}

/** What the verdict call is told: the experiment and the app's own result. */
export function verdictLines(x: Experiment, v: Verdict & { state: Final }): string[] {
  const f = (n: number | null) => (n == null ? "–" : n.toFixed(1)), sgn = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}`;
  return [
    "## The experiment",
    `- ${x.name}: ${x.how}`,
    `- ${x.days} days from ${x.start}, measured on ${x.measure} (1–10)`,
    `- The app's result: ${RESULT_WORDS[v.state]} — ${x.measure} ${f(v.before)} in the 14 days before vs ${f(v.during)} during (${v.n[0]} + ${v.n[1]} rated days)${v.diff != null && v.ci ? `; difference ${sgn(v.diff)}, 95% range ${sgn(v.ci[0])} to ${sgn(v.ci[1])}, weekends accounted for` : ""}`,
  ];
}
