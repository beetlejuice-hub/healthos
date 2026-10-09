export type Route = "today" | "log" | "workout" | "insights" | "ai" | "settings" | "dev";
export const ROUTES: Route[] = ["today", "log", "workout", "insights", "ai", "settings", "dev"];

/** Current route and optional sub-path from the hash: `#log/drink` → ["log", "drink"]. */
export function readRoute(): [Route, string | undefined] {
  const [r, sub] = location.hash.slice(1).split("/") as [Route, string | undefined];
  return [ROUTES.includes(r) ? r : "today", sub];
}

export const go = (r: Route, sub?: string) => { location.hash = sub ? `${r}/${sub}` : r; };

/** A day and time for Log to open on, set by Today's catch-up ("No dinner logged yesterday → Log it") and read once by Log. */
export const LOG_FOR_KEY = "healthos.logFor";
