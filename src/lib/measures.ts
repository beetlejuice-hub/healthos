/**
 * Every measure the trends are drawn from (PLAN 207), outside React: Trends, "Since you last looked", the steps around
 * which things changed (PLAN 229) and the AI's context all read the same ones. Pure (given the store's state and the band).
 */

import type { BandData } from "./band";
import { eveningInputs } from "./eveninputs";
import { dailyFacts } from "./insights";
import { clockH, evenings, nights, regularityByDay } from "./sleep";
import { sleepScore } from "./sleepscore";
import type { getState } from "./store";
import { stepsByDay } from "./steps";
import { overallStrength } from "./strength";
import { addDays, localDay } from "./time";
import type { LoggedSet } from "./training";
import type { Measure } from "./trends";
import type { EntryOf } from "./types";

/** The same, outside React (Since you last looked works them out once a visit). */
export function measuresOf(entries: ReturnType<typeof getState>["entries"], workouts: ReturnType<typeof getState>["workouts"], settings: ReturnType<typeof getState>["settings"], band: BandData | null, now: number): Measure[] {
  const today = localDay(now);
  {
    const from = addDays(today, -366), days = dailyFacts(entries, workouts, settings, from, addDays(today, -1));
    const s = (f: (d: (typeof days)[number]) => number | null | undefined) => { const o: Record<string, number> = {}; for (const d of days) { const v = f(d); if (v != null && Number.isFinite(v)) o[d.day] = v; } return o; };
    const ms: Measure[] = [];
    if (band) {
      const ns = nights(band.sleep, band.hr, band.rhr, band.hrv).filter((x) => x.day > from && x.day <= today).sort((a, b) => a.bed - b.bed);
      const evs = evenings(ns, eveningInputs(entries, workouts, settings.halfLifeMin));
      const score: Record<string, number> = {}, asleep: Record<string, number> = {}, bed: Record<string, number> = {};
      ns.forEach((x, i) => { score[x.day] = sleepScore(x, evs[i].rating, ns).score; asleep[x.day] = x.asleep / 60; bed[x.eve] = clockH(x.bed, x.eve); });
      const steps = Object.fromEntries([...stepsByDay(band.steps ?? [], band.hr, today).entries()].filter(([d, v]) => d < today && v > 0).map(([d, v]) => [d, v / 1000]));
      ms.push({ key: "score", name: "Sleep score", unit: "", better: 1, series: score }, { key: "asleep", name: "Asleep", unit: "", better: 1, series: asleep },
        { key: "bed", name: "In bed", unit: "", better: -1, series: bed },
        // PLAN 210: how alike the last 7 nights were, morning by morning (on the Sleep page as one number)
        { key: "regular", name: "Sleep regularity", unit: "/100", better: 1, series: regularityByDay(ns) }, { key: "hrv", name: "HRV", unit: "ms", better: 1, series: band.hrv },
        { key: "rhr", name: "Resting heart", unit: "bpm", better: -1, series: band.rhr },
        { key: "vo2", name: "VO2 max", unit: "", better: 1, series: Object.fromEntries(Object.entries(band.vo2 ?? {}).map(([d, v]) => [d, v.v])) },
        { key: "steps", name: "Steps", unit: "", better: 1, series: steps });
    }
    const weight: Record<string, number> = {};
    for (const e of entries) if (e.kind === "weight") weight[localDay(e.at)] = e.kg;
    const sets = entries.filter((e): e is EntryOf<"set"> => e.kind === "set") as LoggedSet[];
    const strength = Object.fromEntries(overallStrength(sets, now).weeks.map((w) => [localDay(w.week), w.index]));
    ms.push({ key: "weight", name: "Weight", unit: "kg", better: -1, series: weight },
      { key: "protein", name: "Protein", unit: "g", better: 1, series: s((d) => d.proteinG) },
      { key: "kcal", name: "Calories", unit: "kcal", better: 0, series: s((d) => d.kcal) },
      { key: "drinks", name: "Drinks", unit: "a day", better: -1, series: s((d) => (d.logged ? d.alcoholG / 14 : null)) },
      { key: "caffeine", name: "Caffeine", unit: "mg", better: 0, series: s((d) => (d.logged ? d.caffeineMg : null)) },
      { key: "mood", name: "Mood", unit: "/10", better: 1, series: s((d) => d.mood) },
      { key: "energy", name: "Energy", unit: "/10", better: 1, series: s((d) => d.energy) },
      { key: "focus", name: "Focus", unit: "/10", better: 1, series: s((d) => d.focus) },
      { key: "strength", name: "Strength", unit: "index", better: 1, series: strength });
    return ms;
  }
}
