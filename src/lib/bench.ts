/**
 * The test bench: fake months of logs with effects planted on purpose. A detector earns its place
 * only if it finds what was planted, at the right size, and stays quiet when nothing was.
 * Deterministic per seed, so a failing seed can be replayed.
 */

import type { Entry, Workout } from "./types";
import type { DayFacts } from "./insights";
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


export type FeelWorld = {
  seed: number; days?: number;
  /** Share of evenings rated. */
  rateRate?: number;
  /** Planted effects (points on the 1–10 scale). */
  lateCafEnergy?: number; alcoholMood?: number; weekendMood?: number; gymKcal?: number;
  /** Mood rising by this much over the whole period. */
  drift?: number;
  /** Saffron taken only from this day on (else ~70% of days at random). */
  saffronFrom?: number;
  /** Drinks only on Friday and Saturday evenings. */
  weekendDrinking?: boolean;
};

/** A day table for a fake person with known effects — the effect engine's test bench. Day 0 is a Monday. */
export function feelWorld(w: FeelWorld): DayFacts[] {
  const { r, g } = rng(w.seed);
  const n = w.days ?? 60, out: DayFacts[] = [];
  let prev: DayFacts | null = null, eA = 0, mA = 0;
  for (let i = 0; i < n; i++) {
    const dow = i % 7, weekend = dow >= 5;
    const late = r() < 0.4 ? 80 + Math.round(r() * 80) : 0;
    const alc = w.weekendDrinking ? ((dow === 4 || dow === 5) && r() < 0.8 ? 42 : 0) : r() < 0.2 ? 42 : 0;
    const trained = [0, 2, 4].includes(dow) && r() < 0.9;
    const kcal = r() < 0.9 ? Math.round(2500 + g() * 300 + (trained ? w.gymKcal ?? 0 : 0)) : null;
    const saffron = w.saffronFrom != null ? i >= w.saffronFrom : r() < 0.7;
    // Feelings: a person-level wobble (yesterday carries over) + planted effects of yesterday.
    eA = 0.4 * eA + g(); mA = 0.4 * mA + g();
    let energy = 6 + eA, mood = 6.2 + mA + (weekend ? w.weekendMood ?? 0 : 0) + (w.drift ?? 0) * (i / n);
    if (prev && prev.lateCaffeineMg > 0) energy += w.lateCafEnergy ?? 0;
    if (prev && prev.alcoholG >= 28) mood += w.alcoholMood ?? 0;
    const rated = r() < (w.rateRate ?? 0.85);
    const clamp = (v: number) => Math.max(1, Math.min(10, Math.round(v)));
    const day: DayFacts = {
      day: `d${i}`, caffeineMg: 190 + late, lastCaffeineMin: late ? 15 * 60 : 9 * 60, caffeineAtBed: late * 0.5 + 20, alcoholG: alc, alcoholAtBed: alc ? 10 : 0,
      trained, kcal, proteinG: kcal == null ? null : Math.round(130 + g() * 25),
      energy: rated ? clamp(energy) : null, mood: rated ? clamp(mood) : null, focus: rated ? clamp(6 + g()) : null, stress: rated ? clamp(4 + g()) : null,
      taken: new Set(saffron ? ["saffron", "creatine"] : ["creatine"]), logged: true, stackAnswered: r() < 0.9, lateCaffeineMg: late,
      lateEat: r() < 0.3, volumeKg: trained ? 8000 + Math.round(g() * 1500) : 0, weekend, bigMealKcal: kcal == null ? null : Math.round(kcal * (0.35 + r() * 0.2)), sleep: null,
    };
    out.push(day); prev = day;
  }
  return out;
}

export type BetweenWorld = {
  seed: number; days?: number; lastDay?: string;
  /** Points added to mood at the first check-in after a gym session. */
  gymMood?: number;
  /** Go to the gym (15:00) only on days the 13:00 mood was 5 or less — and on no other days. */
  gymWhenLow?: boolean;
  /** Share of the four daily check-ins (9, 13, 17, 21) actually logged. */
  logRate?: number;
  /** Evening walks (40% of days, ticked "outside" at the 21:00 check-in) lift mood this much. */
  outsideMood?: number;
  /** Tick "phone" at random check-ins (half of them) — it does nothing. */
  phoneNoise?: boolean;
};

/**
 * A month of check-ins with moods that bounce around and come back by themselves (a low reading is
 * partly a bad moment), gym, meals and coffee — the bench for detectors/between.ts.
 */
