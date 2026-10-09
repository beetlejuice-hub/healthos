import { describe, expect, it } from "vitest";
import type { HrMinute } from "./band";
import { rng } from "./bench";
import type { Check } from "./feelgraph";
import { afterEach } from "./hrusual";
import { feelAfter } from "./suppafter";
import { addDays, atMinute, MIN } from "./time";

const D0 = "2026-09-01";
/**
 * 30 days, check-ins at 09:00, 14:00 and 19:00; mood is higher at 14:00 every day (the trap). The supplement is taken at
 * 12:00 on `on(i)` days; `k` mood points planted at check-ins 1–4 h after it.
 */
function feelWorld(seed: number, k: number, on: (i: number) => boolean) {
  const { g } = rng(seed), checks: Check[] = [], times: number[] = [];
  for (let i = 0; i < 30; i++) {
    const day = addDays(D0, i), took = on(i);
    if (took) times.push(atMinute(day, 12 * 60));
    for (const h of [9, 14, 19]) checks.push({ at: atMinute(day, h * 60), mood: 6 + (h === 14 ? 1 : 0) + (took && h === 14 ? k : 0) + g() * 0.7 });
  }
  return { checks, times };
}

describe("how you felt after a supplement", () => {
  it("finds a planted +1 mood 1–4 h after, on the days it was taken — not the afternoon's usual lift", () => {
    const w = feelWorld(1, 1, (i) => i % 2 === 0), a = feelAfter(w.times, w.checks, "mood");
    expect(a).toMatchObject({ nWith: 15, nWithout: 15, sure: "clear" });
    expect(a.diff!).toBeGreaterThan(0.6); expect(a.diff!).toBeLessThan(1.4);
  });
  it("nothing planted: across 12 worlds never clear, likely at most once — the 14:00 lift alone isn't credited", () => {
    let clear = 0, likely = 0;
    for (let s = 1; s <= 12; s++) { const w = feelWorld(40 + s, 0, (i) => i % 2 === 0), a = feelAfter(w.times, w.checks, "mood", { perms: 600 }); if (a.sure === "clear") clear++; if (a.sure === "likely") likely++; }
    expect(clear).toBe(0); expect(likely).toBeLessThanOrEqual(1);
  });
  it("taken every day at the same time: no days without it to compare — too few, not a finding", () => {
    const w = feelWorld(1, 1, () => true), a = feelAfter(w.times, w.checks, "mood");
    expect(a.sure).toBe("too few");
    expect(a.nWith).toBe(0);
  });
  it("a check-in in the first hour after is neither side", () => {
    const a = feelAfter([atMinute(D0, 12 * 60)], [{ at: atMinute(D0, 12 * 60 + 30), mood: 9 }], "mood");
    expect([a.nWith, a.nWithout]).toEqual([0, 0]);
  });
});

/** 20 days of heart rate 07–23 at 62 ± noise; the supplement at 15:00 on half the days, +6 bpm planted 30–120 min after. */
function hrWorld(seed: number, withCoffee: boolean) {
  const { g } = rng(seed), hr: HrMinute[] = [], times: number[] = [], caf: number[] = [];
  for (let i = 0; i < 20; i++) {
    const day = addDays(D0, i), t0 = atMinute(day, 15 * 60), took = i % 2 === 0;
    if (took) { times.push(t0); if (withCoffee) caf.push(t0 - 20 * MIN); }
    for (let m = 7 * 60; m < 23 * 60; m++) { const t = atMinute(day, m), x = (t - t0) / MIN; const v = 62 + g() * 1.5 + (took && x >= 30 && x < 120 ? 6 : 0); hr.push([t, v, v - 2, v + 2]); }
  }
  return { hr, times, caf };
}

describe("heart rate after a supplement (afterEach)", () => {
  it("finds a planted +6 bpm, against the same hours on days without it", () => {
    const w = hrWorld(2, false), a = afterEach(w.times, w.hr, [], { minN: 5 });
    expect(a.n).toBe(10);
    expect(["clear", "likely"]).toContain(a.sure);
    expect(a.effect!).toBeGreaterThan(4); expect(a.effect!).toBeLessThan(8);
  });
  it("taken with coffee: those intakes are left out (the coffee would be measured)", () => {
    const w = hrWorld(2, true), a = afterEach(w.times, w.hr, [], { avoid: w.caf, minN: 5 });
    expect(a.n).toBe(0);
    expect(a.sure).toBe("too few");
  });
});
