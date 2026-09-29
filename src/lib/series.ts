/**
 * Thinning a time series for drawing. A year of 5-minute heart rate is ~100k points; the master
 * graph is ~1,200 px wide. Each pixel column gets one bucket with its min, max and mean, so a
 * zoomed-out view still shows the spikes (a workout) instead of averaging them away.
 */

export type Point = [t: number, v: number];
export type Bucket = { t0: number; t1: number; min: number; max: number; mean: number; n: number } | null;

/** Index of the first point with t >= `t`. Points must be sorted by time. */
export function lowerBound(pts: Point[], t: number): number {
  let lo = 0, hi = pts.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (pts[mid][0] < t) lo = mid + 1; else hi = mid; }
  return lo;
}

/** `n` equal buckets from `from` to `to`. A bucket with no points is `null` (a gap, drawn as one). */
export function buckets(pts: Point[], from: number, to: number, n: number): Bucket[] {
  const out: Bucket[] = [];
  const w = (to - from) / n;
  let i = lowerBound(pts, from);
  for (let k = 0; k < n; k++) {
    const t0 = from + k * w, t1 = t0 + w;
    let min = Infinity, max = -Infinity, sum = 0, c = 0;
    while (i < pts.length && pts[i][0] < t1) {
      const v = pts[i][1];
      if (v < min) min = v; if (v > max) max = v; sum += v; c++; i++;
    }
    out.push(c ? { t0, t1, min, max, mean: sum / c, n: c } : null);
  }
  return out;
}

/** The last point at or before `t`, or null. */
export function valueAt(pts: Point[], t: number): Point | null {
  const i = lowerBound(pts, t + 1) - 1;
  return i >= 0 ? pts[i] : null;
}

/** Trailing moving average over the last `k` points. */
export function rolling(pts: Point[], k: number): Point[] {
  const out: Point[] = [];
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    sum += pts[i][1];
    if (i >= k) sum -= pts[i - k][1];
    out.push([pts[i][0], sum / Math.min(k, i + 1)]);
  }
  return out;
}
