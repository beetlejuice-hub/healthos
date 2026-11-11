// PLAN 210 — body watch. A planted band: 150 mornings of ordinary noise; three earlier episodes (resting heart rate +7,
// HRV −25 %, skin +0.7 °C, two mornings each) — two followed by a check-in saying ill, one the morning after a night out —
// and one starting yesterday. Known answers: today alerts, two mornings running, the five signals with three off; the
// track record counts the three past episodes, twice ill, once after a night out. Controls: noise only — no alert and no
// past; one signal off alone — no alert; two off on one morning only — no alert.
import { describe, expect, it } from "vitest";
import { bodyWatch, illDays, type WatchBand } from "./bodywatch";
import type { Entry } from "./types";
import { addDays } from "./time";

const TODAY = "2026-11-11", N = 150;
function rng(seed: number) { let s = seed; return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r: () => number) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

function world(sick: string[] = [], hits: Partial<Record<"rhr" | "hrv" | "skin", number>> = { rhr: 7, hrv: 0.75, skin: 0.7 }) {
  const r = rng(4), b: WatchBand = { rhr: {}, hrv: {}, skin: {}, breath: {}, spo2: {} }, ill = new Set(sick);
  for (let i = N; i >= 0; i--) {
    const d = addDays(TODAY, -i);
    b.rhr![d] = Math.round(55 + gauss(r) * 1.2); b.hrv![d] = Math.round(60 * Math.exp(gauss(r) * 0.08));
    b.skin![d] = 33.8 + gauss(r) * 0.15; b.breath![d] = 14 + gauss(r) * 0.3; b.spo2![d] = 96 + gauss(r) * 0.4;
    if (ill.has(d)) { if (hits.rhr) b.rhr![d] += hits.rhr; if (hits.hrv) b.hrv![d] = Math.round(b.hrv![d] * hits.hrv); if (hits.skin) b.skin![d] += hits.skin; }
  }
  return b;
}
const pair = (d: string) => [d, addDays(d, 1)];
const EPIS = [addDays(TODAY, -100), addDays(TODAY, -70), addDays(TODAY, -40)];
const SICK = [...EPIS.flatMap(pair), addDays(TODAY, -1), TODAY];

describe("body watch (PLAN 210)", () => {
  it("today: three of five off, two mornings running; your track record from three past episodes", () => {
    const ill = new Set([addDays(EPIS[0], 1), addDays(EPIS[1], 2)]), out = new Set([addDays(EPIS[2], -1)]);
    const w = bodyWatch(world(SICK), TODAY, ill, out);
    expect(w.alert).toBe(true);
    expect(w.running).toBe(2);
    expect(w.signals.map((s) => s.id).sort()).toEqual(["breath", "hrv", "rhr", "skin", "spo2"]);
    expect(w.off.map((s) => s.id).sort()).toEqual(["hrv", "rhr", "skin"]);
    expect(w.past.map((e) => e.day)).toEqual(EPIS);
    expect(w.track).toBe("This pattern showed up 3 times before. Twice you logged feeling ill within 2 days; once it came the morning after a night out.");
  });
  it("control: noise only — no alert, nothing in the past", () => {
    const w = bodyWatch(world(), TODAY, new Set(), new Set());
    expect(w.alert).toBe(false); expect(w.past).toEqual([]); expect(w.track).toBeNull();
  });
  it("control: resting heart rate alone off — no alert", () => {
    expect(bodyWatch(world([TODAY, addDays(TODAY, -1)], { rhr: 7 }), TODAY, new Set(), new Set()).alert).toBe(false);
  });
  it("control: two off on one morning only — no alert", () => {
    expect(bodyWatch(world([TODAY], { rhr: 7, hrv: 0.75 }), TODAY, new Set(), new Set()).alert).toBe(false);
  });
  it("two off two mornings running — alert", () => {
    expect(bodyWatch(world([TODAY, addDays(TODAY, -1)], { rhr: 7, hrv: 0.75 }), TODAY, new Set(), new Set()).alert).toBe(true);
  });
  it("feeling ill: the ill body word, or ill / sick / flu in a check-in's note", () => {
    const at = (d: string) => Date.parse(`${d}T12:00:00`), day = (t: number) => new Date(t).toISOString().slice(0, 10);
    const es = [{ id: "a", kind: "feel", at: at("2026-11-01"), body: { sick: 1 } }, { id: "b", kind: "feel", at: at("2026-11-03"), note: "think I have the flu" }, { id: "c", kind: "feel", at: at("2026-11-04"), note: "sick of rain" }] as unknown as Entry[];
    expect([...illDays(es, day)].sort()).toEqual(["2026-11-01", "2026-11-03"]);
  });
});
