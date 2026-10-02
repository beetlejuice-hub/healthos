/**
 * Between check-ins: what you did between two feelings logs, and what it did to them.
 * Owner, 2 Oct: *"always look at what i was doing before that log in the day… like i log bad mood,
 * then go to gym, and after that its high mood, and this happened 3x this week then its a
 * connection probably..make this smart"*.
 *
 * The trap in that example: a bad mood tends to lift by itself, whatever you do in between (the
 * low reading was partly a bad moment). Counting "low → gym → better" three times would credit the
 * gym for that rebound every time, and it would credit lunch and coffee too. So each change
 * between two check-ins on the same day is explained by one regression:
 *
 *   change = a + b·(how far below/above your usual you started) + c·(hours between)
 *            + one term per activity in between (gym, a real meal, caffeine, alcohol, each supplement)
 *
 * An activity's term is its effect after the rebound and after the other activities in the same
 * gap. Every activity × feeling is tested; Benjamini–Hochberg at 10% across all of them; a finding
 * needs ≥ 1 point and 4+ gaps with the activity. Bench: detectors/between.test.ts.
 */

import type { Entry, Workout } from "../types";
import { localDay } from "../time";
import { mean } from "../stats";
import { bh, ols, tCrit } from "../regress";
import type { FeelKey } from "../feel";
import type { Checking, Finding } from "../findings";

export const BETWEEN = { minGapMin: 20, maxGapMin: 10 * 60, minWith: 4, minWithout: 4, minEffect: 1, days: 60 };

export type Activity = { id: string; label: string; did: (from: number, to: number) => boolean };

/** What can happen between two check-ins, from what you already log. */
export function activities(entries: Entry[], workouts: Workout[], suppNames: Map<string, string>): Activity[] {
  const of = <K extends Entry["kind"]>(k: K) => entries.filter((e): e is Extract<Entry, { kind: K }> => e.kind === k);
  const foods = of("food"), drinks = of("drink"), supps = of("supp").filter((s) => s.status === "taken");
  const within = (t: number, a: number, b: number) => t > a && t <= b;
  const out: Activity[] = [
    { id: "gym", label: "the gym", did: (a, b) => workouts.some((w) => within(w.startedAt, a, b)) },
    // A real meal, not a biscuit: 300+ kcal logged in the gap.
    { id: "meal", label: "a meal", did: (a, b) => foods.filter((f) => within(f.at, a, b)).reduce((s, f) => s + f.macros.kcal, 0) >= 300 },
    { id: "caffeine", label: "caffeine", did: (a, b) => drinks.some((d) => d.caffeineMg >= 40 && within(d.at, a, b)) },
    { id: "alcohol", label: "a drink with alcohol", did: (a, b) => drinks.some((d) => d.alcoholG >= 10 && within(d.at, a, b)) },
  ];
  for (const [id, name] of suppNames) out.push({ id: `supp:${id}`, label: name, did: (a, b) => supps.some((s) => s.suppId === id && within(s.at, a, b)) });
  return out;
}

export type Gap = { from: number; to: number; day: string; before: Partial<Record<FeelKey, number>>; after: Partial<Record<FeelKey, number>> };

/** Consecutive check-ins on the same day, 20 min to 10 h apart. */
export function gaps(entries: Entry[]): Gap[] {
  const feels = entries.filter((e): e is Extract<Entry, { kind: "feel" }> => e.kind === "feel").sort((a, b) => a.at - b.at);
  const out: Gap[] = [];
  for (let i = 1; i < feels.length; i++) {
    const a = feels[i - 1], b = feels[i], min = (b.at - a.at) / 60_000;
    if (localDay(a.at) !== localDay(b.at) || min < BETWEEN.minGapMin || min > BETWEEN.maxGapMin) continue;
    const pick = (e: typeof a) => ({ energy: e.energy, mood: e.mood, focus: e.focus, stress: e.stress });
    out.push({ from: a.at, to: b.at, day: localDay(a.at), before: pick(a), after: pick(b) });
  }
  return out;
}

export type BetweenResult = {
  activity: string; label: string; metric: FeelKey;
  /** Extra change in points when the activity happened in the gap, after the rebound and the rest. */
  effect: number; lo: number; hi: number; p: number;
  /** Gaps with / without it, and with it: how many moved the way the effect says (vs what was expected). */
  withN: number; withoutN: number; agree: number;
  /** What a naive before→after average says (shown so the difference is visible). */
  naive: number;
  /** Survived the false-alarm correction and big enough to matter. */
  found: boolean;
};

const METRICS: FeelKey[] = ["mood", "energy", "focus", "stress"];

