import { useMemo } from "react";
import type { BandData } from "../lib/band";
import { caffeineAt } from "../lib/caffeine";
import type { Lanes } from "../lib/insights";
import { evenings, nights, type Evening, type Night } from "../lib/sleep";
import { DAY } from "../lib/time";
import type { Entry } from "../lib/types";

/** The band's nights in the last `span` days and what each evening before held — the Sleep and Heart pages share them. */
export function useNights(band: BandData | null, data: Lanes, entries: Entry[], halfLifeMin: number, now: number, span: number): { ns: Night[]; evs: Evening[] } {
  const all = useMemo(() => (band ? nights(band.sleep, band.hr, band.rhr, band.hrv) : []), [band]);
  const ns = useMemo(() => all.filter((n) => n.up >= now - span * DAY && n.up <= now), [all, now, span]);
  const evs = useMemo(() => evenings(ns, {
    drinks: data.drinks, caffeineAt: (t) => caffeineAt(data.doses.map((d) => ({ at: d.at, mg: d.mg })), t, halfLifeMin),
    workouts: data.workouts, meals: entries.filter((e) => e.kind === "food"), ratings: entries.flatMap((e) => (e.kind === "sleep" ? [{ at: e.at, rating: e.rating }] : [])),
  }), [ns, data, entries, halfLifeMin]);
  return { ns, evs };
}
