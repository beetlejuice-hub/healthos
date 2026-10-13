/**
 * The band's nights, for the AI (PLAN 88 phase 2; owner, 13 Oct: "can ai or app determine more things about sleep based on
 * all the data it gets?"). Until now it saw your morning ratings but not one night from the band. One line a night, newest
 * last: what the band measured, then what the evening before held — the same facts the Sleep grid tests. Pure.
 */

import type { BandData } from "../band";
import { eveningInputs } from "../eveninputs";
import { nightLabel, phoneLabel } from "../lastnight";
import { evenings, nights, type Evening, type Night } from "../sleep";
import { clock, DAY } from "../time";
import type { Entry, Supplement, Workout } from "../types";

const hm = (min: number) => { const t = Math.round(min); return `${Math.floor(t / 60)}h${String(t % 60).padStart(2, "0")}`; };

/** One night in words: the band first, then the evening before. */
export function nightLines(ns: Night[], evs: Evening[], supplements: Pick<Supplement, "id" | "name">[]): string[] {
  const name = (id: string) => supplements.find((s) => s.id === id)?.name ?? id;
  return ns.map((n, i) => {
    const e = evs[i];
    const band = [`bed ${clock(n.bed)}`, `asleep ${hm(n.asleep)}`, `fell asleep in ${Math.round(n.latency)} min`, `woke ${n.wakes}×`,
      n.deep != null && `deep ${Math.round(n.deep)} min`, n.rem != null && `REM ${Math.round(n.rem)} min`,
      n.low != null && `lowest HR ${Math.round(n.low)}${n.lowAt != null ? ` at ${clock(n.lowAt)}` : ""}`, n.hrv != null && `HRV ${Math.round(n.hrv)} ms`,
      n.nap && `napped ${Math.round(n.nap.min)} min that day`].filter(Boolean);
    const supps = Object.entries(e.supps ?? {}).map(([id, took]) => (took ? `took ${name(id)}` : `didn't take ${name(id)}`));
    const eve = [e.drinks.length > 0 && `${e.drinks.length} drink${e.drinks.length > 1 ? "s" : ""}`, e.caffeineAtBed >= 10 && `${Math.round(e.caffeineAtBed)} mg caffeine at bed`,
      e.lastMealMin != null && `last meal ${hm(e.lastMealMin)} before bed`, e.eveKcal != null && `${Math.round(e.eveKcal)} kcal from 17:00`,
      e.trained && (e.lateTrain ? "trained within 3 h of bed" : "trained that day"), e.eveStress != null && `evening stress ${e.eveStress}/10`, ...supps,
      e.tags?.length && `last night: ${e.tags.map(nightLabel).join(", ")}`, e.phoneMin != null && `${phoneLabel(e.phoneMin)} before sleep`, e.rating != null && `rated it ${e.rating}/10`].filter(Boolean);
    return `${n.day} (night from ${n.eve}): ${band.join(", ")}${eve.length ? ` · evening before: ${eve.join(", ")}` : ""}`;
  });
}

/** The last `days` nights the band has, each with its evening, as lines. */
export function nightsForAi(st: { entries: Entry[]; workouts: Workout[]; supplements: Supplement[]; halfLifeMin: number }, band: BandData, now: number, days = 14): string[] {
  const ns = nights(band.sleep, band.hr, band.rhr, band.hrv).filter((n) => n.up <= now && n.up >= now - days * DAY);
  if (!ns.length) return [];
  const evs = evenings(ns, eveningInputs(st.entries, st.workouts, st.halfLifeMin));
  return nightLines(ns, evs, st.supplements);
}
