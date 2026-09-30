/**
 * The test bench: fake months of logs with effects planted on purpose. A detector earns its place
 * only if it finds what was planted, at the right size, and stays quiet when nothing was.
 * Deterministic per seed, so a failing seed can be replayed.
 */

import type { Entry } from "./types";
import { addDays, atMinute } from "./time";

export function rng(seed: number) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  return { r, g };
}

export type BodyWorld = {
  seed: number; days: number; lastDay: string;
  /** The truth the detector should recover. */
  tdee: number;
  intakeMean: number; intakeSd?: number;
  startKg?: number;
  /** Day-to-day scale noise (water etc.), kg. */
  noiseKg?: number;
  /** Share of days with food logged / with a weigh-in. */
  logRate?: number; weighRate?: number;
  /** Share of logged days where only part of the food was logged (breakfast only…). */
  partialRate?: number;
};

/** Food and weight entries for a person with a known true burn. */
export function bodyWorld(w: BodyWorld): Entry[] {
  const { r, g } = rng(w.seed);
  const out: Entry[] = [];
  let kg = w.startKg ?? 80;
  for (let i = 0; i < w.days; i++) {
    const day = addDays(w.lastDay, i - w.days + 1);
    const eaten = Math.max(800, w.intakeMean + g() * (w.intakeSd ?? 350));
    if (r() < (w.weighRate ?? 0.85)) out.push({ id: `b:w${i}`, kind: "weight", at: atMinute(day, 7 * 60 + 30), kg: Math.round((kg + g() * (w.noiseKg ?? 0.4)) * 10) / 10 });
    if (r() < (w.logRate ?? 0.85)) {
      const logged = r() < (w.partialRate ?? 0) ? eaten * 0.3 : eaten;
      out.push({ id: `b:f${i}`, kind: "food", at: atMinute(day, 13 * 60), name: "Day's food", grams: 100, macros: { kcal: logged, p: logged * 0.05, c: logged * 0.12, f: logged * 0.035 } });
    }
    kg += (eaten - w.tdee) / 7700; // weighed in the morning, before that day's food counts
  }
  return out;
}
