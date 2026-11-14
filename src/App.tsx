import { NowScreen } from "./components/NowScreen";
import { Component, lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from "react";
import type React from "react";
import { Today } from "./screens/Today";
import { readRoute, type Route } from "./lib/nav";
import { Auth, NewPassword } from "./components/Auth";
import { useAuth } from "./lib/session";
import { UndoToast } from "./components/UndoToast";
import { act } from "./lib/store";
import { useScoutUnseen } from "./components/Scout";
import { AiScreen, useAiAuto, useAiUnread } from "./components/Ai";
import { useInbox } from "./components/useInbox";
import { useEnergyGoal } from "./components/useEnergy";
import { startBand } from "./lib/band-client";
import { startUsage } from "./lib/usage-client";
import { startHealth } from "./lib/health-client";

// each screen's file asked for once — the one in the address bar from the start, beside signing in — and kept when it comes
type Loads = { log: typeof import("./screens/Log"); workout: typeof import("./screens/Workout"); insights: typeof import("./screens/Insights"); settings: typeof import("./screens/Settings"); dev: typeof import("./screens/Dev") };
const IMPORTS: { [K in keyof Loads]: () => Promise<Loads[K]> } = {
  log: () => import("./screens/Log"), workout: () => import("./screens/Workout"), insights: () => import("./screens/Insights"),
  settings: () => import("./screens/Settings"), dev: () => import("./screens/Dev"),
};
const got: Partial<Loads> = {}, asked: Partial<Record<keyof Loads, Promise<unknown>>> = {};
function load<K extends keyof Loads>(k: K): Promise<Loads[K]> {
  return (asked[k] ??= IMPORTS[k]().then((m) => (got[k] = m)).catch((e: unknown) => { delete asked[k]; throw e; })) as Promise<Loads[K]>;
}
load.quiet = (k: keyof Loads) => { load(k).catch(() => { /* offline: tried again when it's opened */ }); };
if ((readRoute()[0] as string) in IMPORTS) load.quiet(readRoute()[0] as keyof Loads);

/**
 * A screen loaded when it's first opened (PLAN 195; owner, 4 Nov: "4" — the app was one 1.5 MB file, every page and chart
 * before Today showed). Once its file is here it draws at once (React holds a loading screen at least 300 ms). A deploy
 * since this page loaded leaves the old file gone: the page reloads once to the new app rather than stay blank; a second
 * miss within 30 s is a real error.
 */
function screen<K extends keyof Loads, P extends object>(k: K, pick: (m: Loads[K]) => ComponentType<P>) {
  const Lazy = lazy(() => load(k).then((m) => ({ default: pick(m) })).catch((e: unknown) => {
    let last = 0;
    try { last = Number(sessionStorage.getItem("healthos.reloadedFor") || 0); } catch { /* private mode: no memory, reload anyway */ }
    if (Date.now() - last > 30_000) {
      try { sessionStorage.setItem("healthos.reloadedFor", String(Date.now())); } catch { /* as above */ }
      location.reload();
      return new Promise<never>(() => {});
    }
    throw e;
  }));
  return function Screen(props: P) {
    // decided once per opening: switching from the lazy one to the direct one later would start the screen over
    const [direct] = useState(() => !!got[k]), m = got[k], C = direct && m ? pick(m as Loads[K]) : null;
    return C ? <C {...props} /> : <Lazy {...(props as P & React.JSX.IntrinsicAttributes)} />;
  };
}
const Log = screen("log", (m) => m.Log);
const WorkoutScreen = screen("workout", (m) => m.WorkoutScreen);
const Insights = screen("insights", (m) => m.Insights);
const Settings = screen("settings", (m) => m.Settings);
const Dev = screen("dev", (m) => m.Dev);
/** A screen that still won't load (offline, or the new app's file missing too): a line and Try again, never a blank page. */
class ScreenFailed extends Component<{ children: ReactNode; route: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(before: { route: string }) { if (before.route !== this.props.route && this.state.failed) this.setState({ failed: false }); }
  render() {
    return this.state.failed
      ? <div className="card screen-failed" role="alert"><p>This page didn't load — the connection may be down.</p><button type="button" className="pill-btn pri" onClick={() => location.reload()}>Try again</button></div>
      : this.props.children;
  }
}
/** Once the first screen has drawn, the others come down in the background, so a tab opens at once. */
const fetchTheRest = () => { for (const k of Object.keys(IMPORTS) as (keyof Loads)[]) load.quiet(k); };

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
  useInbox();
  useEnergyGoal();
  const [route, setRoute] = useState<Route>(() => readRoute()[0]);
  useEffect(fetchTheRest, []);
  useEffect(() => {
    const on = () => { setRoute(readRoute()[0]); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  // The band's heart rate and sleep: pulled on open and every 15 minutes (lib/band-client).
  const signedIn = !!auth.session;
  useEffect(() => { if (signedIn) { startBand(); startHealth(); startUsage(); } }, [signedIn]);

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
        <ScreenFailed route={route}><Suspense fallback={<p className="note screen-wait" aria-busy="true">Opening…</p>}>
        {route === "today" && <Today />}
        {route === "log" && <Log />}
        {route === "workout" && <WorkoutScreen />}
        {route === "insights" && <Insights />}
        {route === "ai" && <AiScreen />}
        {route === "settings" && <Settings tester={auth.tester} email={auth.session.user.email ?? ""} />}
        {route === "dev" && (auth.tester ? <Dev /> : <Settings tester={false} email={auth.session.user.email ?? ""} />)}
        </Suspense></ScreenFailed>
      </main>
      <UndoToast />
      <nav className="tabs" aria-label="Screens">
        {(["today", "log", "workout", "insights", "ai"] as const).map((r) => (
          <a key={r} href={`#${r}`} className={route === r ? "on" : ""} aria-current={route === r ? "page" : undefined}>
            <i />
            {r === "ai" ? "AI" : r[0].toUpperCase() + r.slice(1)}
            {r === "insights" && unseen > 0 && route !== "insights" && <b className="tabdot" aria-label={`${unseen} new pattern${unseen > 1 ? "s" : ""}`} />}
            {/* owner, 15 Oct: "a red circle w a number on it like how many new messages and i can click on it, it brings me to the chat page" */}
            {r === "ai" && aiUnread > 0 && route !== "ai" && <b className="tabbadge" aria-label={`${aiUnread} new message${aiUnread > 1 ? "s" : ""}`}>{aiUnread > 9 ? "9+" : aiUnread}</b>}
          </a>
        ))}
      </nav>
    </div>
  );
}
