import { describe, expect, it } from "vitest";
import { feelWorld, rng } from "./bench";
import { pair, scout, signals, since, verdict } from "./scout";
import type { DayFacts } from "./insights";
import type { Supplement } from "./types";

const STACK: Supplement[] = [{ id: "saffron", name: "Saffron", dose: "", slot: "evening", at: 1290, active: true }];
const sig = (id: string) => signals(STACK).find((s) => s.id === id)!;

/** A fake person where big meals pull next-day mood down by `drop` points. */
function bigMealWorld(seed: number, drop: number, days = 60): DayFacts[] {
  const f = feelWorld({ seed, days });
  const { r } = rng(seed + 1000);
  f.forEach((d) => { if (d.kcal != null) d.bigMealKcal = Math.round(500 + r() * 800); });
  for (let i = 1; i < f.length; i++) {
    const big = f[i - 1].bigMealKcal != null && f[i - 1].bigMealKcal! > 1000;
    if (big && f[i].mood != null) f[i].mood = Math.max(1, f[i].mood! - drop);
  }
  return f;
}

describe("scout", () => {
  it("spots 'big meals → worse mood next day' and says how often it held", () => {
    let hits = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const p = scout(bigMealWorld(seed, 2), STACK).find((x) => x.a.id === "bigMeal" && x.b.id === "mood" && x.lag === 1);
      if (p) { hits++; expect(p.sign).toBe(-1); expect(p.text).toBe("Biggest meal and next-day mood move opposite ways"); expect(p.held).toBeGreaterThanOrEqual(p.of / 2); }
    }
    expect(hits / 60).toBeGreaterThanOrEqual(0.8);
  });

  it("spots same-day yes/no patterns in words: gym days and energy", () => {
    const f = feelWorld({ seed: 4, days: 60 });
    f.forEach((d) => { if (d.trained && d.energy != null) d.energy = Math.max(1, d.energy - 2); });
    const p = pair(sig("gym"), sig("energy"), 0, f)!;
    expect(p.text).toMatch(/^On a gym day, your energy tends to be lower \(\d\.\d vs \d\.\d\)$/);
    expect(p.held / p.of).toBeGreaterThan(0.6);
  });

  it("stays fairly quiet on noise: few patterns, and none from weekend habits", () => {
    let total = 0, any = 0;
    for (let seed = 1; seed <= 100; seed++) { const n = scout(feelWorld({ seed, days: 60 }), STACK).length; total += n; if (n) any++; }
    // Measured 1 Oct: ~0.9 chance flags per person at 30–60 days (0.3 at 90); each says "could be chance" and fades if new days don't fit.
    expect(total / 100).toBeLessThan(1);
    let fooled = 0;
    for (let seed = 1; seed <= 60; seed++) if (scout(feelWorld({ seed, weekendDrinking: true, weekendMood: 1.5 }), STACK).some((p) => [p.a.id, p.b.id].includes("alcohol") && [p.a.id, p.b.id].includes("mood"))) fooled++;
    expect(fooled / 60).toBeLessThanOrEqual(0.1);
  });

  it("a yes/no thing leads the sentence, and mostly-zero amounts compare against your zero days", () => {
    const f = feelWorld({ seed: 6, days: 60 });
    f.forEach((d) => { if (d.trained && d.kcal != null) d.kcal += 600; });
    const p = pair(sig("kcal"), sig("gym"), 0, f)!;
    expect(p.text).toMatch(/^On a gym day, calories tend to be higher \([\d,]+ kcal vs [\d,]+ kcal\)$/);
    const g = feelWorld({ seed: 8, days: 60 });
    g.forEach((d, i) => { const n = g[i + 1]; if (d.lateCaffeineMg > 0 && n?.energy != null) n.energy = Math.max(1, n.energy - 2); });
    const q = pair(sig("lateCaf"), sig("energy"), 1, g)!;
    expect(q.held / q.of).toBeGreaterThan(0.6);
  });

  it("dismissing is per family pair, so a twin can't take its place", () => {
    const f = [1, 2, 3, 4, 5].map((seed) => bigMealWorld(seed, 2.5)).find((w) => scout(w, STACK).some((p) => p.id === "feel~food"))!;
    const id = "feel~food";
    expect(id).toBe("feel~food");
    expect(scout(f, STACK, (k) => k === id).some((p) => p.id === id)).toBe(false);
  });

  it("never pairs things that are the same thing (calories vs biggest meal, gym vs volume)", () => {
    const f = bigMealWorld(9, 2);
    for (const p of scout(f, STACK)) expect(p.a.family).not.toBe(p.b.family);
  });

  it("the forward check counts only days after it was flagged", () => {
    const f = bigMealWorld(3, 2.5, 70);
    const p = pair(sig("bigMeal"), sig("mood"), 1, f)!;
    const memo = { first: f[45].day, sign: p.sign };
    const s = since(p, memo, f)!;
    expect(s.of).toBeGreaterThanOrEqual(3);
    expect(s.held / s.of).toBeGreaterThan(0.5);
    expect(since(p, { first: f[69].day, sign: p.sign }, f)).toBeNull(); // no new days yet
  });

  it("new days confirm or fade a pattern", () => {
    expect(verdict(null)).toBe("watching");
    expect(verdict({ held: 3, of: 4 })).toBe("watching");
    expect(verdict({ held: 5, of: 6 })).toBe("confirmed");
    expect(verdict({ held: 2, of: 6 })).toBe("faded");
  });
});
