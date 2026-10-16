import { describe, expect, it } from "vitest";
import { readiness, readyWord, shortNightCap } from "./readiness";
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
  it("a bottle of wine (owner, 15 Oct: the Charge 6 said 16, this said 68): HRV 30 % under and resting HR +7 → held at ~25, said why", () => {
    const w = world(3, (k) => (k === 34 ? { hrv: 35, rhr: 61, low: 58 } : {})), r = R(w, 34, 6);
    expect(r.added).toBeGreaterThan(50); // the parts alone: a week of good sleep and easy training made up for it
    expect(r.score).toBeLessThanOrEqual(30); expect(r.word).toBe("take it easier");
    expect(r.cap).toEqual({ to: r.score, why: "HRV and resting heart rate both well off your usual" });
    expect([part(r, "hrv")!.zone, part(r, "rhr")!.zone]).toEqual(["poor", "poor"]);
  });
  it("one of the two well off: held near 65 (\"fair\"), naming it", () => {
    const r = R(world(3, (k) => (k === 34 ? { hrv: 35 } : {})));
    expect(r.score).toBeGreaterThanOrEqual(60); expect(r.score).toBeLessThanOrEqual(66); expect(r.cap!.why).toBe("HRV well under your usual");
    expect(R(world(3, (k) => (k === 34 ? { rhr: 60 } : {}))).cap!.why).toBe("resting heart rate well over your usual");
  });
  it("a poor night with the heart fine (4 h 30, asleep 01:40, rated 3) can't read \"ready\": held under 70, saying so", () => {
    const r = R(world(3, (k, n) => (k === 34 ? { asleep: 270, bed: n.bed + 2 * H, onset: n.onset + 2 * H, deep: 30, rem: 40 } : {})), 34, 3);
    expect(r.added).toBeGreaterThanOrEqual(80);
    // 16 Oct: the hours cap it before the sleep score does — 4 h 30 holds it at 45
    expect(r.score).toBeLessThan(50); expect(r.cap!.why).toMatch(/^4 h 30 asleep — a short night/); expect(part(r, "sleep")!.zone).toBe("poor");
  });
  it("an ordinary morning isn't capped, and its parts read ideal", () => {
    const r = R(world(3));
    expect(r.cap).toBeNull(); expect(r.score).toBe(r.added); expect(r.parts.filter((p) => p.zone !== "ideal").length).toBeLessThanOrEqual(1);
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

describe("a short night can't read good, however calm the heart (owner, 16 Oct: \"readiness is so high every day even when wrecked sleep\")", () => {
  const five = (k: number, n: Night): Partial<Night> => (k === 34 ? { asleep: 300, bed: n.bed + 2 * H, onset: n.bed + 2 * H + 15 * MIN, wake: n.bed + 2 * H + 320 * MIN, up: n.bed + 2 * H + 330 * MIN, deep: 40, rem: 55, light: 205 } : {});
  it("5 h from 01:30, the heart as usual: was 79 \"good\" (84 not rated); now held at 55, saying why", () => {
    for (const rating of [4, null]) {
      const r = R(world(3, five), 34, rating);
      expect(r.added).toBeGreaterThanOrEqual(85); // the parts alone still add up high: the heart was calm
      expect(r.score).toBe(55); expect(r.word).toBe("take it easier");
      expect(r.cap!.why).toBe("5 h 00 asleep — a short night costs focus and mood however calm the heart is");
    }
  });
  it("three weeks of 5 h 30, so the heart's usual is short nights too: held at 65, not 78", () => {
    const chronic = (k: number): Partial<Night> => (k >= 14 ? { asleep: 330, deep: 45, rem: 60, light: 225, hrv: 44, rhr: 57 } : {});
    expect(R(world(3, (k) => chronic(k)), 34, 5).score).toBe(65);
  });
  it("the cap by hours: 7 h+ none, 6 h 75, 5 h 55, 4 h 35, 3 h 20, in between on a line", () => {
    expect([480, 420, 390, 360, 330, 300, 240, 180, 120].map((m) => Math.round(shortNightCap(m)))).toEqual([100, 100, 88, 75, 65, 55, 35, 20, 10]);
  });
  it("6 h 50 isn't a wrecked night: an ordinary heart still reads good", () => {
    const r = R(world(3, (k, n) => (k === 34 ? { asleep: 410, deep: n.deep, rem: n.rem } : {})), 34, 7);
    expect(r.score).toBeGreaterThanOrEqual(80);
  });
});
