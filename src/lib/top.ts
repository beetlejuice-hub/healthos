/**
 * Insights → "Look at these first" (owner, 5 Oct: "continue working" — my pick: rank what matters and
 * say what to try). From every clear with/without comparison (lib/connections), one card per thing you
 * can change — late caffeine, drinks, training, sleep, each supplement — ranked by how big the
 * difference is, each with a two-week protocol the Experiments panel then judges (before vs during).
 * Weekends aren't a lever, so they never get a button. "Goes with", never "causes"; a protocol is an
 * offer to test it on yourself, not advice.
 */

import type { Comparison } from "./connections";
import { better } from "./connections";
import type { Supplement } from "./types";

export type Protocol = { name: string; how: string; days: number; measure: "mood" | "energy" | "stress" | "sleep" };
export type TopCard = {
  lever: string;
  /** Plain sentence: what goes with what, both outcomes when there are two. */
  title: string;
  /** The biggest difference among its comparisons, in points, signed so + = better for you. */
  effect: number;
  outcome: string;
  rows: Comparison[];
  /** Try this, when the lever is yours to change and the direction says which way to try. */
  protocol: Protocol | null;
};

const MEASURE: Record<Comparison["group"], Protocol["measure"]> = { Mood: "mood", Energy: "energy", Stress: "stress", Sleep: "sleep" };

function leverOf(c: Comparison): string | null {
  if (c.id.startsWith("supp-")) return c.id.split("-").slice(0, -1).join("-");
  const k = c.id.split("-")[0];
  return k === "weekend" ? null : k;
}

/** Up to `max` cards, biggest clear difference first. */
export function topCards(rows: Comparison[], supplements: Supplement[], max = 5): TopCard[] {
  const by = new Map<string, Comparison[]>();
  for (const c of rows) {
    if (!c.diff?.clear) continue;
    const lv = leverOf(c); if (!lv) continue;
    by.set(lv, [...(by.get(lv) ?? []), c]);
  }
  const cards: TopCard[] = [...by.entries()].map(([lever, cs]) => {
    cs.sort((a, b) => Math.abs(better(b)!.d) - Math.abs(better(a)!.d));
    const top = cs[0], d = better(top)!.d, good = d > 0;
    const outs = cs.slice(0, 2).map((c) => `${c.diff!.value > 0 ? "higher" : "lower"} ${c.outcome.replace("that night's sleep rating", "sleep rating that night")} (${c.diff!.value >= 0 ? "+" : "−"}${Math.abs(c.diff!.value).toFixed(1)})`);
    // "Trained that day" → "Training"; drinks keep their timing (it's the night before, not that day): "Drinking the night before".
    const what = /^Drinks /.test(top.what) ? top.what.replace(/^Drinks/, "Drinking") : top.what.replace(/ that day$| the night before$/, "").replace(/^Trained$/, "Training");
    const title = `${what} goes with ${outs.join(" and ")}`;
    return { lever, title, effect: d, outcome: top.outcome, rows: cs, protocol: protocolFor(lever, good, top, supplements) };
  });
  cards.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
  return cards.slice(0, max);
}

function protocolFor(lever: string, good: boolean, c: Comparison, supplements: Supplement[]): Protocol | null {
  const measure = MEASURE[c.group];
  if (lever === "caf") return good ? null : { name: "No caffeine after 14:00", how: "Coffee, tea, energy drinks and cola before 14:00 only.", days: 14, measure };
  if (lever === "drinks") return good ? null : { name: "Two weeks without alcohol", how: "No drinks for 14 days; everything else as usual.", days: 14, measure };
  if (lever === "train") return good ? { name: "Train 3 times a week", how: "Three sessions a week for three weeks, any split.", days: 21, measure } : null;
  if (lever === "slept") return good ? { name: "Same bedtime every night", how: "In bed within 30 minutes of the same time, weekends included.", days: 14, measure: c.group === "Sleep" ? "sleep" : measure } : null;
  if (lever.startsWith("supp-")) {
    const s = supplements.find((x) => `supp-${x.id}` === lever); if (!s) return null;
    // Better with it: the honest test is a pause (does it drop without?). Worse with it: pause it.
    return { name: `Pause ${s.name}`, how: good ? `Skip ${s.name} for 10 days, then take it again — if it's doing something, ${c.outcome} should dip while it's off.` : `Skip ${s.name} for 14 days and see if ${c.outcome} improves.`, days: good ? 10 : 14, measure };
  }
  return null;
}
