/** Start a read's protocol as an experiment you run (the app compares before and during); and its verdict when it ends. */

import { act, getState, newId, type Experiment } from "../store";
import type { DigestItem } from "./tasks";
import { addDays, localDay } from "../time";
import { judge, type Verdict } from "./apply";
import { blockOn, makeBlocks } from "./blocks";
import { xpCounted, xpEnd, xpOver, xpSkipped, xpToAsk } from "./xpdays";
import { dailyFacts, type DayFacts } from "../insights";
import { plainResult, xpAutoPatches, xpLook } from "./xpauto";

export function startExperiment(p: NonNullable<DigestItem["protocol"]>) {
  const id = newId();
  // 14 days or more (PLAN 227): ON and OFF in alternating 4-day blocks, each pair's order at random — rounded up to whole
  // pairs (14 → 16). Shorter ones keep before-against-during: one pair of blocks is too few days to tell.
  const b = p.days >= 14 ? makeBlocks(p.days, [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)) : null;
  const x: Experiment = { id, name: p.name, how: p.how, days: b ? b.days : p.days, measure: p.measure, start: localDay(Date.now()), ...(b ? { blocks: b.blocks } : {}) };
  act.setAi((a) => ({ experiments: [...a.experiments, x] }));
}

/**
 * Experiments that end themselves (PLAN 225): the days the log answers, ending early when clear, more days when unclear.
 * Run when Today shows the strip and on the AI's tick; writes only when something changed.
 */
export function xpAutoRun(today: string): void {
  const st = getState(), xs = st.ai.experiments.filter((x) => !x.ended && !x.verdict);
  if (!xs.length) return;
  const days = dailyFacts(st.entries, st.workouts, st.settings, addDays(today, -120), addDays(today, -1));
  const patches = xpAutoPatches(xs, days, st.supplements, today);
  if (!patches.length) return;
  const by = new Map(patches.map((p) => [p.id, p.patch]));
  act.setAi((a) => ({ experiments: a.experiments.map((x) => (by.has(x.id) ? { ...x, ...by.get(x.id) } : x)) }));
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
  // not while it's about to get more days (lib/ai/xpauto: unclear and wide at its end)
  return xs.filter((x) => !x.verdict && xpOver(x, today) && !xpLook(x, days, today)).flatMap((x) => {
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
    ...(x.blocks ? [`- Done in alternating ${x.blocks.len}-day blocks, ON and OFF in a random order, each block's first day left out — so "before" below means OFF days and "during" ON days of the same weeks.`] : []),
    ...(x.early ? [`- It ended early on ${x.early}: the app's daily check found the answer already clear on its stricter bar (99.8 %).`] : []),
    ...(x.extra ? [`- It ran ${x.extra} days longer than planned: at its end the answer was unclear.`] : []),
    `- ${x.days} days from ${x.start}, measured on ${x.measure} (1–10)${xpSkipped(x).length ? `; ${xpSkipped(x).length} day${xpSkipped(x).length === 1 ? "" : "s"} they said they didn't do it left out (${xpSkipped(x).join(", ")})` : ""}`,
    `- The app's result: ${RESULT_WORDS[v.state]} — ${x.measure} ${f(v.before)} in the 14 days before vs ${f(v.during)} during (${v.n[0]} + ${v.n[1]} rated days)${v.diff != null && v.ci ? `; difference ${sgn(v.diff)}, 95% range ${sgn(v.ci[0])} to ${sgn(v.ci[1])}, weekends accounted for` : ""}`,
  ];
}

/**
 * Today's strip (PLAN 160; owner, 21 Oct: "make experiments easier to find … a one-line running experiments strip on
 * Today"): one line each. Running: its day and what to do today — the reminder that keeps it honest; no numbers mid-way,
 * so it isn't judged early. Done: the app's result until you've seen it (its verdict when there is one), for a week.
 */
export type StripLine = { id: string; done: boolean; text: string; sub: string };
export function experimentStrip(xs: Experiment[], today: string, result: (x: Experiment) => Verdict): StripLine[] {
  return xs.flatMap((x): StripLine[] => {
    const end = xpEnd(x), out = xpSkipped(x).filter((d) => d < today).length, day = xpCounted(x, today) + 1, total = x.days + (x.extra ?? 0);
    const left = out ? ` · ${out} left out` : "", todo = x.how ? ` — today: ${x.how.charAt(0).toLowerCase()}${x.how.slice(1)}` : "";
    const more = x.extra ? ` · ${x.extra} more days: not clear yet` : "";
    const bl = x.blocks ? blockOn(x.blocks, x.start, today) : null;
    const todayIs = bl ? (bl.on ? ` — today ON: ${x.how ? x.how.charAt(0).toLowerCase() + x.how.slice(1) : "do it"}` : " — today OFF: as usual") : todo;
    if (!x.ended && end > today) return [{ id: x.id, done: false, text: x.name, sub: `day ${Math.max(1, day)} of ${total}${more}${left}${todayIs}` }];
    // its days are in, but the last one isn't answered yet: it waits for that
    if (!x.ended && !x.verdict && xpToAsk(x, today).length) return [{ id: x.id, done: false, text: x.name, sub: `${total} of ${total} days${left} — did you do it yesterday?` }];
    const v = result(x), plain = v.state === "too-few" ? null : plainResult(v);
    if (x.verdict) return !x.verdict.seen && x.verdict.at >= Date.parse(today) - 7 * 86_400_000 ? [{ id: x.id, done: true, text: x.name, sub: `${plainResult({ state: x.verdict.state, ci: v.ci }) ?? RESULT_WORDS[x.verdict.state]}${x.early ? ` — clear by day ${xpCounted(x, x.early)}` : ""} · see why` }] : [];
    // stopped early, or done with no verdict yet: say what the app knows, for a week after it ended
    const ended = x.ended && x.ended < end ? x.ended : end;
    if (ended < addDays(today, -7) || x.seen) return [];
    if (x.early) return [{ id: x.id, done: true, text: x.name, sub: `${plain} — clear by day ${xpCounted(x, x.early)}, so it ended there` }];
    return [{ id: x.id, done: true, text: x.name, sub: x.ended && x.ended < end ? "ended early — too few days to tell" : plain ? `${plain} · the AI's read on it is coming` : "done — not enough ratings to tell" }];
  });
}
