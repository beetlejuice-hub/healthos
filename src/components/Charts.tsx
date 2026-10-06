/**
 * Small SVG charts for the Insights panels. Drawn to scale; colours come in as CSS variables. They draw
 * at the width they're shown at, so labels stay their real size on a phone (a fixed 560-wide canvas
 * shrunk to 350 px made 9.5 px labels about 6 px).
 */

import { useWidth } from "./useWidth";

/** An x label's anchor: the first and last sit inside the plot instead of being cut at the edge. */
/** Height for a width: `h` up to 560 px wide, then growing with it (to 1.8×) so a full-width chart isn't a flat strip. */
const tall = (h: number, w: number) => Math.round(Math.max(h, Math.min(h * 1.8, (w * h) / 560)));

const anchor = (x: number, xs: [number, number]) => (x <= xs[0] ? "start" : x >= xs[1] ? "end" : "middle");

type Series = { pts: [number, number][]; color: string; width?: number; dots?: boolean; line?: boolean; end?: boolean; dotOpacity?: number };

export function LineChart({
  series, lo, hi, xs, w: fixedW, h: baseH = 150, yfmt = (v) => String(v), xlabels = [], band, targets = [], label,
}: {
  series: Series[]; lo: number; hi: number; xs: [number, number]; w?: number; h?: number; yfmt?: (v: number) => string;
  xlabels?: [number, string][]; band?: [number, number]; targets?: [number, string][]; label: string;
}) {
  const [ref, measured] = useWidth<HTMLDivElement>(), w = fixedW ?? measured, h = tall(baseH, w);
  const pl = 36, pr = 10, pt = 8, pb = 18;
  const X = (x: number) => pl + ((x - xs[0]) / (xs[1] - xs[0] || 1)) * (w - pl - pr);
  const Y = (v: number) => pt + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1)) * (h - pt - pb);
  return (
    <div ref={ref} className="mini-chart"><svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={label}>
      {[lo, (lo + hi) / 2, hi].map((v) => (
        <g key={v}>
          <line x1={pl} x2={w - pr} y1={Y(v)} y2={Y(v)} stroke="var(--i-line)" />
          <text x={pl - 5} y={Y(v) + 3} textAnchor="end" fontSize="10.5" fill="var(--i-dim)" fontFamily="IBM Plex Mono, monospace">{yfmt(v)}</text>
        </g>
      ))}
      {xlabels.map(([x, t]) => <text key={t + x} x={X(x)} y={h - 4} textAnchor={anchor(x, xs)} fontSize="10.5" fill="var(--i-dim)" fontFamily="IBM Plex Mono, monospace">{t}</text>)}
      {band && <rect x={pl} y={Y(band[1])} width={w - pl - pr} height={Math.max(0, Y(band[0]) - Y(band[1]))} fill="var(--i-ink)" fillOpacity=".05" />}
      {targets.map(([v, t]) => (
        <g key={t}>
          <line x1={pl} x2={w - pr} y1={Y(v)} y2={Y(v)} stroke="var(--i-ink-2)" strokeDasharray="4 3" />
          <text x={w - pr} y={Y(v) - 4} textAnchor="end" fontSize="10.5" fill="var(--i-ink-2)" fontFamily="IBM Plex Mono, monospace">{t}</text>
        </g>
      ))}
      {series.map((s, i) => (
        <g key={i}>
          {s.line !== false && s.pts.length > 1 && (
            <path d={s.pts.map((p, k) => `${k ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("")} fill="none" stroke={s.color} strokeWidth={s.width ?? 1.5} strokeLinejoin="round" />
          )}
          {s.dots && s.pts.map((p, k) => <circle key={k} cx={X(p[0])} cy={Y(p[1])} r="1.8" fill={s.color} fillOpacity={s.dotOpacity ?? 0.55} />)}
          {s.end && s.pts.length > 0 && <circle cx={X(s.pts[s.pts.length - 1][0])} cy={Y(s.pts[s.pts.length - 1][1])} r="3" fill={s.color} />}
        </g>
      ))}
    </svg></div>
  );
}

/** Vertical bars on a shared x; a hollow stub marks a day with no data (not a zero). */
export function Bars({ pts, lo, hi, xs, color, w: fixedW, h: baseH = 140, targets = [], xlabels = [], yfmt = (v) => String(v), label }: {
  pts: [number, number | null][]; lo: number; hi: number; xs: [number, number]; color: string; w?: number; h?: number;
  targets?: [number, string][]; xlabels?: [number, string][]; yfmt?: (v: number) => string; label: string;
}) {
  const [ref, measured] = useWidth<HTMLDivElement>(), w = fixedW ?? measured, h = tall(baseH, w);
  const pl = 36, pr = 10, pt = 8, pb = 18;
  const n = xs[1] - xs[0] + 1, bw = Math.max(1, (w - pl - pr) / n - 2);
  const X = (x: number) => pl + ((x - xs[0]) / n) * (w - pl - pr) + 1;
  const Y = (v: number) => pt + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1)) * (h - pt - pb);
  return (
    <div ref={ref} className="mini-chart"><svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={label}>
      {[lo, (lo + hi) / 2, hi].map((v) => (
        <g key={v}>
          <line x1={pl} x2={w - pr} y1={Y(v)} y2={Y(v)} stroke="var(--i-line)" />
          <text x={pl - 5} y={Y(v) + 3} textAnchor="end" fontSize="10.5" fill="var(--i-dim)" fontFamily="IBM Plex Mono, monospace">{yfmt(v)}</text>
        </g>
      ))}
      {pts.map(([x, v]) => v == null
        ? <rect key={x} x={X(x)} y={Y(lo) - 3} width={bw} height="3" fill="none" stroke="var(--i-dim)" />
        : <rect key={x} x={X(x)} y={Y(v)} width={bw} height={Math.max(0, Y(lo) - Y(v))} fill={color} fillOpacity=".75" />)}
      {targets.map(([v, t]) => (
        <g key={t}>
          <line x1={pl} x2={w - pr} y1={Y(v)} y2={Y(v)} stroke="var(--i-ink-2)" strokeDasharray="4 3" />
          <text x={w - pr} y={Y(v) - 4} textAnchor="end" fontSize="10.5" fill="var(--i-ink-2)" fontFamily="IBM Plex Mono, monospace">{t}</text>
        </g>
      ))}
      {xlabels.map(([x, t]) => <text key={t + x} x={anchor(x, xs) === "start" ? X(x) : anchor(x, xs) === "end" ? X(x) + bw : X(x) + bw / 2} y={h - 4} textAnchor={anchor(x, xs)} fontSize="10.5" fill="var(--i-dim)" fontFamily="IBM Plex Mono, monospace">{t}</text>)}
    </svg></div>
  );
}
