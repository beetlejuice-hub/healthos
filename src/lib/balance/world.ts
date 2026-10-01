/**
 * Bench for Balance: fake people whose true burn is known, with the messes real people have —
 * a burn that changes, a diet that starts mid-month, weekends that go unlogged, water that lingers
 * for days, typos. Same entry shapes as the app, so tdee.ts can race on exactly the same data.
 */

import type { Entry } from "../types";
import { rng } from "../bench";
import { addDays, atMinute } from "../time";

export type World = {
  seed: number; days: number; lastDay: string;
  /** True burn on day i (kcal). */
  burn: (i: number) => number;
  /** Average eaten on day i (kcal), and day-to-day spread. */
  eat: (i: number) => number; eatSd?: number;
  startKg?: number;
  /** Water: lingering swing (sd, kg) and how much stays overnight; plus plain scale bounce. */
  waterKg?: number; phi?: number; bounceKg?: number;
  logRate?: number; weighRate?: number;
  /** Weekends: extra eaten, and the chance a weekend day is logged. */
  weekendExtra?: number; weekendLogRate?: number;
  /** Share of weigh-ins that are typos (80.4 → 8.04) or in clothes (+1.8 kg). */
  typoRate?: number;
  /** Share of logged days with only breakfast logged. */
  partialRate?: number;
};

export type Truth = { burn: number[]; kg: number[]; eaten: number[] };

const weekend = (day: string) => [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());

export function world(w: World): { entries: Entry[]; truth: Truth } {
  const { r, g } = rng(w.seed);
  const entries: Entry[] = [], truth: Truth = { burn: [], kg: [], eaten: [] };
  let kg = w.startKg ?? 80, water = 0;
  const phi = w.phi ?? 0, wsd = w.waterKg ?? 0;
  for (let i = 0; i < w.days; i++) {
    const day = addDays(w.lastDay, i - w.days + 1), we = weekend(day);
    water = phi * water + g() * wsd * Math.sqrt(1 - phi * phi);
    truth.kg.push(kg); truth.burn.push(w.burn(i));
    if (r() < (w.weighRate ?? 0.85)) {
      let read = kg + water + g() * (w.bounceKg ?? 0.25);
      if (r() < (w.typoRate ?? 0)) read = r() < 0.5 ? read / 10 : read + 1.8;
      entries.push({ id: `w${i}`, kind: "weight", at: atMinute(day, 7 * 60 + 30), kg: Math.round(read * 10) / 10 });
    }
    const eaten = Math.max(800, w.eat(i) + (we ? w.weekendExtra ?? 0 : 0) + g() * (w.eatSd ?? 350));
    truth.eaten.push(eaten);
    if (r() < (we && w.weekendLogRate != null ? w.weekendLogRate : w.logRate ?? 0.85)) {
      const k = r() < (w.partialRate ?? 0) ? eaten * 0.3 : eaten * (1 + g() * 0.05);
      entries.push({ id: `f${i}`, kind: "food", at: atMinute(day, 13 * 60), name: "Day's food", grams: 100, macros: { kcal: k, p: k * 0.05, c: k * 0.12, f: k * 0.035 } });
    }
    kg += (eaten - w.burn(i)) / 7700;
  }
  return { entries, truth };
}

/** The scenarios the prototype offers and the bench races on. Day count is the history the app would hold. */
export const SCENARIOS = {
  steady: { label: "Steady", blurb: "Eats a bit over a 2,800 burn, logs most days — the current engine's own test.", w: { days: 28, burn: () => 2800, eat: () => 3050, bounceKg: 0.4 } },
  cut: { label: "Started a cut", blurb: "Maintenance for 3 weeks, then 2,300 a day for the last 9 days.", w: { days: 60, burn: () => 2800, eat: (i: number) => (i < 51 ? 2800 : 2300) } },
  shift: { label: "Burn dropped", blurb: "Burn falls from 2,800 to 2,500 three weeks ago (less walking, a desk job).", w: { days: 90, burn: (i: number) => (i < 69 ? 2800 : 2500), eat: () => 2700 } },
  weekends: { label: "Weekend gaps", blurb: "Eats ~900 more on weekends and logs only 1 in 4 of them.", w: { days: 60, burn: () => 2700, eat: () => 2600, weekendExtra: 900, weekendLogRate: 0.25, logRate: 0.95 } },
  water: { label: "Water swings", blurb: "Water that lingers for days (±0.7 kg) on top of the usual bounce.", w: { days: 60, burn: () => 2600, eat: () => 2350, waterKg: 0.7, phi: 0.85 } },
  messy: { label: "Messy logger", blurb: "Typos (8.04 for 80.4), weighed in clothes, partial days, 60% logged.", w: { days: 60, burn: () => 2900, eat: () => 3100, typoRate: 0.06, partialRate: 0.15, logRate: 0.6, weighRate: 0.6 } },
  early: { label: "First 10 days", blurb: "Just started: 10 days of data. tdee.ts says nothing yet.", w: { days: 10, burn: () => 2500, eat: () => 2200 } },
} satisfies Record<string, { label: string; blurb: string; w: Omit<World, "seed" | "lastDay"> }>;

export type ScenarioId = keyof typeof SCENARIOS;
