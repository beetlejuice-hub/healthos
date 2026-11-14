/** The links of the last 120 days (lib/connect) and the things they're between — shared by Connecting the dots, the map
 * (renovation part 3) and Insights' "What to look at". */
import { useMemo } from "react";
import { useBand } from "../lib/band-client";
import type { Link, Thing } from "../lib/connect";
import { linksFor } from "../lib/linkscache";
import { useStore } from "../lib/store";
import { localDay } from "../lib/time";

export function useLinks(now: number): { things: Thing[]; links: Link[]; today: string } {
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), settings = useStore((s) => s.settings), imports = useStore((s) => s.imports);
  const band = useBand().data, today = localDay(now);
  // worked out once for every card and the AI (lib/linkscache), not once a card
  return useMemo(() => linksFor(entries, workouts, settings, band, imports, today), [entries, workouts, settings, band, today, imports]);
}
