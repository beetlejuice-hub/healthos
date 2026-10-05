/**
 * Insights → "Look at these first" (lib/top): the clearest things you can change, ranked, each with a
 * two-week test on yourself. Starting one adds it to Experiments, which judges it on the 14 days before
 * vs the days since. Shown right under your week.
 */

import { useMemo } from "react";
import { useStore } from "../lib/store";
import type { GlanceDay } from "../lib/glance";
import { comparisons } from "../lib/connections";
import { topCards } from "../lib/top";
import { startExperiment } from "./Ai";
import { addDays } from "../lib/time";

const sg = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;

export function Top({ days }: { days: GlanceDay[] }) {
  const supplements = useStore((s) => s.supplements), experiments = useStore((s) => s.ai.experiments);
  const cards = useMemo(() => topCards(comparisons(days, supplements), supplements), [days, supplements]);
  if (!days.some((d) => d.mood != null)) return null;
  const today = days[days.length - 1]?.day ?? "";
  const runningOf = (name: string) => experiments.find((x) => x.name === name && !x.ended);
  return (
    <section className="gp gl-top" id="ins-top" aria-label="Look at these first">
      <header className="gp-h"><div><span className="gp-k">Look at these first</span><h2>The clearest things you can change</h2>
        <p className="gp-ans">{cards.length ? "Ranked by how big the difference is. Each one has a two-week test you can run on yourself — Experiments then judges it on the days before vs the days since." : "Nothing you can change stands out clearly yet. Connections below shows what's still collecting days."}</p></div></header>
      {cards.length > 0 && <div className="top-cards">{cards.map((c) => {
        const r = c.rows[0], run = c.protocol ? runningOf(c.protocol.name) : undefined;
        const dayN = run ? Math.max(1, Math.round((Date.parse(today) - Date.parse(run.start)) / 864e5) + 1) : 0;
        return (
          <article key={c.lever} className={`top-card ${c.effect > 0 ? "good" : "bad"}`}>
            <span className="gp-k">{r.group} · clear · {r.nWith} vs {r.nWithout} days</span>
            <h3>{c.title}</h3>
            <div className="top-v">{sg(r.diff!.value)}<small>points on {r.outcome}</small></div>
            <p className="top-ev">95% range {sg(r.diff!.lo)} to {sg(r.diff!.hi)}{c.rows.length > 1 ? ` · ${c.rows.length} outcomes clear` : ""}</p>
            {c.protocol && (run
              ? <p className="top-run">Running · day {Math.min(dayN, run.days)} of {run.days} · ends {addDays(run.start, run.days).slice(5).split("-").reverse().join(".")}</p>
              : <button type="button" className="top-try" onClick={() => startExperiment(c.protocol!)}><b>Try {c.protocol.days} days:</b> {c.protocol.name}<small>{c.protocol.how}</small></button>)}
          </article>
        );
      })}</div>}
      <footer className="gp-f"><span className="gl-dim">Goes with, not causes — a test on yourself is how to find out. Not medical advice; check with your doctor before stopping anything prescribed.</span></footer>
    </section>
  );
}
