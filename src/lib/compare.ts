/**
 * Compare (owner's pick on the canvas, 8 Oct): does more of one thing go with more or less of another, and how
 * much later? Pure: a driver in 10-minute slots by local clock (caffeine or alcohol in the body), outcome samples
 * in the same slots (heart rate, a feeling at each check-in), numbers out.
 *
 * Two traps it is built against, each with a planted test (compare.test.ts):
 *  - Time of day. Coffee comes in the morning, exactly when heart rate climbs after waking. Both sides are taken
 *    against their own usual at that time of day (per half hour for heart rate, per 3 hours for check-ins), so
 *    only "more than usual at this hour" counts.
 *  - The day you're having. A busy day can bring more coffee and a higher heart rate all day, with no link
 *    between them. So it looks within each day — hours with more of the driver against hours with less, the same
 *    day — and a day's own level never counts as an effect (the busy-day test is fooled without this).
 *  - Shopping for a delay. Trying 19 delays and keeping the best one finds something by chance. How sure it is
 *    comes from shuffling whole days — each day's outcome against another day's driver at the same clock times —
 *    and running the same search on every shuffle.
 * "Goes with", never "causes".
 */

/** Ten-minute slots counted by local clock: slot = day × PER_DAY + (minute of the day) / 10, from a local midnight. */
export const PER_DAY = 144;
/** An outcome measured in slot i. */
export type Sample = { i: number; y: number };
export type Sure = "clear" | "likely" | "not clear" | "too few";
export type LagPoint = { lag: number; r: number; band: number };
export type Compared = {
  n: number; days: number;
  lags: LagPoint[];
  best: { lag: number; r: number } | null;
  /** Where the best delay falls when whole days are resampled (middle 80 %): one exact delay would claim too much. */
  span: [number, number] | null;
  /** Outcome per unit of driver (both against their usual at that time), ± (sd of the same on shuffled days). */
  slope: number | null; slopeSe: number | null;
  /** Driver thirds (raw values) and the outcome's mean against its usual — and the rest of that day — in the bottom and top third. */
  thirds: { lo: number; hi: number; low: number; high: number } | null;
  p: number | null; sure: Sure;
  /** For the scatter: raw driver at the best delay, outcome against its usual and the rest of that day, the day it's from. */
  points: { x: number; y: number; d: number }[];
  /** The driver split into up to 5 equal-width bands: the outcome's mean in each, ± its se across days. */
  bins: { x0: number; x1: number; mean: number; se: number; n: number }[];
  /** Every sample taken against its usual for that time of day (the aligned chart draws these). */
  dev: Sample[];
};

export const MIN_DAYS = 7;

/** The slot t falls in, counting local days from `day0` (a local midnight): on the day the clocks change, 09:00 is still 09:00. */
export function slotOf(t: number, day0: number): number {
  const d = new Date(t), mid = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((mid - day0) / 86_400_000) * PER_DAY + Math.floor((d.getHours() * 60 + d.getMinutes()) / 10);
}

/** The middle of slot i (the inverse of slotOf, by local clock). */
export function slotTime(i: number, day0: number): number {
  const d = new Date(day0), day = Math.floor(i / PER_DAY);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + day, 0, (i - day * PER_DAY) * 10 + 5).getTime();
}

/** A curve (time, value) laid on slots from `day0` for `days` days; a slot with no point stays null. */
export function slots(points: [number, number][], day0: number, days: number): (number | null)[] {
  const v: (number | null)[] = new Array(days * PER_DAY).fill(null);
  for (const [t, y] of points) { const i = slotOf(t, day0); if (i >= 0 && i < v.length) v[i] = y; }
  return v;
}

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const quant = (sorted: number[], q: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)))] : NaN;

