/**
 * /now — just the check-in, for the "How now?" Home Screen icon and the How now? notifications:
 * open, tap or slide each feeling, done. The full app is one tap away.
 */

import { HowNow } from "./HowNow";
import { useNow } from "../screens/Today";
import { clock, dayLabel } from "../lib/time";

export function NowScreen() {
  const now = useNow(30_000);
  const installed = typeof window !== "undefined" && (matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  return (
    <div className="app r-today now-app">
      <main className="screen calm now-screen">
        <div className="head"><span>{dayLabel(now)} · {clock(now)}</span><a href="/#today">Open HealthOS</a></div>
        <HowNow now={now} always />
        {!installed && <p className="note now-tip">Tip: Share → Add to Home Screen here makes this a one-tap “How now?” icon.</p>}
      </main>
    </div>
  );
}
