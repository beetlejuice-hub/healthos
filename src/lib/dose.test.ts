import { describe, expect, it } from "vitest";
import { changeDose, doseAmount, doseAt, doseCompare } from "./dose";
import { rng } from "./bench";
import type { Entry, Supplement } from "./types";

describe("doses", () => {
  it("reads amounts", () => {
    expect(doseAmount("400 mg")).toEqual({ n: 400, unit: "mg" });
    expect(doseAmount("2 x 200mg")).toEqual({ n: 400, unit: "mg" });
    expect(doseAmount("1,5 g")).toEqual({ n: 1.5, unit: "g" });
    expect(doseAmount("2000 IU")).toEqual({ n: 2000, unit: "iu" });
    expect(doseAmount("one capsule")).toBeNull();
  });
  it("a change keeps history: past days keep the old dose", () => {
    const s: Pick<Supplement, "dose" | "doseLog"> = { dose: "200 mg" };
    const p = changeDose(s, "400 mg", 1000)!;
    expect(p.doseLog).toEqual([{ at: 0, dose: "200 mg" }, { at: 1000, dose: "400 mg" }]);
    const s2 = { ...s, ...p };
    expect([doseAt(s2, 500), doseAt(s2, 1000), doseAt(s2, 5000)]).toEqual(["200 mg", "400 mg", "400 mg"]);
    expect(changeDose(s2, " 400 mg ", 2000)).toBeNull();
    expect(changeDose({ dose: "" }, "5 g", 3000)).toEqual({ dose: "5 g" }); // first dose of a new one
  });
});

describe("higher vs lower dose (fake person, known answers)", () => {
  // 40 days of magnesium: 200 mg for 20 days, then 400 mg. Sleep the next morning is `effect` better on 400.
  const world = (seed: number, effect: number) => {
    const { g } = rng(seed), D = 86_400_000, t0 = new Date(2026, 7, 1, 21, 30).getTime();
    const s: Supplement = { id: "mag", name: "Magnesium", dose: "400 mg", slot: "evening", at: 21 * 60 + 30, active: true, doseLog: [{ at: 0, dose: "200 mg" }, { at: t0 + 20 * D - 1, dose: "400 mg" }] };
    const es: Entry[] = [];
    for (let i = 0; i < 40; i++) {
      const at = t0 + i * D, high = i >= 20;
      es.push({ id: `s${i}`, kind: "supp", at, suppId: "mag", status: "taken" });
      es.push({ id: `r${i}`, kind: "sleep", at: at + 10 * 3600e3, rating: Math.max(1, Math.min(10, Math.round(6 + g() * 1.1 + (high ? effect : 0)))) });
      es.push({ id: `f${i}`, kind: "feel", at: at + 13 * 3600e3, mood: Math.max(1, Math.min(10, Math.round(6 + g() * 1.2))) });
    }
    return doseCompare(es, [s])[0];
  };
  it("finds a planted 1.5-point better sleep on the higher dose", () => {
    const found = Array.from({ length: 30 }, (_, k) => world(k, 1.5)).filter((c) => c.rows.find((r) => r.metric === "sleep")!.diff?.clear && c.rows.find((r) => r.metric === "sleep")!.diff!.value > 0).length;
    expect(found).toBeGreaterThanOrEqual(27);
    const c = world(1, 1.5);
    expect(c).toMatchObject({ hi: { dose: "400 mg", days: 20 }, lo: { dose: "200 mg", days: 20 }, need: 0 });
  });
  it("doesn't find one that isn't there (mood has no effect planted)", () => {
    const clear = Array.from({ length: 100 }, (_, k) => world(500 + k, 1.5)).filter((c) => c.rows.find((r) => r.metric === "mood")!.diff?.clear).length;
    expect(clear).toBeLessThanOrEqual(10); // ~5% expected
  });
  it("says nothing with a single dose, and counts days still needed", () => {
    const s: Supplement = { id: "x", name: "Zinc", dose: "15 mg", slot: "morning", at: 480, active: true };
    expect(doseCompare([{ id: "a", kind: "supp", at: 1, suppId: "x", status: "taken" }], [s])).toEqual([]);
  });
});
