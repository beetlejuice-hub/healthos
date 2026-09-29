import { useEffect, useState } from "react";
import { Today } from "./screens/Today";
import { Log } from "./screens/Log";
import { WorkoutScreen } from "./screens/Workout";
import { Insights } from "./screens/Insights";
import { Settings } from "./screens/Settings";
import { readRoute, type Route } from "./lib/nav";

/**
 * Four screens, one job each (owner, 29 Sept): Today = what needs you now; Log = add things;
 * Workout = bold logging at the gym; Insights = every metric (built for the laptop). Settings
 * hangs off Today. Hash routes so the back button and home-screen shortcuts just work.
 */
export function App() {
  const [route, setRoute] = useState<Route>(() => readRoute()[0]);
  useEffect(() => {
    const on = () => { setRoute(readRoute()[0]); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  return (
    <div className={`app r-${route}`}>
      <main className="screen">
        {route === "today" && <Today />}
        {route === "log" && <Log />}
        {route === "workout" && <WorkoutScreen />}
        {route === "insights" && <Insights />}
        {route === "settings" && <Settings />}
      </main>
      <nav className="tabs" aria-label="Screens">
        {(["today", "log", "workout", "insights"] as const).map((r) => (
          <a key={r} href={`#${r}`} className={route === r ? "on" : ""} aria-current={route === r ? "page" : undefined}>
            <i />
            {r[0].toUpperCase() + r.slice(1)}
          </a>
        ))}
      </nav>
    </div>
  );
}
