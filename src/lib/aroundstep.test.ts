// PLAN 229 — what changed around a step. Known answers: around 25 Oct drinks went from about 1 a week to 2 a night and
// magnesium stopped; caffeine, protein and the rest stayed — those two are listed, drinks first with "Test it" (no drinks),
// magnesium as "stopped" (nothing to leave out: it went down). Too few days on a side: nothing.
import { describe, expect, it } from "vitest";
import { aroundStep } from "./aroundstep";
import type { DayFacts } from "./insights";
import { addDays } from "./time";

const STEP = "2026-10-25";
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const world = (n = 28) => { const r = rng(4);
  return Array.from({ length: n }, (_, i) => { const day = addDays(STEP, i - 14), after = day >= STEP;
    return { day, logged: true, alcoholG: after ? 28 + (r() - 0.5) * 10 : r() < 0.15 ? 14 : 0, lateCaffeineMg: 0, caffeineMg: 180 + (r() - 0.5) * 40, trained: [1, 3, 5].includes(i % 7), volumeKg: 0,
      kcal: 2300 + (r() - 0.5) * 200, proteinG: 140 + (r() - 0.5) * 20, taken: new Set(after ? [] : ["mag"]), skipped: new Set(after ? ["mag"] : []) } as unknown as DayFacts; }); };

describe("what changed around a step", () => {
  it("drinks up and magnesium stopped are listed, biggest first; the steady ones aren't", () => {
    const m = aroundStep(STEP, world(), [{ id: "mag", name: "Magnesium" }]);
    expect(m.map((x) => x.key).sort()).toEqual(["drinks", "supp-mag"]);
    const drinks = m.find((x) => x.key === "drinks")!;
    expect(drinks.say).toMatch(/^drinks [0-9.]+ a week → 1[3-5](\.\d)? a week$/);
    expect(drinks.test?.name).toBe("No drinks for 14 days");
    const mag = m.find((x) => x.key === "supp-mag")!;
    expect(mag.say).toBe("Magnesium stopped");
    expect(mag.test).toBeUndefined();
  });
  it("too few days after the step: nothing", () => expect(aroundStep(STEP, world(17), [])).toEqual([]));
});
