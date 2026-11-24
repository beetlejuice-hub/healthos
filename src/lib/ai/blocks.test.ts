// PLAN 227 — experiments in alternating blocks. Known answers: 14 days becomes 16 (two pairs of 4-day blocks, each pair
// one ON and one OFF in a random order); the first day of a block that switches is a washout; NAP of [3,4] against [1,2]
// is 1, of identical sets ½. Run on fake people whose energy drifts up 2 points over the weeks (the season, a new job):
// before-against-during calls that drift a verdict in about a quarter; ON-against-OFF in blocks rarely; a real +1.5 on
// ON days is still found — less often: the price.
import { describe, expect, it } from "vitest";
import type { DayFacts } from "../insights";
import type { Experiment } from "../store";
import { addDays } from "../time";
import { judge } from "./apply";
import { blockOn, makeBlocks, nap } from "./blocks";

const START = "2026-10-15";
function gauss(seed: number) { let s = seed >>> 0; const u = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; return () => { let x = 0; for (let i = 0; i < 12; i++) x += u(); return x - 6; }; }

describe("alternating blocks", () => {
  it("14 days → two pairs of 4-day blocks, one ON and one OFF each; a switching block's first day is a washout", () => {
    const { blocks, days } = makeBlocks(14, 3);
    expect(days).toBe(16); expect(blocks.order).toHaveLength(4);
    for (let i = 0; i < 4; i += 2) expect([blocks.order[i], blocks.order[i + 1]].sort()).toEqual(["off", "on"]);
    const b = { len: 4, order: ["on", "off", "off", "on"] as ("on" | "off")[] };
    expect(blockOn(b, START, START)).toEqual({ on: true, washout: false, block: 0 });
    expect(blockOn(b, START, addDays(START, 4))).toEqual({ on: false, washout: true, block: 1 });
    expect(blockOn(b, START, addDays(START, 8))).toEqual({ on: false, washout: false, block: 2 }); // OFF after OFF: no washout
    expect(blockOn(b, START, addDays(START, -1))).toBeNull();
  });
  it("NAP: the share of (ON, OFF) pairs where ON was better", () => {
    expect(nap([3, 4], [1, 2])).toBe(1);
    expect(nap([2, 2], [2, 2])).toBe(0.5);
    expect(nap([1], [3], -1)).toBe(1); // stress: lower is better
  });

  // energy drifting up `drift` points over 30 days, AR(0.4) day to day, `lift` on the days it was done
  const world = (seed: number, drift: number, lift: number, on: (day: string) => boolean) => { const g = gauss(seed); let a = g();
    return Array.from({ length: 32 }, (_, i) => { a = 0.4 * a + Math.sqrt(0.84) * g(); const day = addDays(START, i - 14);
      return { day, energy: Math.max(1, Math.min(10, Math.round(5 + 1.2 * a + (drift * i) / 30 + (on(day) ? lift : 0)))), weekend: [0, 6].includes(new Date(`${day}T12:00:00`).getDay()) } as unknown as DayFacts; }); };
  const said = (s: string) => s === "better" || s === "worse";
  const rate = (f: (k: number) => boolean, n = 200) => { let c = 0; for (let k = 0; k < n; k++) if (f(k)) c++; return c / n; };
  const end = addDays(START, 17);
  it("control: energy drifting up 2 points, nothing planted — before/during calls it often, blocks rarely", () => {
    const classic: Experiment = { id: "c", name: "x", how: "", days: 16, measure: "energy", start: START };
    const before = rate((k) => said(judge(classic, world(k + 1, 2, 0, () => false), end).state));
    const blocked = rate((k) => { const { blocks } = makeBlocks(16, k + 9); const x = { ...classic, blocks }; return said(judge(x, world(k + 1, 2, 0, () => false), end).state); });
    // measured 24 Nov (300 each): before/during 26 %, blocks 7 % (16 days, 2 points over a month)
    expect(before).toBeGreaterThan(0.18);
    expect(blocked).toBeLessThan(0.1);
  });
  // the price: half the days are OFF and each switch loses a day — +1.5 is found in about a third in 16 days (before/
  // during about half, when nothing drifts); the early end and the week more (lib/ai/xpauto) work on top
  it("planted: +1.5 energy on ON days — found in about a third at 16 days, and NAP says ON days were better", () => {
    const found = rate((k) => { const { blocks } = makeBlocks(16, k + 9); const x: Experiment = { id: "b", name: "x", how: "", days: 16, measure: "energy", start: START, blocks };
      const v = judge(x, world(k + 1, 0, 1.5, (d) => !!blockOn(blocks, START, d)?.on), end); return v.state === "better" && (v.nap ?? 0) > 0.6; });
    expect(found).toBeGreaterThan(0.22);
  });
});
