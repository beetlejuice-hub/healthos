/**
 * A workout's heart rate, to draw (PLAN 226; owner, 24 Nov: "We should add a heart rate graph for the workouts especially
 * to cardio so i can see"). The band's minutes from 5 before the start to 10 after the end; each minute's zone (Z1–Z5 by %
 * of max, lib/cardio ZONES; 0 under Z1), the runs of one zone (so the line can be coloured by zone), the average and the
 * peak inside the session, and the recovery after it (lib/cadence recoveryOf: the drop in the 2 minutes after the effort).
 * Pure.
 */

import type { HrMinute } from "./band";
import { recoveryOf } from "./cadence";
import { ZONES } from "./cardio";

export const WHR = { before: 5, after: 10 } as const;
const MIN = 60_000;

export type HrPt = { t: number; v: number; z: number };
export type HrTrace = {
  from: number; to: number; pts: HrPt[];
  /** consecutive minutes of one zone, each run sharing its first point with the run before so the line has no gaps */
  runs: { z: number; pts: HrPt[] }[];
  avg: number | null; peak: HrPt | null; n: number;
  recovery: { at: number; peak: number; then: number; drop: number } | null;
};

/** The zone of a heart rate: 1–5, or 0 under Z1 (no max: 0). */
export const zoneOfHr = (v: number, max: number | null | undefined) => {
  if (!max) return 0;
  const f = v / max;
  for (let z = ZONES.length - 1; z >= 0; z--) if (f >= ZONES[z]) return z + 1;
  return 0;
};

export function hrTrace(hr: HrMinute[], start: number, end: number, max: number | null | undefined): HrTrace | null {
  const from = start - WHR.before * MIN, to = end + WHR.after * MIN;
  const pts = hr.filter((m) => m[0] >= from && m[0] <= to).sort((a, b) => a[0] - b[0]).map((m) => ({ t: m[0], v: m[1], z: zoneOfHr(m[1], max) }));
  if (pts.length < 3) return null;
  const runs: HrTrace["runs"] = [];
  for (const p of pts) {
    const last = runs[runs.length - 1], gap = last && p.t - last.pts[last.pts.length - 1].t > 3 * MIN;
    if (last && last.z === p.z && !gap) last.pts.push(p);
    else runs.push({ z: p.z, pts: last && !gap ? [last.pts[last.pts.length - 1], p] : [p] });
  }
  const inside = pts.filter((p) => p.t >= start && p.t < end);
  const avg = inside.length ? Math.round(inside.reduce((a, p) => a + p.v, 0) / inside.length) : null;
  const peak = inside.reduce<HrPt | null>((a, p) => (!a || p.v > a.v ? p : a), null);
  return { from, to, pts, runs, avg, peak, n: inside.length, recovery: recoveryOf(hr, start, end) };
}
