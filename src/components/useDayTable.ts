/**
 * The days as rows (lib/daytable) and the facts under them, for why today, what makes a day, the day lines and the
 * ripples (PLAN 208): the last 120 days and today so far, with the band's. Only reads.
 */

import { useMemo } from "react";
import { useBand } from "../lib/band-client";
import { dayTable, type DayRow } from "../lib/daytable";
import { withBand, withImports } from "../lib/daysband";
import { dailyFacts, type DayFacts } from "../lib/insights";
import { useStore } from "../lib/store";
import { addDays, localDay } from "../lib/time";

export function useDayTable(now: number): { rows: DayRow[]; days: DayFacts[]; band: ReturnType<typeof useBand>["data"]; today: string } {
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), settings = useStore((s) => s.settings), imports = useStore((s) => s.imports);
  const band = useBand().data, today = localDay(now);
  return useMemo(() => {
    const days = withImports(withBand(dailyFacts(entries, workouts, settings, addDays(today, -120), today), band, today), imports);
    return { rows: dayTable(days, band), days, band, today };
  }, [entries, workouts, settings, band, today, imports]);
}
