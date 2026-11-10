/**
 * Your player card (PLAN 204 D; owner, 10 Nov: "I fucking love the idea of all of these"). Six stats out of 99, each where
 * you'd stand on a bell curve from a big study — 35 at the very bottom, 67 right at the average, 99 at the top — an
 * overall (their mean, from 3 stats) and its tier. Like for like where a study measured it the way your band does:
 *
 *   END  VO2 max against healthy people your age and sex (HUNT, the fitness age card's line; spread taken as 8)
 *   HRT  resting heart rate, the week's middle, against 65 (Quer 2020; spread taken as 8, most men 50–80), lower better
 *   REC  asleep a night, the week's middle, against 6 h 47 ± 48 min (Jaiswal 2020)
 *   PAC  steps a day, the week's middle, against 4,961 ± 2,684 (Althoff 2017)
 *   STR  your own strength trend (lib/strength, % a week; no study measures lifts like yours) — flat is 67, +1 % a week ~89
 *   DSC  your own: the points you kept of 70 over your last 4 weeks of the game
 * Pure.
 */

import { vo2At, type Sex } from "./fitage";
import { NORMS, normalCdf } from "./norms";

export const CARD = { low: 35, span: 64, vo2Sd: 8, rhrSd: 8, strSd: 1, minStats: 3 } as const;
export const TIERS = [{ at: 85, name: "Elite" }, { at: 75, name: "Gold" }, { at: 60, name: "Silver" }, { at: 0, name: "Bronze" }] as const;

export type StatKey = "END" | "HRT" | "REC" | "PAC" | "STR" | "DSC";
export type Stat = { key: StatKey; word: string; rating: number | null; says: string; own: boolean };
export type CardIn = { vo2?: number | null; age?: number | null; sex?: Sex | null; rhr?: number | null; asleepMin?: number | null; steps?: number | null; strPerWeek?: number | null; kept?: number | null };
export type Card = { stats: Stat[]; ovr: number | null; tier: string | null; next: { name: string; at: number } | null; weakest: Stat | null; best: Stat | null };

/** A share of the curve as a rating: 35–99. */
export const rate = (p: number) => Math.min(99, Math.max(CARD.low, Math.round(CARD.low + CARD.span * p)));
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}`;

export function cardOf(c: CardIn): Card {
  const s: Stat[] = [];
  const sex = c.sex ?? "male", age = c.age && c.age >= 20 && c.age <= 90 ? c.age : null;
  s.push(c.vo2 && age ? { key: "END", word: "Endurance", rating: rate(normalCdf((c.vo2 - vo2At(age, sex)) / CARD.vo2Sd)), says: `VO2 max ${Math.round(c.vo2)}`, own: false }
    : { key: "END", word: "Endurance", rating: null, says: c.vo2 ? "needs your age" : "needs VO2 max", own: false });
  s.push(c.rhr && c.rhr > 25 ? { key: "HRT", word: "Heart", rating: rate(normalCdf((NORMS.rhr.mean - c.rhr) / CARD.rhrSd)), says: `resting ${Math.round(c.rhr)}`, own: false }
    : { key: "HRT", word: "Heart", rating: null, says: "needs the band", own: false });
  s.push(c.asleepMin && c.asleepMin > 0 ? { key: "REC", word: "Recovery", rating: rate(normalCdf((c.asleepMin - NORMS.sleep.mean) / NORMS.sleep.sd)), says: `asleep ${hm(c.asleepMin)}`, own: false }
    : { key: "REC", word: "Recovery", rating: null, says: "needs the band", own: false });
  s.push(c.steps && c.steps > 0 ? { key: "PAC", word: "Pace", rating: rate(normalCdf((c.steps - NORMS.steps.mean) / NORMS.steps.sd)), says: `${(c.steps / 1000).toFixed(1)}k steps`, own: false }
    : { key: "PAC", word: "Pace", rating: null, says: "needs steps", own: false });
  s.push(c.strPerWeek != null ? { key: "STR", word: "Strength", rating: rate(normalCdf(c.strPerWeek / CARD.strSd)), says: `${c.strPerWeek >= 0 ? "+" : "−"}${Math.abs(c.strPerWeek).toFixed(1)} % a week`, own: true }
    : { key: "STR", word: "Strength", rating: null, says: "needs lifts", own: true });
  s.push(c.kept != null ? { key: "DSC", word: "Discipline", rating: rate(Math.min(1, Math.max(0, c.kept / 70))), says: `kept ${Math.round(c.kept)} of 70`, own: true }
    : { key: "DSC", word: "Discipline", rating: null, says: "after your first week", own: true });
  const known = s.filter((x) => x.rating != null);
  const ovr = known.length >= CARD.minStats ? Math.round(known.reduce((a, x) => a + x.rating!, 0) / known.length) : null;
  const tier = ovr == null ? null : TIERS.find((t) => ovr >= t.at)!.name;
  const up = ovr == null ? null : [...TIERS].reverse().find((t) => t.at > ovr) ?? null;
  const by = [...known].sort((a, b) => a.rating! - b.rating!);
  return { stats: s, ovr, tier, next: up ? { name: up.name, at: up.at } : null, weakest: by[0] ?? null, best: [...known].sort((a, b) => b.rating! - a.rating!)[0] ?? null };
}

/** The middle of a list (null when empty). */
export function middle(v: number[]): number | null {
  const s = v.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
}

/** Which goal moves a stat — said under the card for the weakest. */
export const MOVES: Partial<Record<StatKey, string>> = {
  REC: "the bed goal moves this one", HRT: "fewer drinks and more nights in bed on time move this one", PAC: "a walk a day moves this one",
  STR: "your sessions, one set heavier than last time, move this one", END: "cardio in your sessions moves this one, slowly", DSC: "holding more of your 70 moves this one",
};
