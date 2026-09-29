/**
 * The statistics behind every insight. Small on purpose: averages, spread, correlation with its
 * 95% range, and a difference of means with its 95% range. Every insight shows its n and range,
 * and says "not clear yet" when the range crosses zero — never a confident sentence on noise.
 */

export const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

export function sd(a: number[]): number {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
}

export function median(a: number[]): number {
  if (!a.length) return NaN;
  const b = [...a].sort((x, y) => x - y), i = Math.floor(b.length / 2);
  return b.length % 2 ? b[i] : (b[i - 1] + b[i]) / 2;
}

/** Least-squares slope of y on x. */
export function slope(xs: number[], ys: number[]): number {
  const mx = mean(xs), my = mean(ys);
  let a = 0, b = 0;
  for (let i = 0; i < xs.length; i++) { a += (xs[i] - mx) * (ys[i] - my); b += (xs[i] - mx) ** 2; }
  return b === 0 ? NaN : a / b;
}

export function pearson(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 3) return NaN;
  const mx = mean(xs), my = mean(ys);
  let a = 0, b = 0, c = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    a += dx * dy; b += dx * dx; c += dy * dy;
  }
  return b === 0 || c === 0 ? NaN : a / Math.sqrt(b * c);
}

export type Range = { value: number; lo: number; hi: number; n: number; clear: boolean };

/** Correlation with a 95% range (Fisher z). Needs at least 5 pairs. */
export function correlation(xs: number[], ys: number[]): Range | null {
  const n = xs.length, r = pearson(xs, ys);
  if (n < 5 || !Number.isFinite(r)) return null;
  const z = Math.atanh(Math.max(-0.9999, Math.min(0.9999, r))), se = 1 / Math.sqrt(n - 3);
  const lo = Math.tanh(z - 1.96 * se), hi = Math.tanh(z + 1.96 * se);
  return { value: r, lo, hi, n, clear: lo > 0 || hi < 0 };
}

/** Difference of means `a − b` with a 95% range (Welch). Needs 3 in each group. */
export function difference(a: number[], b: number[]): Range | null {
  if (a.length < 3 || b.length < 3) return null;
  const d = mean(a) - mean(b), se = Math.sqrt(sd(a) ** 2 / a.length + sd(b) ** 2 / b.length);
  return { value: d, lo: d - 1.96 * se, hi: d + 1.96 * se, n: a.length + b.length, clear: d - 1.96 * se > 0 || d + 1.96 * se < 0 };
}

/**
 * Nights (or days) per group needed to see a difference of `effect` reliably, given the spread
 * `sd` — 80% power at the 5% level. How the experiment card says "you need ~26 more nights off".
 */
export const perGroupFor = (effect: number, spread: number) => Math.ceil((2 * (1.96 + 0.84) ** 2 * spread ** 2) / effect ** 2);

/** "Not clear", "weak", "moderate", "strong" — the words the insight cards use. */
export function strength(r: Range): "no clear link" | "weak" | "moderate" | "strong" {
  if (!r.clear) return "no clear link";
  const a = Math.abs(r.value);
  return a >= 0.5 ? "strong" : a >= 0.3 ? "moderate" : "weak";
}
