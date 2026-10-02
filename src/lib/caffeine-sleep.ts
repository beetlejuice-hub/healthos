/**
 * Caffeine and sleep — three separate questions, never one alarm (owner, 2 Oct).
 *
 *  1. **How much is likely still in you at bedtime.** Pharmacokinetics (caffeine.ts), shown with a
 *     range, because half-lives differ a lot between people.
 *  2. **Could that amount affect sleep** — for people in general. Tiers by mg left at bedtime:
 *     - under 30 mg, *low*. Evidence anchor: Gardiner et al. 2023 (Sleep Medicine Reviews,
 *       meta-analysis): no drop in total sleep was detected when a coffee (~107 mg) was had 8.8+ h
 *       before bed — that leaves ≈30 mg at bedtime at a 5 h half-life.
 *     - 30–100 mg, *possible*: mostly falling asleep a little slower and lighter deep sleep, for some
 *       people. A heuristic band between the two anchors, not a measured line.
 *     - 100+ mg, *higher*. Evidence anchor: Drake et al. 2013 (J Clin Sleep Med): 400 mg 6 h before
 *       bed (≈175 mg left at bedtime) cut measured sleep by ~41 min. 100 is a heuristic step below that.
 *  3. **Does it seem to affect *your* sleep** — your own nights: the morning "last night's sleep"
 *     rating after nights with 30+ mg left vs under. "Goes with", never "causes"; needs enough nights.
 *     It changes how prominent (2) is, not the numbers in (1).
 *
 * All cut-points live in CAF_SLEEP, not in the UI.
 */

import type { Entry } from "./types";
import { caffeineAt, type Dose } from "./caffeine";
import { addDays, atMinute, localDay } from "./time";
import { mean, sd } from "./stats";
import { tCrit } from "./regress";

export const CAF_SLEEP = {
  /** mg left at bedtime under which an effect on sleep is unlikely (evidence-anchored). */
  lowBelowMg: 30,
  /** mg left at bedtime from which an effect is plausible for many people (heuristic). */
  higherFromMg: 100,
  /** Typical adult half-life range, minutes (≈3–7 h; faster in smokers, slower on the pill or pregnant). */
  halfLifeRangeMin: [180, 420] as [number, number],
  /** A sleep rating counts for the night before if given before this hour. */
  morningUntilHour: 14,
  personal: {
    /** Nights needed on each side before saying anything about you. */
    minNights: 6,
    /** Nights on each side before "no difference" can be said. */
    noEffectNights: 10,
    /** A drop smaller than this (rating points, 1–10) is not one you'd notice: "no real difference". */
    smallDrop: 1,
  },
};

export type Tier = "low" | "possible" | "higher";
export const tierOf = (mg: number): Tier => (mg < CAF_SLEEP.lowBelowMg ? "low" : mg < CAF_SLEEP.higherFromMg ? "possible" : "higher");

/** Bedtime for the night starting on `day`. A bedtime after midnight (00:30) is the next calendar day. */
export const bedtimeOn = (day: string, bedMinute: number) => atMinute(bedMinute < 6 * 60 ? addDays(day, 1) : day, bedMinute);

/** Tonight's bedtime as seen at `now`: before 06:00 you're still in last night. */
export const tonightsBed = (now: number, bedMinute: number) =>
  bedtimeOn(new Date(now).getHours() < 6 ? addDays(localDay(now), -1) : localDay(now), bedMinute);

export type Night = { day: string; atBedMg: number; sleep: number; slow: boolean };

/** Your rated nights: caffeine left at that bedtime, and the next morning's rating (the first one that morning). */
export function ratedNights(entries: Entry[], halfLifeMin: number, bedMinute: number): Night[] {
  const doses: Dose[] = entries.flatMap((e) => (e.kind === "drink" && e.caffeineMg > 0 ? [{ at: e.at, mg: e.caffeineMg }] : []));
  const seen = new Set<string>(), out: Night[] = [];
  const rated = entries.filter((e): e is Extract<Entry, { kind: "sleep" }> => e.kind === "sleep" && e.rating != null).sort((a, b) => a.at - b.at);
  for (const f of rated) {
    if (new Date(f.at).getHours() >= CAF_SLEEP.morningUntilHour) continue;
    const day = addDays(localDay(f.at), -1);
    if (seen.has(day)) continue;
    seen.add(day);
    out.push({ day, atBedMg: caffeineAt(doses, bedtimeOn(day, bedMinute), halfLifeMin), sleep: f.rating!, slow: !!f.slow });
  }
  return out;
}