/** Each value minus the mean of its time-of-day bucket (bucket = `per` slots), over all days. */
function againstUsual(idx: number[], val: number[], perDay: number, per: number): number[] {
  const sum = new Map<number, [number, number]>();
  idx.forEach((i, k) => { const b = Math.floor((((i % perDay) + perDay) % perDay) / per); const s = sum.get(b) ?? [0, 0]; s[0] += val[k]; s[1]++; sum.set(b, s); });
  return idx.map((i, k) => { const s = sum.get(Math.floor((((i % perDay) + perDay) % perDay) / per))!; return val[k] - s[0] / s[1]; });
}

/**
 * `lags` in slots (driver earlier than outcome by that much); `per` slots per
 * time-of-day bucket for the outcome's usual (the driver's usual uses half-hour buckets).
 */
export function compare(driver: (number | null)[], unsorted: Sample[], opts: { perDay?: number; per: number; lags: number[]; perms?: number; seed?: number; /** Off only to show what goes wrong without it. */ within?: boolean }): Compared {
  const { per, lags } = opts, perDay = opts.perDay ?? PER_DAY, perms = opts.perms ?? 400, within = opts.within ?? true;
  const sorted = [...unsorted].sort((a, b) => a.i - b.i);
  const dayOf = (i: number) => Math.floor(i / perDay);
  const usual = againstUsual(sorted.map((s) => s.i), sorted.map((s) => s.y), perDay, per), dev = sorted.map((s, k) => ({ i: s.i, y: usual[k] }));
  // Within a day needs two points in it to compare; a day with one tells nothing.
  const perDayN = new Map<number, number>(); sorted.forEach((s) => perDayN.set(dayOf(s.i), (perDayN.get(dayOf(s.i)) ?? 0) + 1));
  const keep = sorted.map((s) => !within || (perDayN.get(dayOf(s.i)) ?? 0) >= 2);
  const samples = sorted.filter((_, k) => keep[k]), yres = usual.filter((_, k) => keep[k]);
  const days = [...new Set(samples.map((s) => dayOf(s.i)))].sort((a, b) => a - b);
  if (days.length < MIN_DAYS || samples.length < 20) return { n: samples.length, days: days.length, lags: [], best: null, span: null, slope: null, slopeSe: null, thirds: null, p: null, sure: "too few", points: [], bins: [], dev };
  // The driver against its usual for the half hour, in every slot.
  const allIdx: number[] = [], allVal: number[] = [];
  driver.forEach((v, i) => { if (v != null) { allIdx.push(i); allVal.push(v); } });
  const dres = new Float64Array(driver.length).fill(NaN);
  againstUsual(allIdx, allVal, perDay, Math.max(1, Math.round(perDay / 48))).forEach((r, k) => { dres[allIdx[k]] = r; });
  // r and slope for every lag, each sample's driver taken from day `dayMap[its day]` at the same clock time.
  // Flat loops over typed arrays: 600 scans of 90 days have to stay well under a second on a phone.
  const K = samples.length, sDay = new Int32Array(K), sTod = new Int32Array(K), yr = Float64Array.from(yres);
  samples.forEach((s, k) => { sDay[k] = dayOf(s.i); sTod[k] = s.i - sDay[k] * perDay; });
  const nd = days[days.length - 1] + 1, ident = new Int32Array(nd).map((_, d) => d), all = new Int32Array(K).map((_, k) => k);
  const byDay = new Map<number, number[]>(); samples.forEach((_, k) => { const d = sDay[k]; byDay.set(d, [...(byDay.get(d) ?? []), k]); });
  // Within a day: each day's own level is set aside, so a day you run high for any reason — sleep, heat, a cold, a
  // busy day — can't pass for an effect, and doesn't drown one. Groups are runs of the same day in `use`.
  const scan = (dayMap: Int32Array, use: Int32Array = all) => lags.map((L) => {
    let n = 0, cxy = 0, cxx = 0, cyy = 0, g = 0, gx = 0, gy = 0, gxx = 0, gyy = 0, gxy = 0, prev = -1;
    const flush = () => { if (g) { cxy += gxy - (gx * gy) / g; cxx += gxx - (gx * gx) / g; cyy += gyy - (gy * gy) / g; n += g; } g = gx = gy = gxx = gyy = gxy = 0; };
    for (let q = 0; q < use.length; q++) {
      const k = use[q];
      if (within && sDay[k] !== prev) { flush(); prev = sDay[k]; }
      const j = dayMap[sDay[k]] * perDay + sTod[k] - L;
      if (j < 0 || j >= dres.length) continue;
      const x = dres[j]; if (x !== x) continue;
      const y = yr[k]; g++; gx += x; gy += y; gxx += x * x; gyy += y * y; gxy += x * y;
    }
    flush();
    if (n < 20) return { r: 0, slope: 0 };
    return { r: cxx > 0 && cyy > 0 ? cxy / Math.sqrt(cxx * cyy) : 0, slope: cxx > 0 ? cxy / cxx : 0 };
  });
  const obs = scan(ident);
  let bi = 0; obs.forEach((o, k) => { if (Math.abs(o.r) > Math.abs(obs[bi].r)) bi = k; });
  // Shuffled days: the same search, on pairings that can't be connected.
  let seed = opts.seed ?? 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const nullMax: number[] = [], nullAbs: number[][] = lags.map(() => []), nullSlope: number[] = [];
  const map = Int32Array.from(ident);
  for (let p = 0; p < perms; p++) {
    const order = [...days]; for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    days.forEach((d, k) => { map[d] = order[k]; });
    const res = scan(map);
    nullMax.push(Math.max(...res.map((o) => Math.abs(o.r))));
    res.forEach((o, k) => nullAbs[k].push(Math.abs(o.r)));
    nullSlope.push(res[bi].slope);
  }
  // How firmly the delay is pinned: the best delay on resampled days (same direction as the observed one).
  const bestLags: number[] = [], dir = Math.sign(obs[bi].r) || 1;
  for (let b = 0; b < Math.max(40, perms / 2); b++) {
    const use: number[] = []; for (let k = 0; k < days.length; k++) use.push(...(byDay.get(days[Math.floor(rnd() * days.length)]) ?? []));
    const res = scan(ident, Int32Array.from(use)); let bj = 0;
    res.forEach((o, k) => { if (o.r * dir > res[bj].r * dir) bj = k; });
    bestLags.push(lags[bj]);
  }
  bestLags.sort((a, b) => a - b);
  const pval = (1 + nullMax.filter((m) => m >= Math.abs(obs[bi].r)).length) / (1 + perms);
  const ns = mean(nullSlope), slopeSe = Math.sqrt(nullSlope.reduce((s, x) => s + (x - ns) ** 2, 0) / Math.max(1, nullSlope.length - 1));
  // The scatter and the thirds at the best delay: raw driver; outcome against its usual and, like the numbers, the
  // rest of that day — so the picture shows what the numbers measured.
  const L = lags[bi], raw: { x: number; y: number; d: number }[] = [];
  samples.forEach((s, k) => { const v = driver[s.i - L]; if (v != null) raw.push({ x: v, y: yres[k], d: dayOf(s.i) }); });
  const dayMean = new Map<number, [number, number]>(); raw.forEach((p) => { const m = dayMean.get(p.d) ?? [0, 0]; m[0] += p.y; m[1]++; dayMean.set(p.d, m); });
  const pts = within ? raw.map((p) => { const m = dayMean.get(p.d)!; return { ...p, y: p.y - m[0] / m[1] }; }) : raw;
  const xsSorted = pts.map((p) => p.x).sort((a, b) => a - b), lo = quant(xsSorted, 1 / 3), hi = quant(xsSorted, 2 / 3);
  const low = pts.filter((p) => p.x <= lo).map((p) => p.y), high = pts.filter((p) => p.x >= hi).map((p) => p.y);
  // "Clear" is strict on purpose: the page offers about ten pairs to try, and one in a hundred of them shouldn't
  // come up clear by chance. Needs 200+ shuffles to be reachable.
  const sure: Sure = pval < 0.005 ? "clear" : pval < 0.05 ? "likely" : "not clear";
  return {
    n: pts.length, days: days.length,
    lags: lags.map((lag, k) => ({ lag, r: obs[k].r, band: quant(nullAbs[k].sort((a, b) => a - b), 0.95) })),
    best: { lag: L, r: obs[bi].r }, span: [Math.min(L, quant(bestLags, 0.1)), Math.max(L, quant(bestLags, 0.9))],
    slope: obs[bi].slope, slopeSe,
    thirds: low.length && high.length && hi > lo ? { lo, hi, low: mean(low), high: mean(high) } : null,
    p: pval, sure, points: pts, bins: bins(pts), dev,
  };
}

