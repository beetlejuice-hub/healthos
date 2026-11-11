/**
 * One row a day for "why today", "what makes a day" and the day lines (PLAN 208): how the day went (focus, mood, energy
 * — the check-ins' average — and the morning's sleep rating) beside what came before it: last night's sleep and bedtime,
 * yesterday's drinks, late caffeine, protein, steps and training, this morning's HRV and resting heart rate. "Before" is
 * the evening and night before the day, the way the day itself would feel them. Pure.
 */

import type { DayFacts } from "./insights";
import { addDays } from "./time";

export type DayRow = {
  day: string;
  asleep: number | null; bed: number | null; drinks: number | null; lateCaf: number | null; protein: number | null;
  steps: number | null; trained: number | null; hrv: number | null; rhr: number | null;
  focus: number | null; mood: number | null; energy: number | null; sleepRating: number | null;
};
export type FactorKey = "asleep" | "bed" | "drinks" | "lateCaf" | "protein" | "steps" | "trained" | "hrv";
export type OutcomeKey = "focus" | "mood" | "energy" | "sleepRating";

const hm = (h: number) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
/** What each thing is, said plainly; `binary` things are yes/no; `n` turns a value into words. */
export const FACTORS: Record<FactorKey, { name: string; when: string; binary?: boolean; fmt: (v: number) => string; per: string }> = {
  asleep: { name: "Asleep", when: "the night before", fmt: hm, per: "each extra hour asleep" },
  bed: { name: "In bed", when: "the night before, against your usual", fmt: (v) => (Math.abs(v) < 0.08 ? "at your usual time" : `${Math.round(Math.abs(v) * 60)} min ${v > 0 ? "later" : "earlier"} than usual`), per: "each hour later to bed" },
  drinks: { name: "Drinks", when: "the evening before", fmt: (v) => (v < 0.25 ? "no drinks" : `${Math.round(v * 10) / 10} drink${Math.round(v) === 1 ? "" : "s"}`), per: "each drink" },
  lateCaf: { name: "Caffeine after 14:00", when: "the day before", fmt: (v) => `${Math.round(v)} mg late caffeine`, per: "each 100 mg of late caffeine" },
  protein: { name: "Protein", when: "the day before", fmt: (v) => `${Math.round(v)} g protein`, per: "each 10 g of protein" },
  steps: { name: "Steps", when: "the day before", fmt: (v) => `${v.toFixed(1)}k steps`, per: "each 1,000 steps" },
  trained: { name: "Trained", when: "the day before", binary: true, fmt: (v) => (v >= 0.5 ? "trained the day before" : "a rest day before"), per: "a training day before" },
  hrv: { name: "HRV", when: "that morning", fmt: (v) => `HRV ${Math.round(v)} ms`, per: "each 10 ms of HRV" },
};
export const OUTCOMES: Record<OutcomeKey, { name: string }> = { focus: { name: "Focus" }, mood: { name: "Mood" }, energy: { name: "Energy" }, sleepRating: { name: "Sleep rating" } };
/** The unit a factor's slope is per (lateCaf per 100 mg, protein per 10 g, hrv per 10 ms). */
export const PER: Record<FactorKey, number> = { asleep: 1, bed: 1, drinks: 1, lateCaf: 100, protein: 10, steps: 1, trained: 1, hrv: 10 };

export function dayTable(days: DayFacts[], band: { rhr?: Record<string, number>; hrv?: Record<string, number> } | null): DayRow[] {
  const by = new Map(days.map((d) => [d.day, d]));
  return days.map((d) => {
    const y = by.get(addDays(d.day, -1));
    return {
      day: d.day,
      asleep: d.asleepMin != null ? d.asleepMin / 60 : null,
      bed: y?.bedLateH ?? null,
      drinks: y && y.logged ? y.alcoholG / 14 : null,
      lateCaf: y && y.logged ? y.lateCaffeineMg : null,
      protein: y?.proteinG ?? null,
      steps: y?.steps != null ? y.steps / 1000 : null,
      trained: y ? (y.trained ? 1 : 0) : null,
      hrv: band?.hrv?.[d.day] ?? null, rhr: band?.rhr?.[d.day] ?? null,
      focus: d.focus, mood: d.mood, energy: d.energy, sleepRating: d.sleep,
    };
  });
}
