// PLAN 205 — connecting the dots, SYNAPS's way. Planted: 120 days where each drink takes 3 ms off the NEXT morning's HRV,
// and steps lift mood the same day; it finds both, at the right lag, with the slope near what was planted. Controls: two
// things that only drift (weight down, HRV up) aren't linked; two slow random walks (autocorrelated, unrelated) aren't
// linked once n is cut to the effective n — they would be without it; 12 unrelated series give no link after the
// false-discovery correction. Plus the maths: t's p-value, Benjamini–Hochberg, lag-1, deviations.
import { describe, expect, it } from "vitest";
import { bh, CONNECT, connect, deviations, lag1, linkWords, pT, spearman, type Series, type Thing } from "./connect";

const addD = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function rng(seed: number) { let s = seed; return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r: () => number) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const D0 = "2026-07-01", N = 120;
const series = (f: (i: number) => number | null): Series => { const s: Series = {}; for (let i = 0; i < N; i++) { const v = f(i); if (v != null) s[addD(D0, i)] = v; } return s; };

function world(seed = 1) {
  const r = rng(seed), drinks = Array.from({ length: N }, () => Math.max(0, Math.round(gauss(r) * 1.3 + 0.8)));
  const steps = Array.from({ length: N }, () => 8000 + gauss(r) * 2500);
  let ar = 0;
  const hrv = Array.from({ length: N }, (_, i) => { ar = 0.4 * ar + gauss(r) * 4; return 62 + ar - 3 * (i > 0 ? drinks[i - 1] : 0); });
  const mood = steps.map((s) => 6 + (s - 8000) / 2500 * 0.6 + gauss(r) * 0.8);
  const protein = Array.from({ length: N }, () => 130 + gauss(r) * 30);
  const things: Thing[] = [
    { key: "drinks", name: "Drinks", unit: "drink", per: "each drink", role: "input", series: series((i) => drinks[i]) },
    { key: "steps", name: "Steps", unit: "", role: "input", series: series((i) => steps[i]) },
    { key: "protein", name: "Protein", unit: "g", role: "input", series: series((i) => protein[i]) },
    { key: "hrv", name: "HRV", unit: "ms", role: "outcome", series: series((i) => hrv[i]) },
    { key: "mood", name: "Mood", unit: "", role: "outcome", series: series((i) => mood[i]) },
  ];
  return things;
}

describe("connecting the dots (SYNAPS's mechanism)", () => {
  it("planted: drinks → HRV the next day (−3 a drink), steps → mood the same day; nothing for protein", () => {
    const things = world(), links = connect(things);
    const dh = links.find((l) => l.from === "drinks" && l.to === "hrv")!, sm = links.find((l) => l.from === "steps" && l.to === "mood")!;
    expect(dh.lag).toBe(1);
    expect(dh.slope).toBeGreaterThan(-3.8); expect(dh.slope).toBeLessThan(-2.2);
    expect(dh.lo).toBeLessThan(dh.slope); expect(dh.hi).toBeGreaterThan(dh.slope);
    expect(sm.lag).toBe(0);
    expect(links.some((l) => l.from === "protein")).toBe(false);
    expect(linkWords(dh, new Map(things.map((t) => [t.key, t])))).toMatch(/^Each drink goes with HRV \d\.\d ms lower the next day \(90 %: [\d.]+–[\d.]+\) · 119 days, about \d+ independent · q/);
  });
  it("found across 10 worlds: drinks → HRV every time, at lag 1", () => {
    const hits = Array.from({ length: 10 }, (_, s) => connect(world(s + 10)).find((l) => l.from === "drinks" && l.to === "hrv")?.lag);
    expect(hits).toEqual(new Array(10).fill(1));
  });
  it("control: two things that only drift (weight down, HRV up over the season) aren't linked", () => {
    const r = rng(5), things: Thing[] = [
      { key: "weight", name: "Weight", unit: "kg", role: "input", series: series((i) => 82 - i * 0.03 + gauss(r) * 0.3) },
      { key: "hrv", name: "HRV", unit: "ms", role: "outcome", series: series((i) => 55 + i * 0.08 + gauss(r) * 4) },
    ];
    expect(connect(things)).toEqual([]);
  });
  it("control: two slow random walks, unrelated, aren't linked once n is honest", () => {
    let fooled = 0, found = 0;
    for (let s = 0; s < 20; s++) {
      const r = rng(100 + s); let a = 0, b = 0;
      const A = series(() => (a = 0.93 * a + gauss(r))), B = series(() => (b = 0.93 * b + gauss(r)));
      const things: Thing[] = [{ key: "a", name: "A", unit: "", role: "input", series: A }, { key: "b", name: "B", unit: "", role: "outcome", series: B }];
      found += connect(things).length;
      // the same test with every day counted as independent (no deviations, no effective n) is fooled more often
      const x = Object.keys(A).map((d) => A[d]), y = Object.keys(A).map((d) => B[d]), rho = spearman(x, y), t = rho * Math.sqrt((x.length - 2) / (1 - rho * rho));
      if (pT(t, x.length - 2) < 0.05) fooled++;
    }
    expect(found).toBeLessThanOrEqual(3); // about the 10 % false-discovery rate it allows
    expect(fooled).toBeGreaterThanOrEqual(found + 6);
  });
  it("control: 12 unrelated series — nothing survives the false-discovery correction", () => {
    const r = rng(77), things: Thing[] = Array.from({ length: 12 }, (_, k) => ({ key: `s${k}`, name: `S${k}`, unit: "", role: k < 6 ? "input" as const : "outcome" as const, series: series(() => gauss(r)) }));
    expect(connect(things)).toEqual([]);
  });
  it("too few days: nothing said", () => {
    const things = world().map((t) => ({ ...t, series: Object.fromEntries(Object.entries(t.series).slice(0, CONNECT.minN - 2)) }));
    expect(connect(things)).toEqual([]);
  });
});

describe("the maths", () => {
  it("t's two-sided p (known values)", () => {
    expect(pT(2.228, 10)).toBeCloseTo(0.05, 3);
    expect(pT(1.96, 1e6)).toBeCloseTo(0.05, 3);
    expect(pT(0, 20)).toBeCloseTo(1, 6);
  });
  it("Benjamini–Hochberg (the textbook example)", () => {
    const q = bh([0.01, 0.04, 0.03, 0.005]);
    expect(q.map((v) => +v.toFixed(4))).toEqual([0.02, 0.04, 0.04, 0.02]);
  });
  it("lag-1 autocorrelation and deviations from the centred 21-day mean", () => {
    let a = 0; const r = rng(3), s = series(() => (a = 0.8 * a + gauss(r)));
    expect(lag1(s)).toBeGreaterThan(0.6);
    const flat = deviations(series((i) => 10 + i * 0.5));
    expect(Math.abs(flat[addD(D0, 60)])).toBeLessThan(1e-9); // a straight line is its own mean
    expect(Object.keys(flat).length).toBeGreaterThan(100);
  });
});
