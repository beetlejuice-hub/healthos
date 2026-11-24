/**
 * Change points (PLAN 228; owner, 24 Nov: "Lets do 3" — item 6 of the research: mark the day resting heart rate, HRV,
 * weight or sleep stepped to a new level). Optimal partitioning (the exact search PELT speeds up; a year of days is
 * small enough to do it whole) for shifts in the mean: split the days where the sum of squares inside the pieces plus a
 * penalty for each split is least. The penalty is what keeps noise from being called a step:
 *
 *   β = 2.5 · σ² · (1 + r)/(1 − r) · ln n
 *
 * σ² and r from the day-to-day differences (robust: a step is one of them; see noiseOf), and (1 + r)/(1 − r) because days
 * carry over — the lesson of the audit (PLAN 223): without it, wandering
 * days pass for steps. A steady slope is taken out first (a smooth decline isn't a step). A piece needs 7+ days, and a step is said only when it's at least ¾ of the day-to-day spread.
 * Measured on fake people (changepoint.test, 120 days, carry-over 0 / 0.5 / 0.8): a step called in noise 0 / 3.5 / 6.5 %,
 * in a steady slope 0.5 / 3.5 / 7.5 %, in a smooth weight decline 0 %; a step of 2 spreads found within a week of its day in
 * 91 / 36 / 16 %. (3σ: fewer false, 87 / 26 / 13 % found; 2σ: 43 % found at 0.5 but 9 % false.) Pure.
 */

export const CHANGE = { minSeg: 7, k: 2.5, minStep: 0.75 } as const;
export type Change = { day: string; before: number; after: number; step: number };

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

/**
 * The spread (σ) and the carry-over (r) of the days, from the day-to-day differences: a step is one big difference among
 * many, so their middle (MAD) barely moves, and for days that carry over (lag-1 r) the differences' own lag-1 correlation
 * is −(1 − r)/2 and their variance 2σ²(1 − r) — so both come out without the step in them. (Around a rolling median, the
 * first try, the median soaked up the slow wander: σ and r too small, steps called in 40 % of noise at r = 0.5.)
 */
export function noiseOf(v: number[]): { sigma: number; r: number } {
  const d = v.slice(1).map((x, i) => x - v[i]);
  const md = median(d), sd = 1.4826 * median(d.map((x) => Math.abs(x - md)));
  const m = d.reduce((a, b) => a + b, 0) / d.length;
  let c0 = 0, c1 = 0; for (let i = 0; i < d.length; i++) { c0 += (d[i] - m) ** 2; if (i) c1 += (d[i] - m) * (d[i - 1] - m); }
  const rd = c0 ? Math.min(0, Math.max(-0.5, c1 / c0)) : -0.5, r = Math.min(0.9, 1 + 2 * rd);
  return { sigma: Math.max(sd / Math.sqrt(2 * (1 - r)), 1e-9), r };
}

