import { describe, expect, it } from "vitest";
import { readiness, readyWord } from "./readiness";
import { rng } from "./bench";
import { atMinute, localDay } from "./time";
import type { Night } from "./sleep";

const H = 3_600_000, MIN = 60_000, D = 86_400_000;
const dayOf = (k: number) => localDay(new Date(2026, 8, 1 + k, 12).getTime()); // morning k (Sept 1 + k)
/**
 * 35 mornings: HRV around 50 ms (±10 % on the log scale), resting HR 54 ± 1, ~7 h 40 asleep from 23:30, rated 8; training
 * Mon / Wed / Fri, 18 working sets at 18:00. `o(k)` changes morning k's night.
 */
function world(seed: number, o: (k: number, n: Night) => Partial<Night> = () => ({})) {
  const { g } = rng(seed), ns: Night[] = [], sets: { at: number; warmup?: boolean }[] = [];
  for (let k = 0; k < 35; k++) {
    const day = dayOf(k), eve = dayOf(k - 1), bed = atMinute(eve, 23 * 60 + 30 + Math.round(g() * 10)), asleep = 460 + g() * 15;
    const n: Night = { id: `n${k}`, day, eve, bed, onset: bed + 12 * MIN, wake: bed + (asleep + 22) * MIN, up: bed + (asleep + 30) * MIN, asleep, deep: asleep * 0.15, rem: asleep * 0.22, light: asleep * 0.6,
      awake: 10, wakes: 1, latency: 12, stages: [], low: 50, lowAt: bed + 4 * H, hrv: Math.exp(Math.log(50) + 0.1 * g()), rhr: 54 + g(), nap: null };
    ns.push({ ...n, ...o(k, n) });
    const dow = new Date(atMinute(day, 0)).getDay();
    if (dow === 1 || dow === 3 || dow === 5) for (let i = 0; i < 18; i++) sets.push({ at: atMinute(day, 18 * 60 + i * 3) });
  }
  return { ns, sets };
}
const at9 = (k: number) => atMinute(dayOf(k), 9 * 60);
/** The band's daily HRV and resting HR (all days, as the server sends them), from the nights. */
const daily = (ns: Night[]) => ({ hrv: Object.fromEntries(ns.filter((n) => n.hrv != null).map((n) => [n.day, n.hrv!])), rhr: Object.fromEntries(ns.filter((n) => n.rhr != null).map((n) => [n.day, n.rhr!])) });
const R = (w: ReturnType<typeof world>, k = 34, rating: number | null = 8, sets = w.sets) => readiness(dayOf(k), w.ns, rating, sets.filter((s) => s.at <= at9(k)), at9(k), daily(w.ns))!;
const part = (r: ReturnType<typeof R>, id: string) => r.parts.find((p) => p.id === id);

