/** This morning's body watch (PLAN 210, lib/bodywatch) for the card and the night check that steps aside for it. */

import { useMemo } from "react";
import { useBand } from "../lib/band-client";
import { bodyWatch, illDays } from "../lib/bodywatch";
import { useStore } from "../lib/store";
import { localDay } from "../lib/time";
import { useDayTable } from "./useDayTable";

/** This morning's body watch, or null without the band. */
export function useBodyWatch(now: number) {
  const band = useBand().data, entries = useStore((s) => s.entries), { days, today } = useDayTable(now);
  return useMemo(() => {
    if (!band) return null;
    const out = new Set(days.filter((d) => d.logged && d.alcoholG >= 42).map((d) => d.day));
    return bodyWatch(band, today, illDays(entries, localDay), out);
  }, [band, entries, days, today]);
}