export function betweenWorld(w: BetweenWorld): { entries: Entry[]; workouts: Workout[] } {
  const { r, g } = rng(w.seed);
  const days = w.days ?? 28, last = w.lastDay ?? "2026-10-01";
  const entries: Entry[] = [], workouts: Workout[] = [];
  const clamp = (v: number) => Math.max(1, Math.min(10, Math.round(v)));
  for (let i = 0; i < days; i++) {
    const day = addDays(last, i - days + 1), dow = i % 7;
    const level = 6 + g() * 0.7;
    let moment = g() * 1.2, lift = 0, prev13: number | null = null;
    for (const [h, slot] of [[9, 0], [13, 1], [17, 2], [21, 3]] as const) {
      if (slot === 2) {
        // 15:00: the gym, either on its usual days or only after a low lunchtime.
        const go = w.gymWhenLow ? prev13 != null && prev13 <= 5 : [0, 2, 4].includes(dow) && r() < 0.9;
        if (go) { workouts.push({ id: `gw${i}`, template: "Upper A", startedAt: atMinute(day, 15 * 60), endedAt: atMinute(day, 16 * 60) }); lift = w.gymMood ?? 0; }
      }
      if (slot === 1 && r() < 0.9) entries.push({ id: `bm${i}l`, kind: "food", at: atMinute(day, 12 * 60 + 30), name: "Lunch", grams: 400, macros: { kcal: 650, p: 35, c: 70, f: 22 } });
      if (slot === 3 && r() < 0.9) entries.push({ id: `bm${i}d`, kind: "food", at: atMinute(day, 19 * 60), name: "Dinner", grams: 450, macros: { kcal: 700, p: 40, c: 70, f: 25 } });
      if ((slot === 0 || slot === 2) && r() < 0.7) entries.push({ id: `bc${i}${slot}`, kind: "drink", at: atMinute(day, (h - 1) * 60), name: "Coffee", ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 });
      moment = 0.3 * moment + g() * 1.2;
      const walked = slot === 3 && w.outsideMood != null && r() < 0.4;
      if (walked) lift += w.outsideMood!;
      const mood = clamp(level + moment + lift);
      lift *= 0.4;
      if (slot === 1) prev13 = mood;
      const doing = [...(walked ? ["outside"] : []), ...(w.phoneNoise && r() < 0.5 ? ["phone"] : [])];
      if (r() < (w.logRate ?? 0.85)) entries.push({ id: `bf${i}${slot}`, kind: "feel", at: atMinute(day, h * 60 + Math.round(g() * 15)), mood, energy: clamp(6 + g()), ...(doing.length ? { doing } : {}) });
    }
  }
  return { entries: entries.sort((a, b) => a.at - b.at), workouts };
}

export type HrWorld = {
  seed: number; days: number; lastDay: string;
  /** Share of days with a morning coffee, 07:30–09:30 — right in the rise after waking, on purpose. */
  coffeeRate: number;
  /** Planted: bpm the coffee adds at its peak, 45 min after. 0 = no effect at all. */
  coffeeBpm: number;
  /** Share of days with a 17:00–18:00 workout; after it the extra beats fade with this time constant (min). */
  workoutRate?: number; tauMin?: number;
};

/**
 * Heart rate, minute by minute, shaped like a real day: ~56 asleep, a climb to ~70 between 06:30 and 08:30,
 * a slow evening fall; slow wandering (±2.5 bpm, half-hourly), a per-day offset and minute noise. Coffee and
 * workouts planted on top. The morning climb is there so a detector that ignores time of day "finds" coffee.
 */
export function hrWorld(w: HrWorld): { hr: [number, number, number, number][]; doses: { at: number; mg: number }[]; workouts: { start: number; end: number }[] } {
  const { r, g } = rng(w.seed);
  const hr: [number, number, number, number][] = [], doses: { at: number; mg: number }[] = [], workouts: { start: number; end: number }[] = [];
  const tau = w.tauMin ?? 13;
  for (let k = w.days - 1; k >= 0; k--) {
    const day = addDays(w.lastDay, -k), off = g() * 2.5;
    const knots = Array.from({ length: 50 }, () => g() * 2.5);
    const base = (md: number) => md < 390 ? 56 : md < 510 ? 56 + ((md - 390) / 120) * 14 : md < 1320 ? 70 + 2 * Math.sin((md - 510) / 180) : md < 1410 ? 70 - ((md - 1320) / 90) * 14 : 56;
    const coffee = r() < w.coffeeRate ? atMinute(day, 450 + Math.floor(r() * 120)) : null;
    if (coffee != null) doses.push({ at: coffee, mg: 95 });
    const gym = r() < (w.workoutRate ?? 0) ? { start: atMinute(day, 1020), end: atMinute(day, 1080) } : null;
    if (gym) workouts.push(gym);
    for (let md = 0; md < 1440; md++) {
      if (r() < 0.01) continue; // band off for a minute now and then
      const t = atMinute(day, md);
      const slow = knots[Math.floor(md / 30)] + (knots[Math.floor(md / 30) + 1] - knots[Math.floor(md / 30)]) * ((md % 30) / 30);
      let v = base(md) + off + slow + g() * 2;
      if (coffee != null && t > coffee) { const m = (t - coffee) / 60_000; v += w.coffeeBpm * (m / 45) * Math.exp(1 - m / 45); }
      if (gym && t >= gym.start && t < gym.end) v = 135 + g() * 5;
      if (gym && t >= gym.end) v += (130 - base(1080)) * Math.exp(-((t - gym.end) / 60_000) / tau);
      const a = Math.round(v);
      hr.push([t, a, a - 3, a + 3]);
    }
  }
  return { hr, doses, workouts };
}
