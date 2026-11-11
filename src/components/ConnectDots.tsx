/**
 * Connecting the dots (PLAN 206; owner, 10–11 Nov: "look at everything thats possible and worth looking into, connecting
 * the dots" · "i would rather focus on making the app interesting - interesting connections" · "i like charts that show a
 * trend … lots of data and the average"). Insights → Findings: every input of yours (drinks, late caffeine, protein,
 * calories, training, late eating, steps, bedtime, sleep, rain, daylight) against every outcome (mood, energy, focus,
 * stress, your sleep rating, HRV, resting heart rate), the same day and one and two days on, SYNAPS's way (lib/connect).
 * Each link that holds: a sentence, and its days as dots with the line through them. Only reads.
 */

import { useMemo, useState } from "react";
import { useBand } from "../lib/band-client";
import { connect, linkWords, thingsFrom, type Link, type Thing } from "../lib/connect";
import { withBand } from "../lib/daysband";
import { dailyFacts } from "../lib/insights";
import { useStore } from "../lib/store";
import { addDays, localDay } from "../lib/time";

const SHOW = 6;
const sure = (q: number) => (q < 0.01 ? "very sure" : q < 0.05 ? "fairly sure" : "worth watching");

function Dots({ l, by }: { l: Link; by: Map<string, Thing> }) {
  const a = by.get(l.from)!.series, b = by.get(l.to)!.series;
  const pts: [number, number][] = [];
  for (const d of Object.keys(a)) { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + l.lag); const v = b[t.toISOString().slice(0, 10)]; if (v != null) pts.push([a[d], v]); }
  if (pts.length < 3) return null;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const W = 300, H = 120, X = (v: number) => 12 + ((v - x0) / (x1 - x0 || 1)) * (W - 24), Y = (v: number) => H - 14 - ((v - y0) / (y1 - y0 || 1)) * (H - 26);
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length;
  const binary = new Set(xs).size <= 2;
  // a little sideways spread for an input that's only 0 or 1, so the days don't sit on each other
  const jit = (i: number) => (binary ? ((i * 37) % 13) - 6 : 0);
  const good = (by.get(l.to)!.better ?? 1) * Math.sign(l.slope) >= 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cd-dots" role="img" aria-label={`${pts.length} days, ${by.get(l.from)!.name.toLowerCase()} across, ${by.get(l.to)!.name.toLowerCase()} up`}>
      <line x1="12" x2={W - 12} y1={H - 14} y2={H - 14} className="cd-axis" />
      {pts.map((p, i) => <circle key={i} cx={X(p[0]) + jit(i)} cy={Y(p[1])} r="3.2" className="cd-dot" />)}
      <line x1={X(x0)} y1={Y(my + l.slope * (x0 - mx))} x2={X(x1)} y2={Y(my + l.slope * (x1 - mx))} className={`cd-fit ${good ? "good" : "bad"}`} />
      <text x="12" y={H - 2} className="cd-t">{by.get(l.from)!.name.toLowerCase()} →</text>
      <text x={W - 12} y="10" className="cd-t" textAnchor="end">{by.get(l.to)!.name.toLowerCase()} ↑</text>
    </svg>
  );
}

export function ConnectDots({ now }: { now: number }) {
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), settings = useStore((s) => s.settings);
  const band = useBand().data, today = localDay(now);
  const [all, setAll] = useState(false);
  const { things, links } = useMemo(() => {
    const days = withBand(dailyFacts(entries, workouts, settings, addDays(today, -120), addDays(today, -1)), band, today);
    const things = thingsFrom(days, band);
    return { things, links: connect(things) };
  }, [entries, workouts, settings, band, today]);
  const by = useMemo(() => new Map(things.map((t) => [t.key, t])), [things]);
  return (
    <section className="p w12 cd" id="connect-dots" aria-label="Connecting the dots">
      <h2>Connecting the dots <span>every pair of your things, the same day and up to two days on · only what holds after checking many at once</span></h2>
      {!links.length
        ? <p className="note-i">Nothing holds yet across your last 120 days once it's checked against chance — it fills in as days come.</p>
        : <ul className="cd-list">{(all ? links : links.slice(0, SHOW)).map((l) => (
          <li key={`${l.from}>${l.to}`} data-link={`${l.from}>${l.to}`}>
            <p>{linkWords(l, by).split(" (90 %")[0]}.</p>
            <Dots l={l} by={by} />
            <small>{sure(l.q)} · {l.n} days, about {Math.round(l.nEff)} independent · range {Math.abs(l.lo) < Math.abs(l.hi) ? l.lo.toFixed(1) : l.hi.toFixed(1)} to {Math.abs(l.lo) < Math.abs(l.hi) ? l.hi.toFixed(1) : l.lo.toFixed(1)}</small>
          </li>))}</ul>}
      {links.length > SHOW && <button type="button" className="ibtn" onClick={() => setAll(!all)}>{all ? "Fewer" : `All ${links.length}`}</button>}
      <p className="note-i">Each against your own recent level, so slow drifts don't count; days that are alike count as fewer; checked many at once and corrected for it (as the SYNAPS project does). Goes with, not causes.</p>
    </section>
  );
}
