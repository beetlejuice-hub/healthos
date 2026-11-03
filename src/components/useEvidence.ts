/**
 * The one engine's answers for the pages (PLAN 188 phase 2): the same 90 days Noticed reads, worked out once per change of
 * your data. Connections (and Top, Body) pass it to comparisons, so their rows say what Noticed's test says.
 */
import { useCallback, useMemo } from "react";
import { useBand } from "../lib/band-client";
import { useWeather } from "../lib/weather-client";
import { withBand } from "../lib/daysband";
import { withWeather } from "../lib/weather";
import type { DayFacts } from "../lib/insights";
import { useStore } from "../lib/store";
import { dailyFacts } from "../lib/insights";
import { EFFECT_DAYS } from "../lib/findings";
import { evidence, type Evidence } from "../lib/evidence";
import { addDays, localDay } from "../lib/time";

/** Each day with the band's side (late nights) and the weather's (PLAN 188, the new signals) — what the engine reads. */
export function useEnrich(): (days: DayFacts[]) => DayFacts[] {
  const band = useBand().data, weather = useWeather(), today = localDay(Date.now());
  return useCallback((days: DayFacts[]) => withWeather(withBand(days, band, today), weather), [band, weather, today]);
}

export function useEvidence(): Evidence {
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), settings = useStore((s) => s.settings), supplements = useStore((s) => s.supplements);
  const today = localDay(Date.now()), enrich = useEnrich();
  return useMemo(() => evidence(enrich(dailyFacts(entries, workouts, settings, addDays(today, -EFFECT_DAYS), addDays(today, -1))), supplements), [entries, workouts, settings, supplements, today, enrich]);
}
