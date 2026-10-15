/**
 * A chart the AI asked to show under its reply (PLAN 67) — drawn here from the app's own data, never from numbers the AI
 * wrote: the measure day by day over its span, with the span's average. This file only draws.
 */

import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { useBand } from "../lib/band-client";
import { MEASURE, fmtMeasure, seriesOf, type ChartSpec } from "../lib/ai/chattools";
import { atMinute, dayLabel, localDay } from "../lib/time";

const short = (d: string) => dayLabel(atMinute(d, 720)).slice(4);

export function ChatChart({ c }: { c: ChartSpec }) {
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), settings = useStore((s) => s.settings);
  const band = useBand().data;
  const [now] = useState(() => Date.now());
  const today = localDay(now), m = MEASURE[c.measure];
  const vals = useMemo(() => seriesOf(c.measure, c.from, c.to, { state: { entries, workouts, settings, supplements: [], ai: undefined as never }, band, now }), [c, entries, workouts, settings, band, now]);
  // today's calories, steps… are only partway: drawn hollow, left out of the average
  const full = vals.filter((x) => x.v != null && !(m.partial && x.day === today));
  if (!vals.some((x) => x.v != null)) return <p className="note chat-chart-none">{c.title}: nothing logged {short(c.from)}–{short(c.to)}.</p>;
  const have = vals.filter((x) => x.v != null).map((x) => x.v!);
  const lo = Math.min(...have), hi = Math.max(...have), pad = Math.max((hi - lo) * 0.12, m.unit === "/10" ? 0.5 : 1);
  const W = 300, H = 120, top = 16, base = 92, a = lo - pad, b = hi + pad;
  const X = (i: number) => (vals.length === 1 ? W / 2 : 8 + (i / (vals.length - 1)) * (W - 16)), Y = (v: number) => base - ((v - a) / (b - a)) * (base - top);
  const mean = full.length ? full.reduce((s, x) => s + x.v!, 0) / full.length : null;
  let line = "", pen = false;
  vals.forEach((x, i) => { if (x.v == null) { pen = false; return; } line += `${pen ? "L" : "M"}${X(i).toFixed(1)} ${Y(x.v).toFixed(1)}`; pen = true; });
  const r = vals.length > 45 ? 2 : 3.2;
  return (
    <figure className="chat-chart" data-measure={c.measure}>
      <figcaption><b>{c.title}</b><span>{short(c.from)}–{short(c.to)}{mean != null ? ` · average ${fmtMeasure(c.measure, mean)}` : ""}</span></figcaption>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${m.name} from ${c.from} to ${c.to}${mean != null ? `, average ${fmtMeasure(c.measure, mean)}` : ""}`}>
        {mean != null && <><line x1={0} x2={W} y1={Y(mean)} y2={Y(mean)} className="cc-avg" /><text x={W - 2} y={Y(mean) - 4} textAnchor="end">avg</text></>}
        <path d={line} className="cc-line" />
        {vals.map((x, i) => (x.v == null ? null : (
          <circle key={x.day} cx={X(i)} cy={Y(x.v)} r={r} className="cc-dot" data-partial={(m.partial && x.day === today) || undefined}>
            <title>{`${short(x.day)}: ${fmtMeasure(c.measure, x.v)}${m.partial && x.day === today ? " (today, so far)" : ""}`}</title>
          </circle>
        )))}
        <text x={2} y={11}>{fmtMeasure(c.measure, hi)}</text>
        {hi !== lo && <text x={2} y={base + 12}>{fmtMeasure(c.measure, lo)}</text>}
        <text x={8} y={H - 3}>{short(c.from)}</text>
        <text x={W - 8} y={H - 3} textAnchor="end">{short(c.to)}</text>
      </svg>
    </figure>
  );
}