/** Up to 5 equal-width bands of the driver up to its 95th percentile (the top one open-ended); a band under 8 points joins the next. se: from each day's mean in the band, since points within a day move together. */
function bins(pts: { x: number; y: number; d: number }[]): Compared["bins"] {
  if (pts.length < 10) return [];
  const xs = pts.map((p) => p.x).sort((a, b) => a - b), lo = xs[0], w = (quant(xs, 0.95) - lo) / 5;
  if (!(w > 0)) return [];
  type G = { x0: number; x1: number; ps: typeof pts };
  const groups: G[] = [0, 1, 2, 3, 4].map((b) => ({ x0: lo + b * w, x1: b === 4 ? xs[xs.length - 1] : lo + (b + 1) * w, ps: [] }));
  for (const p of pts) groups[Math.min(4, Math.floor((p.x - lo) / w))].ps.push(p);
  const join = (a: G, b: G): G => ({ x0: a.x0, x1: b.x1, ps: [...a.ps, ...b.ps] });
  const out: G[] = []; let acc: G | null = null;
  for (const g of groups) { acc = acc ? join(acc, g) : g; if (acc.ps.length >= 8) { out.push(acc); acc = null; } }
  if (acc) out.push(out.length ? join(out.pop()!, acc) : acc);
  return out.map((g) => {
    const byDay = new Map<number, number[]>(); g.ps.forEach((p) => byDay.set(p.d, [...(byDay.get(p.d) ?? []), p.y]));
    const dm = [...byDay.values()].map(mean), md = mean(dm);
    const sd = dm.length > 1 ? Math.sqrt(dm.reduce((s, x) => s + (x - md) ** 2, 0) / (dm.length - 1)) : NaN;
    return { x0: g.x0, x1: g.x1, mean: mean(g.ps.map((p) => p.y)), se: sd / Math.sqrt(dm.length), n: g.ps.length };
  });
}

