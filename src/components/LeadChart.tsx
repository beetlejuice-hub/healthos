/**
 * Today's lead, drawn (PLAN 176; owner, 27 Oct: "more likely for graphs and connections between things"): the two things
 * the app found go together, over the last 14 days — the first on top, the second under it (the next day's, when the link
 * is a day later). The days the first was "on" (a yes, or above its middle) are lit in both rows, so the eye can check
 * the link. Tap a day for both values.
 */

import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { dailyFacts } from "../lib/insights";
import { signals } from "../lib/scout";
import { withBand } from "../lib/daysband";
import { useBand } from "../lib/band-client";
import { leadSeries, type LeadRef } from "../lib/ai/lead";
import { median } from "../lib/stats";
import { addDays, atMinute, dayLabel, localDay } from "../lib/time";

const show = (v: number | null, unit?: string, yes?: boolean, body?: boolean) => (v == null ? "—" : body ? ["no", "a bit", "a lot"][v] ?? String(v) : yes ? (v ? "yes" : "no") : `${Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-GB") : Math.round(v * 10) / 10}${unit ? ` ${unit}` : ""}`);

export function LeadChart({ lead, days = 14 }: { lead: LeadRef; days?: number }) {
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), settings = useStore((s) => s.settings), supps = useStore((s) => s.supplements);
  const yesterday = addDays(localDay(Date.now()), -1);
  // the band's sleep and steps too (lib/daysband): a lead on sleep or steps draws them
  const band = useBand().data;
  const s = useMemo(() => leadSeries(lead, withBand(dailyFacts(entries, workouts, settings, addDays(yesterday, -days - 1), yesterday), band, localDay(Date.now())), signals(supps, [], true), yesterday, days), [lead, entries, workouts, settings, supps, yesterday, days, band]);
  const [pick, setPick] = useState<number | null>(null);
  if (!s) return null;
  const n = s.days.length, as = s.a.vals.filter((v): v is number => v != null), bs = s.b.vals.filter((v): v is number => v != null);
  if (as.length < 3 || bs.length < 3) return <div className="dc lc"><p className="dc-words">Not enough of both logged in the last {n} days to draw it.</p></div>;
  const mid = s.a.yes ? 0.5 : median(as), lit = s.a.vals.map((v) => v != null && (s.a.yes ? v === 1 : v > mid));
  const aHi = Math.max(1, ...as), bLo = Math.min(...bs), bHi = Math.max(...bs), pad = Math.max((bHi - bLo) * 0.15, 0.3);
  const yb = (v: number) => ((v - (bLo - pad)) / (bHi + pad - (bLo - pad))) * 100;
  const line = s.b.vals.map((v, i) => (v == null ? null : `${(((i + 0.5) / n) * 100).toFixed(2)},${(100 - yb(v)).toFixed(2)}`)).filter(Boolean).join(" ");
  const label = (i: number) => dayLabel(atMinute(s.days[i], 12 * 60));
  const next = lead.lag ? ", the next day" : "";
  return (
    <div className="dc lc" aria-label={`${s.a.name} and ${s.b.name}${next}, last ${n} days`}>
      <p className="dc-head"><b>{s.a.name}</b> on top · <b>{s.b.name}</b>{next} under it · last {n} days</p>
      <div className="dc-plot bars lc-a" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }} role="img" aria-label={`${s.a.name}: ${s.a.vals.map((v) => show(v, s.a.unit, s.a.yes)).join(", ")}`}>
        {s.a.vals.map((v, i) => (
          <button type="button" key={i} className="dc-day" data-lit={lit[i] || undefined} data-pick={pick === i || undefined} aria-label={`${label(i)}: ${s.a.name} ${show(v, s.a.unit, s.a.yes)}`} onClick={() => setPick(pick === i ? null : i)}>
            {v != null && (s.a.yes ? <i className={`lc-yes${v ? " on" : ""}`} /> : <i className="dc-bar" style={{ height: `max(2px, ${(v / aHi) * 100}%)` }} />)}
          </button>
        ))}
      </div>
      <div className="dc-plot level lc-b" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }} role="img" aria-label={`${s.b.name}${next}: ${s.b.vals.map((v) => show(v, s.b.unit, false, s.b.body)).join(", ")}`}>
        {line && <svg className="dc-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={line} /></svg>}
        {s.b.vals.map((v, i) => (
          <button type="button" key={i} className="dc-day" data-lit={lit[i] || undefined} data-pick={pick === i || undefined} aria-label={`${label(i)}: ${s.b.name}${next} ${show(v, s.b.unit, false, s.b.body)}`} onClick={() => setPick(pick === i ? null : i)}>
            {v != null && <i className="dc-dot" style={{ bottom: `${yb(v)}%` }} />}
          </button>
        ))}
      </div>
      <p className="dc-ends" aria-hidden="true"><span>{label(0)}</span><span>{label(n - 1)}</span></p>
      <p className="dc-words">{pick != null
        ? <><b>{label(pick)}</b> · {s.a.name} {show(s.a.vals[pick], s.a.unit, s.a.yes)} · {s.b.name}{next} {show(s.b.vals[pick], s.b.unit, false, s.b.body)}</>
        : <>Lit: the days with {s.a.yes ? s.a.name : `more ${s.a.name}`} — see where {s.b.name} sits on them.</>}</p>
    </div>
  );
}
