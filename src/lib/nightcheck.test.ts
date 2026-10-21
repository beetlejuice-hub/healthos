import { describe, expect, it } from "vitest";
import { nightBits, nightCheck, nightCheckLines, nightUsual, type NightDaily } from "./nightcheck";
import { addDays } from "./time";

// PLAN 52 — owner, 21 Oct: "1 good / 2 line": the night check first, a line under readiness, the score unchanged.
const DAY = "2026-10-21";
function rng(seed: number) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}
/** 40 nights up to `DAY`: skin 33.8 ± 0.12 °C, breathing 14.5 ± 0.3, blood oxygen 96 ± 0.5 — `plant` added to the last `days` nights. */
function nights(seed: number, plant: Partial<Record<"skin" | "breath" | "spo2", number>> = {}, days = 1, spread = 1): NightDaily {
  const g = rng(seed), out: Required<NightDaily> = { skin: {}, breath: {}, spo2: {} };
  for (let k = 39; k >= 0; k--) {
    const d = addDays(DAY, -k), p = k < days ? 1 : 0;
    out.skin[d] = 33.8 + g() * 0.12 * spread + p * (plant.skin ?? 0);
    out.breath[d] = 14.5 + g() * 0.3 * spread + p * (plant.breath ?? 0);
    out.spo2[d] = Math.min(100, 96 + g() * 0.5 * spread + p * (plant.spo2 ?? 0));
  }
  return out;
}

describe("the night check", () => {
  it("finds a planted rise in skin temperature and breathing, and says they go together", () => {
    const c = nightCheck(DAY, nights(1, { skin: 0.8, breath: 2 }));
    expect(c.off.map((s) => s.id)).toEqual(["skin", "breath"]);
    expect(c.signals.find((s) => s.id === "skin")!.diff).toBeCloseTo(0.8, 0);
    expect(c.line).toMatch(/^Night check: skin 0\.\d °C over your usual and breathing [12]\.\d\/min over your usual — together these go with getting ill/);
    expect(c.line).not.toMatch(/cause/);
  });

  it("the same nights without the plant: nothing off, no line — and across 300 ordinary nights it almost never cries wolf", () => {
    expect(nightCheck(DAY, nights(1)).line).toBeNull();
    let flagged = 0, judged = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const n = nights(seed);
      for (const k of [0, 3, 6]) { const c = nightCheck(addDays(DAY, -k), n); judged++; if (c.off.length) flagged++; }
    }
    expect(judged).toBe(300);
    expect(flagged).toBeLessThanOrEqual(3);
  });

  it("one off alone gets the softer line; with the heart's own sign it's two together", () => {
    const n = nights(2, { skin: 0.7 });
    expect(nightCheck(DAY, n).line).toMatch(/^Night check: skin 0\.\d °C over your usual\. On its own it also goes with a warm room/);
    expect(nightCheck(DAY, n, ["HRV under your usual"]).line).toMatch(/^Night check: skin 0\.\d °C over your usual and HRV under your usual — together/);
    // the heart alone is readiness's to say, not a night check
    expect(nightCheck(DAY, nights(2), ["HRV under your usual"]).line).toBeNull();
  });

  it("only the worrying direction: a cool room or slower breathing is no warning; lower blood oxygen is", () => {
    expect(nightCheck(DAY, nights(3, { skin: -0.9, breath: -2, spo2: 2 })).off).toEqual([]);
    const c = nightCheck(DAY, nights(3, { spo2: -2.5 }));
    expect(c.off.map((s) => s.id)).toEqual(["spo2"]);
    expect(c.line).toMatch(/blood oxygen 2\.\d points under your usual/);
  });

  it("someone whose nights wander more isn't flagged for an ordinary one: off is at least 2× their own spread", () => {
    // spread ×4: skin ± 0.48 °C — a night 0.6 over is within their ordinary; for the steady sleeper it's off
    const wide = nights(4, {}, 1, 4), steady = nights(4);
    const u = nightUsual(wide.skin, DAY, "skin")!, s = nightUsual(steady.skin, DAY, "skin")!;
    expect(u.spread).toBeGreaterThan(0.3);
    wide.skin![DAY] = u.usual + 0.6; steady.skin![DAY] = s.usual + 0.6;
    expect(nightCheck(DAY, wide).off).toEqual([]);
    expect(nightCheck(DAY, steady).off.map((x) => x.id)).toEqual(["skin"]);
  });

  it("a few unwell days don't become their own usual: the usual ends a week ago", () => {
    const n = nights(5, { skin: 0.8, breath: 2 }, 5);
    const c = nightCheck(DAY, n);
    expect(c.off.map((s) => s.id)).toEqual(["skin", "breath"]);
    expect(c.signals[0].usual).toBeCloseTo(33.8, 0);
  });

  it("under 10 nights before last week: the values show, nothing is judged", () => {
    const n = nights(6, { skin: 2 }), short: NightDaily = {};
    for (const k of ["skin", "breath", "spo2"] as const) short[k] = Object.fromEntries(Object.entries(n[k]!).filter(([d]) => d >= addDays(DAY, -16)));
    const c = nightCheck(DAY, short);
    expect(c.signals).toHaveLength(3);
    expect(c.signals.every((s) => s.usual == null && !s.off)).toBe(true);
    expect(c.line).toBeNull();
    expect(nightCheckLines(c)[0]).toMatch(/Skin temperature 35\.\d °C \(usual not known yet\)/);
  });

  it("no value last night, or junk: left out, not zero", () => {
    const n = nights(7);
    delete n.breath![DAY]; n.spo2![DAY] = 0;
    expect(nightCheck(DAY, n).signals.map((s) => s.id)).toEqual(["skin"]);
    expect(nightCheck(DAY, {}).signals).toEqual([]);
    expect(nightCheckLines(nightCheck(DAY, {}))).toEqual([]);
  });

  it("for the AI: each against its usual, the line after; and a short form per night", () => {
    const l = nightCheckLines(nightCheck(DAY, nights(1, { skin: 0.8, breath: 2 })));
    expect(l[0]).toMatch(/^Last night from the band: Skin temperature 34\.\d °C \(usual 33\.\d, \+0\.\d °C\) — off; Breathing 1\d\.\d\/min \(usual 14\.\d, \+[12]\.\d\/min\) — off; Blood oxygen 9\d % \(usual 9\d, [+−]0\.\d %\)\.$/);
    expect(l[1]).toMatch(/^Night check:/);
    expect(nightBits(DAY, nights(1, { skin: 0.8 }))).toEqual([expect.stringMatching(/^skin temperature \+0\.\d °C vs usual$/), expect.stringMatching(/^breathing 1\d\.\d\/min$/), expect.stringMatching(/^blood oxygen 9\d %$/)]);
  });
});