/** Every activity × feeling with enough gaps, tested together. */
export function between(entries: Entry[], workouts: Workout[], suppNames: Map<string, string>, now: number): BetweenResult[] {
  const since = now - BETWEEN.days * 86_400_000;
  const recent = entries.filter((e) => e.at >= since && e.at <= now);
  const allGaps = gaps(recent);
  const acts = activities(recent, workouts.filter((w) => w.startedAt >= since), suppNames);
  const results: BetweenResult[] = [];
  for (const m of METRICS) {
    const gs = allGaps.filter((g) => g.before[m] != null && g.after[m] != null);
    if (gs.length < BETWEEN.minWith + BETWEEN.minWithout) continue;
    const usual = mean(recent.flatMap((e) => (e.kind === "feel" && e[m] != null ? [e[m]!] : [])));
    const did = acts.map((a) => gs.map((g) => a.did(g.from, g.to)));
    // Only activities with enough gaps on both sides go in; the rest would only add noise.
    const keep = acts.map((_, i) => { const w = did[i].filter(Boolean).length; return w >= BETWEEN.minWith && gs.length - w >= BETWEEN.minWithout; });
    const used = acts.map((a, i) => ({ a, i })).filter(({ i }) => keep[i]);
    if (!used.length) continue;
    const X = gs.map((g, r) => [1, g.before[m]! - usual, (g.to - g.from) / 3_600_000, ...used.map(({ i }) => (did[i][r] ? 1 : 0))]);
    const y = gs.map((g) => g.after[m]! - g.before[m]!);
    const fit = ols(X, y);
    if (!fit) continue;
    const t = tCrit(fit.df);
    used.forEach(({ a, i }, j) => {
      const k = 3 + j, eff = fit.coef[k];
      // Expected change for each gap from everything except this activity: did it beat that?
      const rows = gs.map((_, r) => r).filter((r) => did[i][r]);
      const agree = rows.filter((r) => { const pred = X[r].reduce((s, v, c) => s + (c === k ? 0 : v * fit.coef[c]), 0); return Math.sign(y[r] - pred) === Math.sign(eff); }).length;
      results.push({
        activity: a.id, label: a.label, metric: m, effect: eff, lo: eff - t * fit.se[k], hi: eff + t * fit.se[k], p: fit.p[k],
        withN: rows.length, withoutN: gs.length - rows.length, agree,
        naive: mean(rows.map((r) => y[r])) - mean(gs.map((_, r) => r).filter((r) => !did[i][r]).map((r) => y[r])),
        found: false,
      });
    });
  }
  const pass = bh(results.map((r) => r.p), 0.1);
  results.forEach((r, i) => { r.found = pass[i] && Math.abs(r.effect) >= BETWEEN.minEffect; });
  return results;
}

/** "your mood rises", "your stress drops": for stress, down is the good direction. */
export function phrase(r: Pick<BetweenResult, "metric" | "effect">): string {
  const up = r.effect > 0;
  return `your ${r.metric} ${up ? "rises" : "drops"}`;
}


const pts = (v: number) => `${Math.abs(v).toFixed(1)} point${Math.abs(v) >= 0.95 && Math.abs(v) < 1.05 ? "" : "s"}`;

/** Noticed cards: what changes how you feel between check-ins, and what's still being checked. */
export function betweenFindings(entries: Entry[], workouts: Workout[], suppNames: Map<string, string>, now: number): { found: Finding[]; checking: Checking[] } {
  const rs = between(entries, workouts, suppNames, now);
  const found: Finding[] = rs.filter((r) => r.found).map((r) => {
    const naiveNote = Math.abs(r.naive - r.effect) >= 0.5 ? ` A plain before-and-after average would have said ${r.naive >= 0 ? "+" : "−"}${Math.abs(r.naive).toFixed(1)}.` : "";
    return {
      id: `between:${r.activity}:${r.metric}`, area: "feel",
      title: `After ${r.label}, ${phrase(r)} about ${pts(r.effect)} more than it otherwise does`,
      value: `${r.effect > 0 ? "+" : "−"}${Math.abs(r.effect).toFixed(1)}`, unit: `${r.metric} points`,
      detail: `Compared with the gaps between check-ins without ${r.label}, and allowing for a low ${r.metric} lifting by itself (and a high one settling).${naiveNote} It goes with it; it doesn't prove it causes it.`,
      evidence: `${r.withN} gaps with ${r.label} · ${r.agree} of ${r.withN} beat what was expected · 95% range ${r.lo >= 0 ? "+" : "−"}${Math.abs(r.lo).toFixed(1)} to ${r.hi >= 0 ? "+" : "−"}${Math.abs(r.hi).toFixed(1)} · ${r.withN + r.withoutN} gaps in ${BETWEEN.days} days`,
      sure: "likely", weight: 0.85,
    };
  });
  // Still checking: too few check-in pairs at all, or too few with the gym / a meal / caffeine yet.
  const checking: Checking[] = [];
  const since = now - BETWEEN.days * 86_400_000;
  const gs = gaps(entries.filter((e) => e.at >= since && e.at <= now));
  const needGaps = BETWEEN.minWith + BETWEEN.minWithout;
  if (gs.length < needGaps) {
    checking.push({ id: "between:gaps", area: "feel", question: "What changes how you feel during the day?", progress: gs.length / needGaps, missing: `${gs.length} of ${needGaps} pairs of check-ins on the same day — rate how you feel a few times a day` });
  } else {
    const acts = activities(entries.filter((e) => e.at >= since), workouts, new Map());
    for (const a of acts.filter((x) => x.id === "gym" || x.id === "meal" || x.id === "caffeine")) {
      const n = gs.filter((g) => a.did(g.from, g.to)).length;
      if (n < BETWEEN.minWith && !found.some((f) => f.id.startsWith(`between:${a.id}:`))) {
        checking.push({ id: `between:${a.id}`, area: "feel", question: `Does ${a.label} change how you feel?`, progress: n / BETWEEN.minWith, missing: `${n} of ${BETWEEN.minWith} times with ${a.label} between two check-ins` });
      }
    }
  }
  return { found, checking };
}
