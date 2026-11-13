/** The links of the last 120 days (lib/connect) and the things they're between — shared by Connecting the dots, the map
 * (renovation part 3) and Insights' "What to look at". */
import { useMemo } from "react";
import { useBand } from "../lib/band-client";
import { connect, thingsFrom, type Link, type Thing } from "../lib/connect";
import { withBand, withImports } from "../lib/daysband";
import { dailyFacts } from "../lib/insights";
import { useStore } from "../lib/store";
import { addDays, localDay } from "../lib/time";

export function useLinks(now: number): { things: Thing[]; links: Link[]; today: string } {
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), settings = useStore((s) => s.settings), imports = useStore((s) => s.imports);
  const band = useBand().data, today = localDay(now);
  return useMemo(() => {
    const days = withImports(withBand(dailyFacts(entries, workouts, settings, addDays(today, -120), addDays(today, -1)), band, today), imports);
    const things = thingsFrom(days, band);
    return { things, links: connect(things), today };
  }, [entries, workouts, settings, band, today, imports]);
}
