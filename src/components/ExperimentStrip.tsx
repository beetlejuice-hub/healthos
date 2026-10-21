/**
 * The experiments you're running, on Today (PLAN 160; owner, 21 Oct: "make experiments easier to find … start on these"):
 * one line each — its day and what to do today; when it's done, the result until you've opened it. A tap opens it on
 * Insights → Training (lib/ai/experiment experimentStrip).
 */

import { useMemo } from "react";
import { act, useStore } from "../lib/store";
import { experimentStrip } from "../lib/ai/experiment";
import { judge } from "../lib/ai/apply";
import { dailyFacts } from "../lib/insights";
import { addDays, localDay } from "../lib/time";
import { go } from "../lib/nav";

export function ExperimentStrip({ now }: { now: number }) {
  const xs = useStore((s) => s.ai.experiments), entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), settings = useStore((s) => s.settings);
  const today = localDay(now);
  const lines = useMemo(() => {
    // the 120 days of facts only when one has finished without a verdict (the app's own result is shown then)
    let facts: ReturnType<typeof dailyFacts> | null = null;
    return experimentStrip(xs, today, (x) => judge(x, (facts ??= dailyFacts(entries, workouts, settings, addDays(today, -120), addDays(today, -1))), today).state);
  }, [xs, entries, workouts, settings, today]);
  if (!lines.length) return null;
  const open = (id: string, done: boolean) => {
    if (done) act.setAi((a) => ({ experiments: a.experiments.map((x) => (x.id !== id ? x : x.verdict ? { ...x, verdict: { ...x.verdict, seen: Date.now() } } : { ...x, seen: Date.now() })) }));
    go("insights", "training");
    setTimeout(() => document.getElementById("experiments")?.scrollIntoView({ block: "start", behavior: "smooth" }), 250);
  };
  return (
    <ul className="xp-strip" aria-label="Your experiments">
      {lines.map((l) => (
        <li key={l.id} data-done={l.done || undefined}>
          <button type="button" onClick={() => open(l.id, l.done)}><span aria-hidden="true">🧪</span><b>{l.text}</b><span className="xp-sub">{l.sub}</span><span className="chev" aria-hidden="true">›</span></button>
        </li>
      ))}
    </ul>
  );
}
