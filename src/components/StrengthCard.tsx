/**
 * Overall strength, as a line (PLAN 143; owner, 20 Oct: "a graph of my overall strength computed from kgs lifted and reps
 * how its evolving? Make it smart"). 100 = the first week; each week moves by how his lifts did against their own last
 * time (lib/strength). The verdict under it is the pooled 8-week trend with its range, so one good day isn't called
 * progress. Kg lifted a week as bars below. On the Workout screen and the Training page.
 */

import { useMemo } from "react";
import { Bars, LineChart } from "./Charts";
import { overallStrength, overallWords } from "../lib/strength";
import type { LoggedSet } from "../lib/training";
import { dayLabel } from "../lib/time";

const short = (t: number) => dayLabel(t).replace(/^\w+ /, "");

export function StrengthCard({ sets, now, className }: { sets: LoggedSet[]; now: number; className: string }) {
  const o = useMemo(() => overallStrength(sets, now), [sets, now]);
  if (o.weeks.length < 2) return (
    <section className={className} aria-label="Overall strength">
      <span className="k">Overall strength</span>
      <p className="s">After two weeks of lifting, your overall strength shows here — every lift's best set (kg × reps), each measured against itself.</p>
    </section>
  );
  const pts = o.weeks.map((w, i): [number, number] => [i, +w.index.toFixed(1)]), ys = pts.map((p) => p[1]);
  const lo = Math.floor(Math.min(100, ...ys) - 1), hi = Math.ceil(Math.max(100, ...ys) + 1), n = pts.length - 1;
  const ch = o.change ?? 0;
  return (
    <section className={className} aria-label="Overall strength">
      <span className="k">Overall strength</span>
      <div className="os-head"><b className="os-big">{ch >= 0 ? "+" : "−"}{Math.abs(ch).toFixed(1)} %</b><span className="s">since {short(o.weeks[0].week)} · {o.weeks.length} weeks</span></div>
      <LineChart label={`Overall strength by week, 100 = the week of ${short(o.weeks[0].week)}`} h={120} lo={lo} hi={hi} xs={[0, n]} yfmt={(v) => String(Math.round(v))}
        targets={[[100, "start"]]} xlabels={[[0, short(o.weeks[0].week)], [n, "this week"]]}
        series={[{ pts, color: "var(--gym)", width: 2, dots: true }]} />
      <p className={`s os-verdict${o.state ? ` ${o.state}` : ""}`}>{overallWords(o)}</p>
      <Bars label="Kg lifted a week" h={70} pts={o.weeks.map((w, i): [number, number] => [i, Math.round(w.kg)])} lo={0} hi={Math.max(...o.weeks.map((w) => w.kg)) * 1.1} xs={[0, n]} color="var(--gym)"
        yfmt={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))} xlabels={[[0, "kg lifted a week"]]} />
    </section>
  );
}