describe("readiness out of 100 (owner, 14 Oct)", () => {
  it("an ordinary morning: every part known, \"ready\" or \"good\"; the parts add to 100", () => {
    const r = R(world(3));
    expect(r.left).toEqual([]); expect(r.parts.map((p) => p.max).reduce((a, b) => a + b, 0)).toBe(100);
    expect(r.score).toBeGreaterThanOrEqual(75); expect(["ready", "good"]).toContain(r.word);
  });
  it("no false alarms: across an ordinary month, at most 2 of 20 mornings under 70", () => {
    let low = 0;
    for (let s = 1; s <= 20; s++) if (R(world(s)).score < 70) low++;
    expect(low).toBeLessThanOrEqual(2);
  });
  it("planted: HRV this morning 30 % under usual → its 20 gone, and readiness ≥ 15 lower", () => {
    const base = R(world(3)), w = world(3, (k) => (k === 34 ? { hrv: 35 } : {})), r = R(w);
    expect(part(r, "hrv")!.got).toBe(0); expect(part(r, "hrv")!.why).toMatch(/^35 ms · usual (4\d|5\d)$/);
    expect(base.score - r.score).toBeGreaterThanOrEqual(15);
  });
  it("planted: HRV down all week (the trend, as HRV-guided training reads it) → the week's 10 gone", () => {
    const r = R(world(3, (k) => (k >= 29 ? { hrv: 38 } : {})));
    expect(part(r, "hrv7")!.got).toBe(0); expect(part(R(world(3)), "hrv7")!.got).toBeGreaterThanOrEqual(8);
  });
  it("planted: resting HR 4 bpm over usual → its 20 gone; 1 over costs nothing (inside a band's ~2 bpm noise)", () => {
    expect(part(R(world(3, (k) => (k === 34 ? { rhr: 58 } : { rhr: 54 + ((k * 7) % 3) - 1 }))), "rhr")!.got).toBe(0);
    expect(part(R(world(3, (k) => (k === 34 ? { rhr: 55 } : { rhr: 54 + ((k * 7) % 3) - 1 }))), "rhr")!.got).toBe(20);
  });
  it("HRV within its noise (half an SD under usual) costs nothing; 1 SD under a third of its 20", () => {
    // usual exactly 50 with an SD of 0.1 on the log scale: 50 × e^-0.05 ≈ 47.6 is noise, 50 × e^-0.1 ≈ 45.2 is 1 SD
    const flat = world(3, (k) => (k < 34 ? { hrv: Math.exp(Math.log(50) + (k % 2 ? 0.1 : -0.1)) } : {}));
    const at = (v: number) => part(R({ ...flat, ns: flat.ns.map((n, k) => (k === 34 ? { ...n, hrv: v } : n)) }), "hrv")!.got;
    expect(at(47.6)).toBe(20); const one = at(45.2); expect(one).toBeGreaterThan(12.5); expect(one).toBeLessThan(14.5); // the sample SD is 0.102
  });
  it("planted: a week of 5-hour nights → sleep this week's 15 gone, last night low too", () => {
    const r = R(world(3, (k, n) => (k >= 28 ? { asleep: 300, wake: n.onset + 300 * MIN, up: n.onset + 310 * MIN } : {})));
    expect(part(r, "balance")!.got).toBe(0); expect(part(r, "sleep")!.got).toBeLessThan(20);
  });
  it("training: three times your usual sets in 2 days → its 10 gone; a rest stretch full; no history → left out", () => {
    // morning 34 follows a weekend (no sets in its 2 days); a usual 2 days holds one session, 18 sets: plant 54
    const w = world(3), extra = Array.from({ length: 54 }, (_, i) => ({ at: at9(34) - 20 * H + i * MIN }));
    const heavy = R(w, 34, 8, [...w.sets, ...extra]);
    expect(part(heavy, "load")!.why).toBe("54 working sets in 2 days · usual 18"); expect(part(heavy, "load")!.got).toBe(0);
    expect(part(R(w, 34, 8, [...w.sets, ...extra.slice(0, 36)]), "load")!.got).toBe(4); // twice: 0.4 of 10
    expect(part(R(w, 34, 8, w.sets.filter((s) => s.at < at9(34) - 3 * D)), "load")!.got).toBe(10);
    expect(R(w, 34, 8, []).left.map((l) => l.id)).toEqual(["load"]);
    expect(R(w, 34, 8, [...w.sets, ...extra.map((s) => ({ ...s, warmup: true }))]).parts.find((p) => p.id === "load")!.got).toBe(part(R(w), "load")!.got); // warm-ups don't count
  });
  it("Today holds a week of nights: the heart parts still come from the band's daily HRV and resting HR (found in the e2e)", () => {
    const w = world(3), week = w.ns.slice(-7);
    const r = readiness(dayOf(34), week, 8, w.sets.filter((s) => s.at <= at9(34)), at9(34), daily(w.ns))!;
    expect(r.left).toEqual([]);
    for (const id of ["hrv", "hrv7", "rhr"]) expect([part(r, id)!.got, part(r, id)!.why]).toEqual([part(R(w), id)!.got, part(R(w), id)!.why]);
  });
  it("too few mornings for a usual (under 10): the heart parts left out and named, not guessed", () => {
    const w = world(3), short = w.ns.slice(-6);
    const r = readiness(dayOf(34), short, 8, w.sets.filter((s) => s.at <= at9(34)), at9(34), daily(short))!;
    expect(r.left.map((l) => l.id)).toEqual(["hrv", "hrv7", "rhr"]); expect(r.score).toBeGreaterThan(0);
  });
  it("no night from the band for today: nothing, not a made-up number", () => {
    const w = world(3);
    expect(readiness(dayOf(40), w.ns, 8, w.sets, at9(40), daily(w.ns))).toBeNull();
  });
  it("monotonic: a higher HRV never lowers it, a higher resting HR never raises it", () => {
    const w = world(5), hr = (v: number) => R({ ...w, ns: w.ns.map((n, k) => (k === 34 ? { ...n, hrv: v } : n)) }).score, rh = (v: number) => R({ ...w, ns: w.ns.map((n, k) => (k === 34 ? { ...n, rhr: v } : n)) }).score;
    for (let v = 25; v < 90; v += 5) expect(hr(v + 5)).toBeGreaterThanOrEqual(hr(v));
    for (let v = 48; v < 64; v += 1) expect(rh(v + 1)).toBeLessThanOrEqual(rh(v));
  });
  it("the words, as Oura's bands: 85+ ready, 70+ good, 60+ fair, under that take it easier", () => {
    expect([85, 84, 70, 69, 60, 59].map(readyWord)).toEqual(["ready", "good", "good", "fair", "fair", "take it easier"]);
  });
});
