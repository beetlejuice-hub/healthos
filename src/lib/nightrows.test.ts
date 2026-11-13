import { describe, expect, it } from "vitest";
import { bestBedtime, nightRows } from "./nightrows";
import type { Night } from "./sleep";

// Sleep A (owner, 13 Nov: "A A A"): last night against your usual, and your best nights' bedtime.
const night = (i: number, o: Partial<Night> = {}): Night => {
  const bed = new Date(`2026-10-${String(10 + i).padStart(2, "0")}T23:15:00`).getTime();
  return { id: `n${i}`, day: "", eve: "", bed, up: bed + 8 * 3600e3, onset: bed + 20 * 60e3, wake: bed + 7.8 * 3600e3, asleep: 430 + (i % 3) * 5, deep: 80 + (i % 4) * 3, rem: 95 + (i % 3) * 4,
    light: 240, awake: 20 + (i % 3) * 2, wakes: 2, latency: 18 + (i % 3), stages: [], low: 51 + (i % 2), lowAt: null, hrv: null, rhr: null, nap: null, ...o };
};

describe("last night against your usual", () => {
  const usual = Array.from({ length: 14 }, (_, i) => night(i));
  it("a long deep night with a low heart rate: better; the rest your usual", () => {
    const last = night(20, { deep: 110, low: 47 });
    const rows = nightRows(last, [...usual, last])!;
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.deep).toMatchObject({ value: "1 h 50", usual: "1 h 23", delta: "+27 min", tone: "better" });
    expect(by.low).toMatchObject({ value: "47 bpm", delta: "−4", tone: "better" });
    expect(by.asleep).toMatchObject({ delta: null, tone: "same" });
    expect(by.bed).toMatchObject({ value: "23:15", tone: "same" });
  });
  it("worse is worse: long to fall asleep, awake a lot; a late bedtime is only later", () => {
    const last = night(20, { latency: 55, awake: 70, bed: new Date("2026-10-30T00:40:00").getTime() });
    const by = Object.fromEntries(nightRows(last, [...usual, last])!.map((r) => [r.key, r]));
    expect(by.latency).toMatchObject({ delta: "+36 min", tone: "worse" });
    expect(by.awake.tone).toBe("worse");
    expect(by.bed).toMatchObject({ value: "00:40", delta: "1 h 25 later", tone: "same" });
  });
  it("no deep sleep that night (no stages): that row left out; too few nights: null", () => {
    const last = night(20, { deep: null });
    expect(nightRows(last, [...usual, last])!.some((r) => r.key === "deep")).toBe(false);
    expect(nightRows(last, [usual[0], last])).toBeNull();
  });
});

describe("your best nights' bedtime", () => {
  it("the latest bedtime among the top quarter, up to the quarter hour", () => {
    const ns = Array.from({ length: 12 }, (_, i) => night(i, { bed: new Date(`2026-10-${10 + i}T${i < 4 ? "23:05" : "00:30"}:00`).getTime() + (i >= 4 ? 86_400_000 : 0) }));
    const scores = ns.map((_, i) => (i < 4 ? 90 - i : 70));
    expect(bestBedtime(ns, scores)).toBe("23:15");
    expect(bestBedtime(ns.slice(0, 5), scores.slice(0, 5))).toBeNull();
  });
});
