import { describe, expect, it } from "vitest";
import { capsulesIn, changeDose, doseAmount, doseAt, doseCompare, perCapsule, stepAmount, takenAmount, typedAmount } from "./dose";
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

describe("what you actually took (owner, 9 Oct: 1 capsule = 200 mg; +1 → 400 mg, or type 300 mg)", () => {
  const mag: Pick<Supplement, "dose" | "doseLog"> = { dose: "200 mg" };
  it("one capsule is the dose, or its 'each' when written 2 x 200 mg", () => {
    expect(perCapsule(mag, 0)).toEqual({ n: 200, unit: "mg" });
    expect(perCapsule({ dose: "2 x 200mg" }, 0)).toEqual({ n: 200, unit: "mg" });
    expect(perCapsule({ dose: "one capsule" }, 0)).toBeNull();
  });
  it("+1 capsule and −1, never under one", () => {
    expect(stepAmount(mag, 0, "200 mg", 1)).toBe("400 mg");
    expect(stepAmount(mag, 0, "400 mg", -1)).toBe("200 mg");
    expect(stepAmount(mag, 0, "200 mg", -1)).toBe("200 mg");
    expect(stepAmount(mag, 0, "300 mg", 1)).toBe("500 mg");
    expect(stepAmount({ dose: "2 x 200 mg" }, 0, "400 mg", 1)).toBe("600 mg");
    expect(stepAmount(mag, 0, "1 g", 1)).toBeNull(); // another unit: no guessing
  });
  it("capsules in an amount, and a typed amount takes the dose's unit", () => {
    expect([capsulesIn(mag, 0, "400 mg"), capsulesIn(mag, 0, "300 mg")]).toEqual([2, null]);
    expect([typedAmount(mag, 0, "300"), typedAmount(mag, 0, "300mg"), typedAmount(mag, 0, "0,5 g"), typedAmount(mag, 0, "lots")]).toEqual(["300 mg", "300 mg", "0.5 g", null]);
  });
  it("an intake's logged amount wins over the plan's dose; a day's dose is everything taken that day", () => {
    const s: Supplement = { id: "mag", name: "Magnesium", dose: "200 mg", slot: "evening", slots: ["morning", "evening"], at: 21 * 60, active: true };
    expect(takenAmount(s, { at: 0 })).toBe("200 mg");
    expect(takenAmount(s, { at: 0, amount: "400 mg" })).toBe("400 mg");
    // 12 days at 400 (one +1 intake), 12 at 200 (100 in the morning + 100 in the evening)
    const D = 86_400_000, t0 = new Date(2026, 8, 1, 21).getTime(), es: Entry[] = [];
    for (let i = 0; i < 24; i++) {
      const at = t0 + i * D;
      if (i < 12) es.push({ id: `a${i}`, kind: "supp", at, suppId: "mag", status: "taken", amount: "400 mg" });
      else { es.push({ id: `b${i}`, kind: "supp", at: at - 12 * 3600e3, suppId: "mag", status: "taken", amount: "100 mg", slot: "morning" }, { id: `c${i}`, kind: "supp", at, suppId: "mag", status: "taken", amount: "100 mg", slot: "evening" }); }
      es.push({ id: `r${i}`, kind: "sleep", at: at + 10 * 3600e3, rating: 6 });
    }
    const c = doseCompare(es, [s])[0];
    expect([c.hi, c.lo]).toEqual([{ dose: "400 mg", days: 12 }, { dose: "200 mg", days: 12 }]);
    // the same slot logged twice in a day is one intake, not double
    const dup: Entry[] = es.flatMap((e): Entry[] => (e.kind === "supp" ? [e, { ...e, id: e.id + "x" }] : [e]));
    expect(doseCompare(dup, [s])[0].lo).toEqual({ dose: "200 mg", days: 12 });
  });
});
