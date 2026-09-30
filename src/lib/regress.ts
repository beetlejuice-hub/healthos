/**
 * Least-squares regression with standard errors and p-values, small and dependency-free: what the
 * effect engine uses to compare days fairly (feeling = thing + weekend + yesterday + drift).
 */

/** Solve A·x = b (Gauss–Jordan with partial pivoting). Null when singular. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = A.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-10) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

function invert(A: number[][]): number[][] | null {
  const n = A.length, cols: number[][] = [];
  for (let j = 0; j < n; j++) { const e = Array.from({ length: n }, (_, i) => (i === j ? 1 : 0)); const x = solve(A, e); if (!x) return null; cols.push(x); }
  return A.map((_, i) => cols.map((c) => c[i]));
}

/* Student t distribution via the regularized incomplete beta function (Numerical Recipes). */
function lgamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const v of c) ser += v / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}
function betacf(a: number, b: number, x: number): number {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  return h;
}
function ibeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}
/** Two-sided p-value for t with `df` degrees of freedom. */
export const pTwoSided = (t: number, df: number) => ibeta(df / 2, 0.5, df / (df + t * t));
/** The t value with two-sided tail `alpha` (bisection; 95% → alpha 0.05). */
export function tCrit(df: number, alpha = 0.05): number {
  let lo = 0, hi = 50;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (pTwoSided(mid, df) > alpha) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

export type Fit = { coef: number[]; se: number[]; df: number; sigma: number; p: number[] };

/** y ~ X (X includes the intercept column if wanted). Null when there's too little data or X is degenerate. */
export function ols(X: number[][], y: number[]): Fit | null {
  const n = y.length, k = X[0]?.length ?? 0;
  if (n <= k + 1) return null;
  const XtX = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0)));
  const Xty = Array.from({ length: k }, (_, i) => X.reduce((s, r, m) => s + r[i] * y[m], 0));
  const inv = invert(XtX);
  if (!inv) return null;
  const coef = inv.map((r) => r.reduce((s, v, j) => s + v * Xty[j], 0));
  const rss = X.reduce((s, r, m) => s + (y[m] - r.reduce((a, v, j) => a + v * coef[j], 0)) ** 2, 0);
  const df = n - k, sigma = Math.sqrt(rss / df);
  const se = inv.map((r, i) => Math.sqrt(Math.max(0, r[i]) * sigma * sigma));
  return { coef, se, df, sigma, p: coef.map((c, i) => (se[i] > 0 ? pTwoSided(c / se[i], df) : 1)) };
}

/** Benjamini–Hochberg: which p-values survive at false-discovery rate `q`. */
export function bh(ps: number[], q = 0.1): boolean[] {
  const idx = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  let cut = -1;
  idx.forEach(([p], r) => { if (p <= ((r + 1) / ps.length) * q) cut = r; });
  const pass = ps.map(() => false);
  for (let r = 0; r <= cut; r++) pass[idx[r][1]] = true;
  return pass;
}