export type Personal = {
  state: "learning" | "worse" | "no-difference" | "unclear";
  withN: number; withoutN: number;
  /** Mean rating on 30+ mg nights minus under-30 nights, and its 95% range (Welch). */
  diff?: number; lo?: number; hi?: number;
  /** Slow to fall asleep: count / nights, each side. */
  slowWith?: number; slowWithout?: number;
};

/** What your own nights say. Plain two-group comparison with a t-based 95% range; no claim below minNights. */
export function personalSleep(nights: Night[]): Personal {
  const P = CAF_SLEEP.personal;
  const w = nights.filter((n) => n.atBedMg >= CAF_SLEEP.lowBelowMg), wo = nights.filter((n) => n.atBedMg < CAF_SLEEP.lowBelowMg);
  const base = { withN: w.length, withoutN: wo.length, slowWith: w.filter((n) => n.slow).length, slowWithout: wo.filter((n) => n.slow).length };
  if (w.length < P.minNights || wo.length < P.minNights) return { state: "learning", ...base };
  const a = w.map((n) => n.sleep), b = wo.map((n) => n.sleep);
  const va = sd(a) ** 2 / a.length, vb = sd(b) ** 2 / b.length, se = Math.sqrt(va + vb);
  const df = se > 0 ? (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1)) : a.length + b.length - 2;
  const diff = mean(a) - mean(b), half = se > 0 ? tCrit(df) * se : 0;
  const lo = diff - half, hi = diff + half;
  const state = hi < 0 ? "worse"
    : lo > -P.smallDrop && w.length >= P.noEffectNights && wo.length >= P.noEffectNights ? "no-difference"
    : "unclear";
  return { state, ...base, diff, lo, hi };
}

export type Verdict = {
  mg: number; range: [number, number]; tier: Tier; personal: Personal;
  /** quiet = the Caffeine card only; info = a calm item in Now; notice = an item with the "!". */
  prominence: "quiet" | "info" | "notice";
  title: string; body: string;
};

const r5 = (x: number) => Math.round(x / 5) * 5;

/** The bedtime read: amount (with range), general tier, what your own nights say, and how loudly to say it. */
export function bedtimeVerdict(doses: Dose[], bed: number, bedClock: string, halfLifeMin: number, personal: Personal): Verdict {
  const mg = Math.round(caffeineAt(doses, bed, halfLifeMin));
  const ends = [halfLifeMin, ...CAF_SLEEP.halfLifeRangeMin].map((h) => caffeineAt(doses, bed, h));
  const range: [number, number] = [r5(Math.min(...ends)), r5(Math.max(...ends))];
  const tier = tierOf(mg);
  const prominence: Verdict["prominence"] =
    tier === "low" ? "quiet"
    : tier === "possible" ? (personal.state === "worse" ? "info" : "quiet")
    : personal.state === "worse" ? "notice" : personal.state === "no-difference" ? "quiet" : "info";
  const span = range[0] === range[1] ? "" : ` Likely ${range[0]}–${range[1]} mg, depending on how fast your body clears it.`;
  const general = tier === "low" ? "Little enough that it's unlikely to matter for sleep."
    : tier === "possible" ? "Could affect sleep a little for some people — mostly how quickly you drop off."
    : "Enough that it could shorten or lighten sleep for many people.";
  const P = CAF_SLEEP;
  const own = personal.state === "worse" ? ` Your own nights: with ${P.lowBelowMg}+ mg left you rated sleep ${Math.abs(personal.diff!).toFixed(1)} lower (${personal.withN} vs ${personal.withoutN} nights).`
    : personal.state === "no-difference" ? ` Your own nights so far show no real difference in how you slept (${personal.withN} vs ${personal.withoutN} nights).`
    : "";
  return { mg, range, tier, personal, prominence, title: `About ${mg} mg likely still in you at ${bedClock}`, body: `${general}${span}${own}` };
}
