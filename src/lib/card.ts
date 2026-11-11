/**
 * How you compare (PLAN 204's card without the game; owner, 11 Nov: "i like the comparisons, etc, but the whole
 * gamification idea is not that good … keep the charts, keep the not so dry"). For each thing a big study measured the way
 * your band does, about what share of its people you're ahead of — read off a bell curve with the study's mean and spread,
 * so it's said as "about" and kept between 5 and 95:
 *
 *   Endurance   VO2 max against healthy people your age and sex (HUNT, the fitness age card's line; spread taken as 8)
 *   Heart       resting heart rate, the week's middle, against 65 (Quer 2020; spread taken as 8), lower ahead
 *   Sleep       asleep a night, the week's middle, against 6 h 47 ± 48 min (Jaiswal 2020)
 *   Steps       a day, the week's middle, against 4,961 ± 2,684 (Althoff 2017)
 *   Strength    your own trend (lib/strength, % a week) — no study measures lifts like yours, so it's you against you
 * Pure.
 */

import { vo2At, type Sex } from "./fitage";
import { NORMS, normalCdf } from "./norms";

export const CARD = { vo2Sd: 8, rhrSd: 8, strSd: 1 } as const;

export type StatKey = "END" | "HRT" | "SLP" | "PAC" | "STR";
export type Stat = { key: StatKey; word: string; /** share of the study's people you're ahead of, 0–1 (own: of your own weeks) */ p: number | null; says: string; against: string; own: boolean;
  /** The study's average, in words (PLAN 211: "more detailed"). */ avg?: string };
export type CardIn = { vo2?: number | null; age?: number | null; sex?: Sex | null; rhr?: number | null; asleepMin?: number | null; steps?: number | null; strPerWeek?: number | null };

/** "about 85 %", rounded to 5, between 5 and 95 (the tails of a rough curve say nothing exact). */
export const pctWords = (p: number) => `about ${Math.min(95, Math.max(5, Math.round((p * 100) / 5) * 5))} %`;
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}`;

export function compareOf(c: CardIn): Stat[] {
  const sex = c.sex ?? "male", age = c.age && c.age >= 20 && c.age <= 90 ? c.age : null, who = sex === "female" ? "women" : "men";
  const decade = age ? `${who} ${Math.floor(age / 10) * 10}–${Math.floor(age / 10) * 10 + 9}` : who;
  return [
    c.vo2 && age ? { key: "END", word: "Endurance", p: normalCdf((c.vo2 - vo2At(age, sex)) / CARD.vo2Sd), says: `VO2 max ${Math.round(c.vo2)}`, against: `healthy ${decade} (HUNT)`, own: false, avg: `average ${Math.round(vo2At(age, sex))}` }
      : { key: "END", word: "Endurance", p: null, says: c.vo2 ? "needs your age in Settings" : "needs VO2 max", against: "healthy people your age (HUNT)", own: false },
    c.rhr && c.rhr > 25 ? { key: "HRT", word: "Resting heart", p: normalCdf((NORMS.rhr.mean - c.rhr) / CARD.rhrSd), says: `${Math.round(c.rhr)} bpm`, against: "92,457 Fitbit wearers", own: false, avg: `average ${NORMS.rhr.mean}` }
      : { key: "HRT", word: "Resting heart", p: null, says: "needs the band", against: "92,457 Fitbit wearers", own: false },
    c.asleepMin && c.asleepMin > 0 ? { key: "SLP", word: "Sleep", p: normalCdf((c.asleepMin - NORMS.sleep.mean) / NORMS.sleep.sd), says: `${hm(c.asleepMin)} a night`, against: "about 120,000 Fitbit wearers", own: false, avg: `average ${hm(NORMS.sleep.mean)}` }
      : { key: "SLP", word: "Sleep", p: null, says: "needs the band", against: "about 120,000 Fitbit wearers", own: false },
    c.steps && c.steps > 0 ? { key: "PAC", word: "Steps", p: normalCdf((c.steps - NORMS.steps.mean) / NORMS.steps.sd), says: `${(c.steps / 1000).toFixed(1)}k a day`, against: "717,527 people", own: false, avg: `average ${(NORMS.steps.mean / 1000).toFixed(1)}k` }
      : { key: "PAC", word: "Steps", p: null, says: "needs steps", against: "717,527 people", own: false },
    c.strPerWeek != null ? { key: "STR", word: "Strength", p: normalCdf(c.strPerWeek / CARD.strSd), says: `${c.strPerWeek >= 0 ? "+" : "−"}${Math.abs(c.strPerWeek).toFixed(1)} % a week`, against: "your own trend", own: true }
      : { key: "STR", word: "Strength", p: null, says: "needs 3 sessions of a lift", against: "your own trend", own: true },
  ];
}

/** The middle of a list (null when empty). */
export function middle(v: number[]): number | null {
  const s = v.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
}
