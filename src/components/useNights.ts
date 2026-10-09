import { useMemo } from "react";
import type { BandData } from "../lib/band";
import { caffeineAt } from "../lib/caffeine";
import type { Lanes } from "../lib/insights";
import { evenings, nights, type Evening, type Night } from "../lib/sleep";
import { stepsByDay } from "../lib/steps";
import { DAY, localDay } from "../lib/time";
import type { Entry } from "../lib/types";

/** The band's nights in the last `span` days and what each evening before held, and each worn day's steps — the Sleep, Heart and Mind pages share them. */
export function useNights(band: BandData | null, data: Lanes, entries: Entry[], halfLifeMin: number, now: number, span: number): { ns: Night[]; evs: Evening[]; steps: Map<string, number> } {
  const today = localDay(now);
  const steps = useMemo(() => (band ? stepsByDay(band.steps ?? [], band.hr, today) : new Map<string, number>()), [band, today]);
  const all = useMemo(() => (band ? nights(band.sleep, band.hr, band.rhr, band.hrv) : []), [band]);
  const ns = useMemo(() => all.filter((n) => n.up >= now - span * DAY && n.up <= now), [all, now, span]);
  const evs = useMemo(() => evenings(ns, {
    drinks: data.drinks, caffeineAt: (t) => caffeineAt(data.doses.map((d) => ({ at: d.at, mg: d.mg })), t, halfLifeMin),
    workouts: data.workouts, meals: entries.filter((e) => e.kind === "food"), ratings: entries.flatMap((e) => (e.kind === "sleep" ? [{ at: e.at, rating: e.rating }] : [])), steps,
  }), [ns, data, entries, halfLifeMin, steps]);
  return { ns, evs, steps };
}
