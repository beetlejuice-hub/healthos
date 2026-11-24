/**
 * A workout's heart rate (PLAN 226; owner, 24 Nov: "a heart rate graph for the workouts especially to cardio so i can
 * see"). The band's minutes over the session, the line coloured by zone over faint zone bands (Z1–Z5 by % of max), the
 * session's average dashed, its peak marked, the end, and the 10 minutes after it with how far it fell in 2. Tap or drag
 * for a minute. On a past session (its sheet), the cardio's "Save?" and the workout going now (`live`: no after). Numbers
 * from lib/workouthr; draws only.
 */

import { useMemo, useState } from "react";
import type { HrMinute } from "../lib/band";
import { ZONES, maxHrOf } from "../lib/cardio";
import type { SessionPart } from "../lib/sessionend";
import { useStore } from "../lib/store";
import { clock } from "../lib/time";
import { hrTrace, type HrPt } from "../lib/workouthr";
import { useWidth } from "./useWidth";

const TONE = ["var(--wt)", "var(--ok)", "var(--gym)", "var(--warn)", "var(--hr)"];
const MIN = 60_000;

export function WorkoutHr({ hr, start, end, parts, line, live }: { hr: HrMinute[]; start: number; end: number; parts?: SessionPart[]; /** the working line (PLAN 217) */ line?: number | null; live?: boolean }) {
  const settings = useStore((s) => s.settings), max = maxHrOf(settings)?.bpm ?? null;
  const last = Math.max(end, ...(parts ?? []).map((p) => p.end));
  const t = useMemo(() => hrTrace(hr, start, last, max), [hr, start, last, max]);
  const [ref, w0] = useWidth<HTMLElement>(), [hit, setHit] = useState<HrPt | null>(null);
  if (!t) return <figure ref={ref} className="ss-hr wh empty"><p className="s">Heart rate comes when the band sends this workout's minutes (it syncs every 15–30 min).</p></figure>;
  const W = Math.max(280, Math.min(w0, 720)), H = 180, L = 30, R = 8, TOP = 8, B = 20;
  const to = live ? Math.max(t.pts[t.pts.length - 1].t, start + 10 * MIN) : t.to;
  const vs = t.pts.map((p) => p.v);
  // at least 40 bpm tall, so a steady 140 ± 3 doesn't look like a saw
  let lo = Math.floor(Math.min(...vs, line ?? Infinity) / 10) * 10 - 5, hi = Math.ceil(Math.max(...vs, line ?? 0) / 10) * 10 + 5;
  if (hi - lo < 40) { const pad = Math.ceil((40 - (hi - lo)) / 20) * 10; lo -= pad; hi += pad; }
  const X = (x: number) => L + ((x - t.from) / (to - t.from)) * (W - L - R), Y = (v: number) => TOP + (1 - (v - lo) / (hi - lo)) * (H - TOP - B);
  const yTicks = [lo + 5, Math.round((lo + hi) / 20) * 10, hi - 5].filter((v, i, a) => a.indexOf(v) === i);
  const step = (to - t.from) / MIN > 90 ? 30 : (to - t.from) / MIN > 40 ? 15 : 10;
  const xTicks: number[] = []; for (let x = Math.ceil(t.from / (step * MIN)) * step * MIN; x <= to; x += step * MIN) xTicks.push(x);
  const bands = max ? ZONES.map((f, i) => ({ z: i + 1, a: f * max, b: (ZONES[i + 1] ?? 1.2) * max })).filter((b) => b.b > lo && b.a < hi) : [];
  const near = (px: number) => t.pts.reduce((a, p) => (Math.abs(X(p.t) - px) < Math.abs(X(a.t) - px) ? p : a));
  const move = (e: React.PointerEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(); setHit(near(((e.clientX - r.left) / r.width) * W)); };
  const rec = !live && t.recovery;
  return (
    <figure ref={ref} className="ss-hr wh" data-avg={t.avg ?? undefined} data-peak={t.peak?.v} data-drop={rec ? rec.drop : undefined}>
      <figcaption className="wh-head"><b>Heart rate</b>
        <span>{t.avg != null && <>avg <b>{t.avg}</b></>}{t.peak && <> · peak <b>{t.peak.v}</b> at {clock(t.peak.t)}</>}{rec ? <> · down <b>{rec.drop}</b> in 2 min after</> : null}</span></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHit(null)}
        aria-label={`Heart rate from ${clock(t.from)} to ${clock(to)}${t.avg != null ? `, average ${t.avg}` : ""}${t.peak ? `, peak ${t.peak.v}` : ""}${line ? `, the working line at ${line}` : ""}, the session ${clock(start)}–${clock(end)}`}>
        {bands.map((b) => <g key={b.z}><rect x={L} width={W - L - R} y={Y(Math.min(hi, b.b))} height={Math.max(0, Y(Math.max(lo, b.a)) - Y(Math.min(hi, b.b)))} fill={TONE[b.z - 1]} opacity={0.08} />
          {Y(Math.max(lo, b.a)) - Y(Math.min(hi, b.b)) > 12 && <text x={W - R - 2} y={Y(Math.max(lo, b.a)) - 3} textAnchor="end" className="wh-z" fill={TONE[b.z - 1]}>Z{b.z}</text>}</g>)}
        {/* each part shaded on its own (PLAN 217): lifting, then the cardio after it */}
        {(parts ?? []).map((p, i) => <g key={i}><rect x={X(p.start)} y={TOP} width={Math.max(1, X(Math.min(p.end, to)) - X(p.start))} height={H - TOP - B} className={`ss-span${p.cardio ? " cardio" : ""}`} />
          {(parts?.length ?? 0) > 1 && X(p.end) - X(p.start) > 30 && <text x={X(p.start) + 3} y={H - B - 4} className="ss-t">{p.name}</text>}</g>)}
        {yTicks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className="wh-grid" /><text x={L - 4} y={Y(v) + 3.5} textAnchor="end" className="ss-t">{v}</text></g>)}
        {xTicks.map((x) => <text key={x} x={X(x)} y={H - 5} textAnchor="middle" className="ss-t">{clock(x)}</text>)}
        {line && <><line x1={L} x2={W - R} y1={Y(line)} y2={Y(line)} className="ss-line" /><text x={L + 4} y={Y(line) - 4} className="ss-t">working {line}</text></>}
        {t.avg != null && <line x1={X(start)} x2={X(Math.min(end, to))} y1={Y(t.avg)} y2={Y(t.avg)} className="wh-avg" />}
        <polyline points={t.pts.map((p) => `${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ")} className="ss-hrl wh-base" />
        {t.runs.map((r, i) => <polyline key={i} points={r.pts.map((p) => `${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ")} className="wh-run" stroke={r.z ? TONE[r.z - 1] : "var(--c-dim)"} data-z={r.z} />)}
        {t.peak && <><circle cx={X(t.peak.t)} cy={Y(t.peak.v)} r={3.5} className="wh-peak" /><text x={Math.min(W - R - 30, X(t.peak.t) + 5)} y={Math.max(TOP + 9, Y(t.peak.v) - 5)} className="ss-t on">{t.peak.v}</text></>}
        {!live && <><line x1={X(end)} x2={X(end)} y1={TOP} y2={H - B} className="ss-end" />
          <text x={Math.min(W - R - 60, X(end) + 4)} y={TOP + 10} className="ss-t on">ended {clock(end)}</text></>}
        {hit && <><line x1={X(hit.t)} x2={X(hit.t)} y1={TOP} y2={H - B} className="wh-hit" /><circle cx={X(hit.t)} cy={Y(hit.v)} r={4} className="wh-peak" /></>}
      </svg>
      <p className="wh-read" aria-live="polite">{hit ? `${clock(hit.t)} · ${hit.v} bpm${hit.z ? ` · Z${hit.z}` : ""}` : live ? "So far — the band sends its minutes every 15–30 min." : "Tap the line for a minute."}</p>
    </figure>
  );
}
