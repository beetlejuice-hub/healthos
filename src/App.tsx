import { NowScreen } from "./components/NowScreen";
import { useEffect, useState } from "react";
import { Today } from "./screens/Today";
import { Log } from "./screens/Log";
import { WorkoutScreen } from "./screens/Workout";
import { Insights } from "./screens/Insights";
import { Settings } from "./screens/Settings";
import { readRoute, type Route } from "./lib/nav";
import { Dev } from "./screens/Dev";
import { Auth, NewPassword } from "./components/Auth";
import { useAuth } from "./lib/session";
import { UndoToast } from "./components/UndoToast";
import { act } from "./lib/store";
import { useScoutUnseen } from "./components/Scout";
import { AiScreen, useAiAuto, useAiUnread } from "./components/Ai";

/**
 * Four screens, one job each (owner, 29 Sept): Today = what needs you now; Log = add things;
 * Workout = bold logging at the gym; Insights = every metric (built for the laptop); AI = the chat, which can also write first. Settings
 * hangs off Today. Hash routes so the back button and home-screen shortcuts just work.
 */
export function App() {
  const auth = useAuth();
  const unseen = useScoutUnseen();
  const aiUnread = useAiUnread();
  useAiAuto(auth.session?.user.id);
  const [route, setRoute] = useState<Route>(() => readRoute()[0]);
  useEffect(() => {
    const on = () => { setRoute(readRoute()[0]); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  // Forgotten workouts close themselves: on open, when the app comes back, and every few minutes.
  useEffect(() => {
    const tidy = () => act.tidyWorkouts();
    tidy();
    const t = setInterval(tidy, 5 * 60_000);
    document.addEventListener("visibilitychange", tidy);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tidy); };
  }, [auth.session?.user.id]);

  if (!auth.ready) return <div className="app r-today" />;
  if (auth.recovering) return <div className="app r-today"><NewPassword done={auth.doneRecovering} /></div>;
  if (!auth.session) return <div className="app r-today"><Auth notice={auth.notice} /></div>;
  // The "How now?" Home Screen icon and its notifications open /now: just the check-in.
  if (location.pathname.replace(/\/$/, "") === "/now") return <NowScreen />;

  return (
    <div className={`app r-${route === "dev" ? "settings" : route}`}>
      <main className="screen">
        {route === "today" && <Today />}
        {route === "log" && <Log />}
        {route === "workout" && <WorkoutScreen />}
        {route === "insights" && <Insights />}
        {route === "ai" && <AiScreen />}
        {route === "settings" && <Settings tester={auth.tester} email={auth.session.user.email ?? ""} />}
        {route === "dev" && (auth.tester ? <Dev /> : <Settings tester={false} email={auth.session.user.email ?? ""} />)}
      </main>
      <UndoToast />
      <nav className="tabs" aria-label="Screens">
        {(["today", "log", "workout", "insights", "ai"] as const).map((r) => (
          <a key={r} href={`#${r}`} className={route === r ? "on" : ""} aria-current={route === r ? "page" : undefined}>
            <i />
            {r === "ai" ? "AI" : r[0].toUpperCase() + r.slice(1)}
            {r === "insights" && unseen > 0 && route !== "insights" && <b className="tabdot" aria-label={`${unseen} new pattern${unseen > 1 ? "s" : ""}`} />}
            {r === "ai" && aiUnread > 0 && route !== "ai" && <b className="tabdot" aria-label={`${aiUnread} new message${aiUnread > 1 ? "s" : ""} from the AI`} />}
          </a>
        ))}
      </nav>
    </div>
  );
}
