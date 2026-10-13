/**
 * Tonight, in the evening's Now card (PLAN 88; owner, 13 Oct: "I'm big on sleep and how it affects me and foods and
 * activities"): what your own nights say about nights like this one, from the Sleep grid's clear and likely cells. Only
 * when there's something to say, at most three lines — Today stays calm. Numbers from lib/tonight.
 */

import { useEffect, useMemo } from "react";
import { loadBandBefore, useBand } from "../lib/band-client";
import { tonightsBed } from "../lib/caffeine-sleep";
import { eveningInputs } from "../lib/eveninputs";
import { evenings, FACTORS, goesWith, nights, suppFactors } from "../lib/sleep";
import { useStore } from "../lib/store";
import { clock, DAY } from "../lib/time";
import { phrase, tonightEve, tonightLines, tonightNight } from "../lib/tonight";

export function Tonight({ now }: { now: number }) {
  const band = useBand().data;
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), supplements = useStore((s) => s.supplements);
  const halfLife = useStore((s) => s.settings.halfLifeMin), bedMinute = useStore((s) => s.settings.bedMinute);
  // the grid needs a month of nights, not the band's usual week; asked again whenever the band's data changes (a load
  // already running drops this one)
  useEffect(() => { if (band) void loadBandBefore(now - 32 * DAY); }, [band, now]);
  // still up past the planned bedtime (00:30): bedtime is now, not a time already gone
  const eve = tonightEve(now), bed = Math.max(tonightsBed(now, bedMinute), Math.ceil(now / 60_000) * 60_000);
  const ns = useMemo(() => (band ? nights(band.sleep, band.hr, band.rhr, band.hrv).filter((n) => n.eve < eve && n.up >= now - 32 * DAY) : []), [band, eve, now]);
  const inputs = useMemo(() => eveningInputs(entries, workouts, halfLife), [entries, workouts, halfLife]);
  const past = useMemo(() => evenings(ns, inputs), [ns, inputs]);
  // the grid only changes when past evenings do — not each time something is logged tonight
  const pastKey = JSON.stringify(past);
  const factors = useMemo(() => [...FACTORS, ...suppFactors(supplements, past)], [supplements, pastKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const cells = useMemo(() => (ns.length >= 10 ? goesWith(ns, past, { factors }) : []), [ns, pastKey, factors]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = useMemo(() => tonightNight(eve, bed), [eve, bed]);
  const e = useMemo(() => evenings([...ns, n], inputs).at(-1)!, [ns, n, inputs]);
  const lines = useMemo(() => tonightLines(factors, cells, n, e), [factors, cells, n, e]);
  if (!lines.length) return null;
  return (
    <section className="t2-tonight" aria-label="Tonight, from your nights so far">
      <span className="k">Tonight · from your nights so far</span>
      {lines.map((l) => {
        const what = phrase(l.cell.outcome, l.cell.diff!), sure = <em className={`sure ${l.cell.sure}`}>{l.cell.sure}</em>;
        const name = l.factor.name.replace(/ that day$/, "");
        return l.kind === "missing"
          ? <p key={l.factor.id} data-factor={l.factor.id} data-kind="missing">{name} isn't logged today — nights with it went with <b>{what}</b> · {sure}</p>
          : <p key={l.factor.id} data-factor={l.factor.id} data-kind="holds">{l.factor.id === "caf" ? `About ${Math.round(e.caffeineAtBed)} mg of caffeine by ${clock(bed)}` : l.factor.name}: nights like that went with <b>{what}</b> · {sure}</p>;
      })}
      <a className="t2-tonight-more" href="#insights/sleep">What goes with your sleep →</a>
    </section>
  );
}
