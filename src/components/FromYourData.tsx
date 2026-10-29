/**
 * Today: "From your data", one line (reform T4; owner, 29 Oct: Yes to "One line, the newest thing worth knowing, linked
 * to Findings. The rest is already on Findings."). It stacked three: Noticed ("You burn about 2,650 kcal a day"), New lead
 * and Next answer. Now the first of: a new lead you haven't looked at — not one the pattern card above already draws —
 * then Noticed's top finding (✕ hides it until its number changes), then the answer the app is nearest to. Nothing to
 * say → no card.
 */

import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { notice } from "../lib/findings";
import { currentKg } from "../lib/body";
import { useScout } from "./Scout";
import { useTodayPatterns } from "./TodayPattern";

const HIDDEN = "healthos.noticed.hidden";
const SLOW = 10 * 60_000;

export function FromYourData({ now }: { now: number }) {
  const entries = useStore((x) => x.entries), goals = useStore((x) => x.goals), settings = useStore((x) => x.settings);
  const workouts = useStore((x) => x.workouts), supplements = useStore((x) => x.supplements);
  const scouted = useScout(), drawn = useTodayPatterns(now);
  // the findings engine every 10 minutes, not on every tick of Today's clock
  const slow = Math.floor(now / SLOW) * SLOW;
  const n = useMemo(() => notice(entries, goals, slow, currentKg(entries, settings.bodyKg, slow), { workouts, supplements, settings }), [entries, goals, slow, settings, workouts, supplements]);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(HIDDEN) ?? ""; } catch { return ""; } });
  const lead = scouted.find((x) => !x.memo && !drawn.some((c) => c.id === x.p.id));
  // Today shows the strongest finding that isn't just a description of you
  const top = n.found.find((f) => f.id !== "baseline"), topKey = top ? `${top.id}:${top.value}` : "";
  const next = n.checking[0];
  const line = lead ? (
    <a className="noticed-line" href="#insights/connections" onClick={() => setTimeout(() => document.getElementById("scout")?.scrollIntoView({ behavior: "smooth" }), 150)}>
      <span><small>New lead</small>{lead.p.text} — {lead.p.held} of {lead.p.of} times.</span>
      <span className="r">→</span>
    </a>
  ) : top && hidden !== topKey ? (
    <a className="noticed-line" href="#insights/connections" onClick={() => setTimeout(() => document.getElementById(`n-${top.id}`)?.scrollIntoView({ behavior: "smooth" }), 150)}>
      <span><small>Noticed</small>{top.title}.</span>
      <button type="button" aria-label="Hide this" onClick={(e) => { e.preventDefault(); setHidden(topKey); try { localStorage.setItem(HIDDEN, topKey); } catch { /* private mode */ } }}>✕</button>
    </a>
  ) : next ? (
    <a className="nextanswer" href="#insights">
      <span><small>Next answer</small>{next.question}<em>needs {next.missing}</em></span>
      <span className="bar" aria-label={`${Math.round(next.progress * 100)}% there`}><i style={{ width: `${Math.round(next.progress * 100)}%` }} /></span>
    </a>
  ) : null;
  if (!line) return null;
  return (
    <section className="card t2-data" aria-label="From your data">
      <h3>From your data</h3>
      {line}
    </section>
  );
}
