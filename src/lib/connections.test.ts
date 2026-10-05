import { describe, expect, it } from "vitest";
import { better, comparisons, FACTORS, OUTCOMES, pair, strongestPairs } from "./connections";
import type { GlanceDay } from "./glance";
import type { Supplement } from "./types";
import { addDays } from "./time";

const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

/**
 * 84 days with planted effects: training → +1.5 mood that day; caffeine at bed (late coffee) →
 * −1.5 on the next morning's sleep rating; magnesium (evening) → nothing at all.
 */
function world(seed = 11): GlanceDay[] {
  const r = rng(seed), out: GlanceDay[] = [];
  for (let i = 0; i < 84; i++) {
    const trained = r() < 0.45, late = r() < 0.3, mag = r() < 0.5, drinks = r() < 0.15 ? 2 : 0;
    const prevLate = out[i - 1]?.lateCaffeine ?? false;
    out.push({
      day: addDays("2026-07-13", i), mood: 6 + (trained ? 1.5 : 0) + gauss(r) * 0.8, energy: 6 + gauss(r) * 0.8, focus: null, stress: 4 + gauss(r) * 0.8,
      sleep: Math.round(7 - (prevLate ? 1.5 : 0) + gauss(r) * 0.8), kcal: 2300, protein: 140, cafBed: late ? 60 : 10, drinks, weight: null,
      trained, lateCaffeine: late, note: false, checkins: 2, taken: mag ? ["mag"] : [], stackAnswered: true,
    });
  }
  return out;
}
const MAG: Supplement = { id: "mag", name: "Magnesium", dose: "400 mg", slot: "evening", at: 1290, active: true };

describe("comparisons", () => {
  const rows = comparisons(world(), [MAG]);
  const get = (id: string) => rows.find((c) => c.id === id)!;
  it("finds the planted training → mood link, clear and the right way", () => {
    const c = get("train-mood");
    expect(c.diff!.clear).toBe(true);
    expect(c.diff!.value).toBeGreaterThan(1); expect(c.diff!.value).toBeLessThan(2);
    expect(better(c)!.d).toBeGreaterThan(0);
  });
  it("finds late caffeine → a worse sleep rating that night (the rating comes the next morning)", () => {
    const c = get("caf-sleep");
    expect(c.diff!.clear).toBe(true);
    expect(c.diff!.value).toBeLessThan(-1);
    expect(better(c)!.hi).toBeLessThan(0); // drawn on the "worse for you" side
  });
  it("doesn't find a supplement effect that isn't there", () => {
    let clear = 0;
    for (let seed = 1; seed <= 40; seed++) for (const id of ["supp-mag-mood", "supp-mag-sleep"]) if (comparisons(world(seed), [MAG]).find((c) => c.id === id)!.diff!.clear) clear++;
    expect(clear / 80).toBeLessThan(0.15); // ~5% by chance; far more would mean a broken comparison
  });
  it("flips stress so right is always better", () => {
    const c = { ...get("train-stress"), diff: { value: -1, lo: -1.5, hi: -0.5, n: 30, clear: true } };
    expect(better(c)).toEqual({ d: 1, lo: 0.5, hi: 1.5 });
  });
  it("keeps each group together, supplements included", () => {
    const groups = rows.map((r) => r.group);
    expect(groups.filter((g, i) => i && g !== groups[i - 1]).length).toBe(3); // Mood → Energy → Stress → Sleep
  });
  it("says how many days are still needed instead of guessing", () => {
    const few = comparisons(world().slice(0, 6), [MAG]).find((c) => c.id === "drinks-mood")!;
    expect(few.diff).toBeNull(); expect(few.need).toBeGreaterThan(0);
  });
  it("leaves days without a stack answer out of the supplement comparison", () => {
    const ds = world().map((d, i) => (i % 2 ? { ...d, stackAnswered: false, taken: [] } : d));
    const c = comparisons(ds, [MAG]).find((x) => x.id === "supp-mag-mood")!;
    expect(c.nWith + c.nWithout).toBeLessThanOrEqual(42);
  });
});

describe("explorer", () => {
  const ds = world();
  it("pairs caffeine at bed with the next morning's sleep rating", () => {
    const p = pair(ds, FACTORS.find((f) => f.k === "cafBed")!, OUTCOMES.find((o) => o.k === "sleep")!, 0);
    expect(p.r!.clear).toBe(true); expect(p.r!.value).toBeLessThan(-0.4);
    expect(p.pts[0][2]).toBe(ds[0].day);
  });
  it("doesn't call two feelings from the same check-in a finding", () => {
    const tied = ds.map((d) => ({ ...d, focus: d.energy! + 0.1 }));
    expect(strongestPairs(tied).some((p) => p.lag === 0 && p.x.k === "energy" && p.y.k === "focus")).toBe(false);
  });
  it("ranks the planted links first and never pairs a measure with itself", () => {
    const top = strongestPairs(ds);
    expect(top.length).toBeGreaterThan(0);
    expect(top.some((p) => p.x.k === "cafBed" && p.y.k === "sleep")).toBe(true);
    expect(top.every((p) => p.x.k !== p.y.k)).toBe(true);
    expect(top.some((p) => p.lag === 0 && ["energy", "stress"].includes(p.x.k) && ["mood", "energy", "focus", "stress"].includes(p.y.k))).toBe(false);
    expect(top.every((p, i) => i === 0 || Math.abs(top[i - 1].r!.value) >= Math.abs(p.r!.value))).toBe(true);
  });
});