/** Outcome samples from per-minute heart rate: the mean of each 10-minute slot, every other slot, awake hours, workouts and the hour after left out. */
export function hrSamples(day0: number, hr: [number, number, number, number][], workouts: { start: number; end: number }[], awake: [number, number] = [7, 23]): Sample[] {
  const sums = new Map<number, [number, number, number]>();
  for (const m of hr) { const i = slotOf(m[0], day0); if (i < 0) continue; const s = sums.get(i) ?? [0, 0, m[0]]; s[0] += m[1]; s[1]++; sums.set(i, s); }
  const out: Sample[] = [];
  for (const [i, s] of sums) {
    if (i % 2 || s[1] < 3) continue;
    const t = s[2], h = (i % PER_DAY) / 6;
    if (h < awake[0] || h >= awake[1]) continue;
    if (workouts.some((w) => t >= w.start - 10 * 60_000 && t <= w.end + 60 * 60_000)) continue;
    out.push({ i, y: s[0] / s[1] });
  }
  return out.sort((a, b) => a.i - b.i);
}

/** Outcome samples from check-ins: one per check-in that has this feeling. */
export function checkSamples(day0: number, checks: { at: number; v: number | null | undefined }[]): Sample[] {
  return checks.flatMap((c) => (c.v == null || c.at < day0 ? [] : [{ i: slotOf(c.at, day0), y: c.v }]));
}
