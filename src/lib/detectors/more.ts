/**
 * Noticed detectors that need no statistics beyond a line or an average: your baseline, strength
 * trend per lift, protein per kg.
 */

import type { DayFacts } from "../insights";
import type { Entry, EntryOf } from "../types";
import type { Finding } from "../findings";
import { e1rmHistory } from "../training";
import { ols, tCrit } from "../regress";
import { mean } from "../stats";
import { addDays, DAY, localDay } from "../time";

const KEYS = ["energy", "mood", "focus", "stress"] as const;

/** Your usual energy, mood, focus, stress over the last 28 days, and how weekends differ. */
export function baseline(facts: DayFacts[]): Finding | null {
  const recent = facts.slice(-28);
  const avg: Partial<Record<(typeof KEYS)[number], number>> = {};
  const n = recent.filter((d) => KEYS.some((k) => d[k] != null)).length;
  for (const k of KEYS) { const v = recent.map((d) => d[k]).filter((x): x is number => x != null); if (v.length >= 7) avg[k] = mean(v); }
  if (!Object.keys(avg).length) return null;
  const weekendNotes = KEYS.flatMap((k) => {
    const we = recent.filter((d) => d.weekend).map((d) => d[k]).filter((x): x is number => x != null);
    const wd = recent.filter((d) => !d.weekend).map((d) => d[k]).filter((x): x is number => x != null);
    if (we.length < 3 || wd.length < 3) return [];
    const diff = mean(we) - mean(wd);
    return Math.abs(diff) >= 0.5 ? [`${k} ${diff > 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)}`] : [];
  });
  const list = KEYS.filter((k) => avg[k] != null).map((k) => `${k} ${avg[k]!.toFixed(1)}`);
  return {
    id: "baseline", area: "stack", title: `Your usual: ${list.join(", ")}`,
    value: list.length ? avg.energy?.toFixed(1) ?? avg.mood!.toFixed(1) : "", unit: avg.energy != null ? "energy" : "mood",
    detail: weekendNotes.length ? `Weekends differ: ${weekendNotes.join(", ")}. Every other card is compared against days like yours.` : "Weekends and weekdays feel about the same for you.",
    evidence: `average of ${n} rated days in the last 28`, sure: `${n} days`, weight: 0.55,
  };
}

/** Best estimated 1-rep max per session, line over the last 8 weeks, for your most-trained lifts. */
export function strengthTrends(entries: Entry[], now: number, days = 56, max = 3): Finding[] {
  const from = now - days * DAY, firstDay = localDay(from);
  const sets = entries.filter((e): e is EntryOf<"set"> => e.kind === "set" && e.at >= from);
  const lifts = [...new Set(sets.map((s) => s.exercise))]
    .map((ex) => ({ ex, h: e1rmHistory(sets, ex) }))
    .filter((x) => x.h.length >= 4 && x.h[x.h.length - 1].at - x.h[0].at >= 14 * DAY)
    .sort((a, b) => b.h.length - a.h.length).slice(0, max);
  const out: Finding[] = [];
  for (const { ex, h } of lifts) {
    const xs = h.map((s) => (s.at - from) / DAY), ys = h.map((s) => s.e1rm);
    const fit = ols(xs.map((x) => [1, x]), ys);
    if (!fit) continue;
    const perMonth = fit.coef[1] * 30, half = tCrit(fit.df) * fit.se[1] * 30;
    const lo = perMonth - half, hi = perMonth + half;
    const pts = xs.map((x, i) => [x, ys[i]] as [number, number]);
    const chart = { kind: "trend" as const, pts, fit: [[xs[0], fit.coef[0] + fit.coef[1] * xs[0]], [days, fit.coef[0] + fit.coef[1] * days]] as [[number, number], [number, number]], unit: "kg", firstDay, days };
    const span = `${Math.round(ys[0])} → ${Math.round(ys[ys.length - 1])} kg over ${h.length} sessions`;
    const ev = `best set per session, estimated 1-rep max (Epley) · 95% range ${lo >= 0 ? "+" : "−"}${Math.abs(lo).toFixed(1)} to ${hi >= 0 ? "+" : "−"}${Math.abs(hi).toFixed(1)} kg/month`;
    if ((lo > 0 || hi < 0) && Math.abs(perMonth) >= 0.5) {
      out.push({ id: `strength-${ex}`, area: "training", title: `${ex}: est. 1-rep max ${perMonth > 0 ? "up" : "down"} ${Math.abs(perMonth).toFixed(1)} kg a month`, value: `${perMonth > 0 ? "+" : "−"}${Math.abs(perMonth).toFixed(1)}`, unit: "kg/month", detail: span + ".", evidence: ev, sure: perMonth > 0 ? "rising" : "falling", weight: 0.62, chart });
    } else if (h.length >= 6 && lo > -1 && hi < 1) {
      out.push({ id: `strength-${ex}`, area: "training", title: `${ex} has stalled`, value: `${perMonth >= 0 ? "+" : "−"}${Math.abs(perMonth).toFixed(1)}`, unit: "kg/month", detail: `${span}. A change of reps, sets or a lighter week often restarts progress.`, evidence: ev, sure: "stalled", weight: 0.63, chart });
    }
  }
  return out;
}

/** Trials: strength-training gains from protein level off around 1.6 g/kg/day (Morton 2018, 49 RCTs). */
export const PROTEIN_PLATEAU = 1.6;

export function proteinPerKg(facts: DayFacts[], kg: number): Finding | null {
  const logged = facts.slice(-28).map((d) => d.proteinG).filter((x): x is number => x != null);
  if (logged.length < 7 || !kg) return null;
  const g = mean(logged), perKg = g / kg, target = Math.round(PROTEIN_PLATEAU * kg);
  return {
    id: "protein", area: "food", title: `You average ${perKg.toFixed(1)} g of protein per kg`,
    value: perKg.toFixed(1), unit: "g/kg",
    detail: perKg >= PROTEIN_PLATEAU
      ? `≈ ${Math.round(g)} g a day. At or above ~1.6 g/kg, where strength-training gains level off in trials — more is fine, but it isn't buying extra muscle.`
      : `≈ ${Math.round(g)} g a day. In trials, strength-training gains keep improving up to ~1.6 g/kg — about ${target} g a day for you.`,
    evidence: `${logged.length} logged days in the last 28 · body weight ${kg.toFixed(1)} kg · 1.6 g/kg from a 49-trial meta-analysis (Morton 2018)`,
    sure: `${logged.length} days`, weight: 0.5,
  };
}

export const factsWindow = (today: string, days = 90) => [addDays(today, -(days - 1)), today] as const;