/** The days a series stepped to a new level (oldest first); `series` by day, gaps allowed. */
export function changePoints(series: Record<string, number>, opts: { from?: string; to?: string } = {}): Change[] {
  const pts = Object.entries(series).filter(([d, x]) => Number.isFinite(x) && (!opts.from || d >= opts.from) && (!opts.to || d <= opts.to)).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const n = pts.length, raw = pts.map((p) => p[1]);
  if (n < 2 * CHANGE.minSeg) return [];
  // a steady slope isn't a step. One slope shared by every piece, and the steps between: found by turns — the steps on
  // the days as they are; the slope inside those pieces; the steps again on the days with that slope out; three rounds.
  // A smooth decline's staircase goes once its slope is out; a real step stays (inside its pieces there's no slope).
  // (Tried first, 24 Nov: one straight line out of everything took most of a real step with it; a line per piece mimicked
  // wander; the middle of the daily changes as the slope was far too noisy over months.)
  const t = pts.map((p) => (Date.parse(`${p[0]}T12:00:00Z`) - Date.parse(`${pts[0][0]}T12:00:00Z`)) / 86_400_000);
  const search = (v: number[]) => {
    const { sigma, r } = noiseOf(v);
    const beta = CHANGE.k * sigma ** 2 * ((1 + r) / (1 - r)) * Math.log(n);
    const S = new Float64Array(n + 1), Q = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) { S[i + 1] = S[i] + v[i]; Q[i + 1] = Q[i] + v[i] * v[i]; }
    const cost = (a: number, b: number) => Q[b] - Q[a] - (S[b] - S[a]) ** 2 / (b - a);
    // PELT (Killick 2012): a start that can't beat the best even now never will (the cost only grows), so it's dropped —
    // the same answer as trying every start, in a fraction of the time (a year × 15 measures: 1.6 s → well under that)
    const F = new Array<number>(n + 1).fill(Infinity), last = new Array<number>(n + 1).fill(0);
    F[0] = -beta;
    // over a long range the cuts are looked for every g days (g = n / 120 rounded up: a year, every 3rd), then each is put
    // on its best day within g of it — a year of 15 measures in well under a second instead of seconds
    const g = Math.max(1, Math.ceil(n / 120)), ok = (e: number) => e === n || e % g === 0;
    let R = [0];
    for (let e = CHANGE.minSeg; e <= n; e++) {
      if (!ok(e)) continue;
      for (const b of R) {
        if (e - b < CHANGE.minSeg) continue;
        const f = F[b] + cost(b, e) + beta;
        if (f < F[e]) { F[e] = f; last[e] = b; }
      }
      R = R.filter((b) => e - b < CHANGE.minSeg || F[b] + cost(b, e) <= F[e]);
      if (Number.isFinite(F[e])) R.push(e);
    }
    const cuts: number[] = [];
    for (let e = n; e > 0; e = last[e]) cuts.unshift(e);
    if (g > 1) for (let i = 0; i < cuts.length - 1; i++) {
      const a = i ? cuts[i - 1] : 0, b = cuts[i + 1];
      let best = cuts[i], bc = Infinity;
      for (let m = Math.max(a + CHANGE.minSeg, cuts[i] - g); m <= Math.min(b - CHANGE.minSeg, cuts[i] + g); m++) { const c = cost(a, m) + cost(m, b); if (c < bc) { bc = c; best = m; } }
      cuts[i] = best;
    }
    return { bounds: [0, ...cuts], S, sigma, score: F[n] };
  };
  // from two starts — no slope, and the straight line through everything — each by turns, and the one that explains the
  // days better for its cuts kept (the same penalty on both, so their scores compare)
  const refine = (slope0: number) => {
    let slope = slope0, found = search(raw.map((y, i) => y - slope * t[i]));
    for (let round = 0; round < 3; round++) {
      let sxy = 0, sxx = 0;
      for (let i = 1; i < found.bounds.length; i++) {
        const a = found.bounds[i - 1], b = found.bounds[i], mt = t.slice(a, b).reduce((x, y) => x + y, 0) / (b - a), my = raw.slice(a, b).reduce((x, y) => x + y, 0) / (b - a);
        for (let k = a; k < b; k++) { sxy += (t[k] - mt) * (raw[k] - my); sxx += (t[k] - mt) ** 2; }
      }
      const next = sxx ? sxy / sxx : 0;
      if (Math.abs(next - slope) < 1e-9) break;
      slope = next;
      const again = search(raw.map((y, i) => y - slope * t[i]));
      const same = again.bounds.join() === found.bounds.join();
      found = again;
      if (same) break;
    }
    return found;
  };
  const mt0 = t.reduce((a, b) => a + b, 0) / n, my0 = raw.reduce((a, b) => a + b, 0) / n;
  let sxy0 = 0, sxx0 = 0; for (let i = 0; i < n; i++) { sxy0 += (t[i] - mt0) * (raw[i] - my0); sxx0 += (t[i] - mt0) ** 2; }
  const fromFlat = refine(0), fromLine = refine(sxx0 ? sxy0 / sxx0 : 0), found = fromLine.score <= fromFlat.score ? fromLine : fromFlat;
  const { bounds, S, sigma } = found;
  const out: Change[] = [];
  for (let i = 1; i < bounds.length - 1; i++) {
    const a = bounds[i - 1], m = bounds[i], b = bounds[i + 1];
    const step = (S[b] - S[m]) / (b - m) - (S[m] - S[a]) / (m - a);
    if (Math.abs(step) < CHANGE.minStep * sigma) continue;
    // its levels as the days were, the week before and the week after
    const avg = (i0: number, i1: number) => raw.slice(i0, i1).reduce((x, y) => x + y, 0) / (i1 - i0);
    out.push({ day: pts[m][0], before: avg(Math.max(a, m - CHANGE.minSeg), m), after: avg(m, Math.min(b, m + CHANGE.minSeg)), step });
  }
  return out;
}
