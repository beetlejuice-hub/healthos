/**
 * The one engine's answers for the pages (PLAN 188 phase 2): the same 90 days Noticed reads, worked out once per change of
 * your data. Connections (and Top, Body) pass it to comparisons, so their rows say what Noticed's test says.
 */
import { useMemo } from "react";
import { useStore } from "../lib/store";
import { dailyFacts } from "../lib/insights";
import { EFFECT_DAYS } from "../lib/findings";
import { evidence, type Evidence } from "../lib/evidence";
import { addDays, localDay } from "../lib/time";

export function useEvidence(): Evidence {
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), settings = useStore((s) => s.settings), supplements = useStore((s) => s.supplements);
  const today = localDay(Date.now());
  return useMemo(() => evidence(dailyFacts(entries, workouts, settings, addDays(today, -EFFECT_DAYS), addDays(today, -1)), supplements), [entries, workouts, settings, supplements, today]);
}
