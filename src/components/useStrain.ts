/** The strain note's facts (PLAN 227, lib/strain) — its own file, so Today's brief doesn't carry the Training card with it. */

import { useMemo } from "react";
import { useBand } from "../lib/band-client";
import { hrvStatus, strainBuilding, weekLoad } from "../lib/strain";
import { useStore } from "../lib/store";
import { localDay } from "../lib/time";

const D = 86_400_000;

/** The strain note's facts, for this card and Today's brief: null when there's nothing building. */
export function useStrain(now: number) {
  const band = useBand().data, workouts = useStore((s) => s.workouts), entries = useStore((s) => s.entries);
  return useMemo(() => {
    const today = localDay(now);
    const s = band ? hrvStatus(band.hrv ?? {}, band.rhr ?? {}, today) : null, load = weekLoad(workouts, now), strain = strainBuilding(s);
    const drinksIn = (from: number, to: number) => entries.reduce((a, e) => a + (e.kind === "drink" && e.at > from && e.at <= to ? e.alcoholG / 14 : 0), 0);
    const drinks = drinksIn(now - 7 * D, now), drinksUsual = drinksIn(now - 35 * D, now - 7 * D) / 4;
    const goes = [
      load.usual && load.week >= 1.3 * load.usual ? `this week's load ${Math.round((load.week / load.usual - 1) * 100)} % over your usual` : null,
      drinks >= 3 && drinks >= 1.5 * drinksUsual + 1 ? `${Math.round(drinks)} drinks this week (usual ${Math.round(drinksUsual)})` : null,
    ].filter((x): x is string => !!x);
    return { s, load, strain, goes };
  }, [band, workouts, entries, now]);
}

