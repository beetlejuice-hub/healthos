/**
 * "Am I getting fitter?" — the top of Training (renovation part 1, canvas A: four tiles, then next). Four answers on the
 * same weeks, each from an engine that already decides when a change is real: strength (lib/strength's pooled 8-week
 * trend), cardio fitness (lib/cardiofit, walking first), recovery after cardio (lib/cardiofit) and weight (lib/tdee's
 * trend line). A tile is only "good" or "bad" when its engine says the move is clear; otherwise it says so plainly.
 * Then what's next: the session after the last, and the cardio short of the usual this week. Pure.
 */

import type { Overall } from "./strength";
import type { LaneTrend, recoveryTrend } from "./cardiofit";
import type { Trend as WeightTrend } from "./tdee";
import type { CardioWeek } from "./cardio";

export type AnswerKey = "strength" | "cardio" | "recovery" | "weight";
export type Tone = "good" | "bad" | "flat" | "none";
/** `spark`: [x, y] with up = better (so every tile's line reads the same way); `target`: where a tap goes. */
export type Answer = { key: AnswerKey; name: string; big: string | null; word: string; tone: Tone; spark: [number, number][] };

const sgn = (v: number, d = 0) => { const t = Math.abs(v).toFixed(d); return Number(t) === 0 ? `±${t}` : `${v > 0 ? "+" : "−"}${t}`; };

export function strengthAnswer(o: Overall): Answer {
  const spark = o.weeks.map((w): [number, number] => [w.week, w.index]);
  if (o.change == null || o.weeks.length < 2) return { key: "strength", name: "Strength", big: null, word: "after two weeks of lifting", tone: "none", spark };
  const big = `${sgn(o.change, 1)} %`;
  if (o.state === "stronger") return { key: "strength", name: "Strength", big, word: "stronger", tone: "good", spark };
  if (o.state === "dropping") return { key: "strength", name: "Strength", big, word: "weaker lately", tone: "bad", spark };
  if (o.state === "holding") return { key: "strength", name: "Strength", big, word: "holding steady", tone: "flat", spark };
  return { key: "strength", name: "Strength", big, word: "not clear yet", tone: "flat", spark };
}

/** Walking first (the most windows); else the stairmaster, else running. */
export function cardioAnswer(lanes: LaneTrend[]): Answer {
  const t = ["walk", "stair", "run"].map((l) => lanes.find((x) => x.lane === l && x.trend)).find(Boolean) ?? lanes[0] ?? null;
  const where = t?.lane === "walk" ? "walking" : t?.lane === "stair" ? "on the stairmaster" : "running";
  if (!t) return { key: "cardio", name: "Cardio fitness", big: null, word: "needs walks with the band on", tone: "none", spark: [] };
  const spark = t.pts.map((p): [number, number] => [p.week, -p.v]);
  if (!t.trend) return { key: "cardio", name: "Cardio fitness", big: `${Math.round(t.pts.at(-1)!.v)} bpm`, word: `${where} at ${t.ref}/min · ${t.pts.length} of 4 weeks`, tone: "none", spark };
  const big = `${sgn(t.trend.change)} bpm`, at = `at the same ${t.lane === "walk" ? "walking" : t.lane === "run" ? "running" : "stairmaster"} pace`;
  return { key: "cardio", name: "Cardio fitness", big, word: t.trend.word === "lower" ? `fitter, ${at}` : t.trend.word === "higher" ? `higher, ${at}` : `about the same, ${at}`,
    tone: t.trend.word === "lower" ? "good" : t.trend.word === "higher" ? "bad" : "flat", spark };
}

export function recoveryAnswer(r: ReturnType<typeof recoveryTrend>): Answer {
  const spark = r.pts.map((p): [number, number] => [p.start, p.rec.drop]);
  if (!r.trend) return { key: "recovery", name: "Recovery", big: r.last ? `${r.last.rec.drop} bpm` : null, word: r.last ? `drop in 2 min · ${r.pts.length} of 4 sessions` : "after cardio with the band on", tone: "none", spark };
  return { key: "recovery", name: "Recovery", big: `${sgn(r.trend.change)} bpm`, word: r.trend.word === "higher" ? "faster drop after cardio" : r.trend.word === "lower" ? "slower drop after cardio" : "about the same after cardio",
    tone: r.trend.word === "higher" ? "good" : r.trend.word === "lower" ? "bad" : "flat", spark };
}

/**
 * Weight over the same weeks from its trend line (null: too few weigh-ins). Lighter reads as good (owner, 20 Oct: cardio
 * "is important for my weight loss"); heavier is said plainly, never in red. Clear only past twice its standard error.
 */
export function weightAnswer(t: WeightTrend | null, days: number, kgs: [number, number][]): Answer {
  if (!t) return { key: "weight", name: "Weight", big: null, word: "after 8 weigh-ins over 2 weeks", tone: "none", spark: [] };
  const span = Math.min(days, t.spanDays), ch = t.perDay * span, clear = Math.abs(t.perDay) >= 2 * t.se && Math.abs(ch) >= 0.3;
  const big = `${sgn(ch, 1)} kg`, wk = `about ${sgn(t.perDay * 7, 1)} kg a week`;
  return { key: "weight", name: "Weight", big, word: !clear ? "about the same" : ch < 0 ? `lighter · ${wk}` : `heavier · ${wk}`, tone: !clear ? "flat" : ch < 0 ? "good" : "flat", spark: kgs.map(([x, y]) => [x, -y]) };
}

const WORD: Record<AnswerKey, [string, string]> = { strength: ["stronger", "weaker"], cardio: ["fitter on cardio", "less fit on cardio"], recovery: ["recovering faster", "recovering slower"], weight: ["lighter", "heavier"] };
/** The line over the tiles: "Yes on all four: stronger, fitter on cardio, recovering faster, lighter." */
export function headline(as: Answer[]): string {
  const known = as.filter((a) => a.tone !== "none"), good = known.filter((a) => a.tone === "good"), bad = known.filter((a) => a.tone === "bad" && a.key !== "weight");
  const list = (x: Answer[], i: 0 | 1) => x.map((a) => WORD[a.key][i]).join(", ").replace(/, ([^,]*)$/, " and $1");
  if (!known.length) return "Not enough yet to say. Each tile says what it needs.";
  if (good.length === known.length) return `${known.length === 4 ? "Yes on all four" : "Yes so far"}: ${list(good, 0)}.`;
  if (!good.length && !bad.length) return "About the same on everything that can be measured yet.";
  return [good.length ? `${list(good, 0)[0].toUpperCase()}${list(good, 0).slice(1)}` : null, bad.length ? `${good.length ? "but " : ""}${list(bad, 1)}` : null].filter(Boolean).join(", ")
    + (known.length > good.length + bad.length ? "; the rest about the same." : ".");
}

/** This week's cardio against the usual (the 3 weeks before): the minutes short, when it's 10 or more. */
export function cardioShort(weeks: CardioWeek[]): { min: number; usual: number; short: number } | null {
  if (weeks.length < 4) return null;
  const cur = weeks[weeks.length - 1], before = weeks.slice(-4, -1), usual = Math.round(before.reduce((a, w) => a + w.min, 0) / before.length);
  const short = usual - cur.min;
  return usual >= 15 && short >= 10 ? { min: cur.min, usual, short } : null;
}
