// PLAN 225 — experiments that end themselves. Known answers: the log answers "no drinks", "no caffeine after 14:00" and a
// supplement left out on a logged day, and nothing on a day with nothing logged or for a week's quota. Run whole, on fake
// people whose ratings carry over from day to day: with nothing planted, a verdict ("it helped" / "it made it worse") in
// at most ~1 in 8; with energy +1.5, found far more often than the old fixed 21 days found it, and often days early.
import { describe, expect, it } from "vitest";
import type { DayFacts } from "../insights";
import type { Experiment } from "../store";
import { addDays } from "../time";
import { judge } from "./apply";
import { autoDays, autoRule, flat, plainResult, xpAutoPatches, xpLook } from "./xpauto";

const START = "2026-10-15";
function gauss(seed: number) { let s = seed >>> 0; const u = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; return () => { let x = 0; for (let i = 0; i < 12; i++) x += u(); return x - 6; }; }
const world = (seed: number, phi: number, lift: number, days = 30) => { const g = gauss(seed); let a = g();
  return Array.from({ length: 14 + days }, (_, i) => { a = phi * a + Math.sqrt(1 - phi * phi) * g(); const day = addDays(START, i - 14);
    return { day, energy: Math.max(1, Math.min(10, Math.round(6 + 1.3 * a + (i >= 14 ? lift : 0)))), weekend: [0, 6].includes(new Date(`${day}T12:00`).getDay()) } as unknown as DayFacts; }); };
const all = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [addDays(START, i), true]));
/** One experiment run the way the app runs it: a look each day, a week more once if unclear, its result at the end. */
function run(days: DayFacts[]): { word: string; days: number } {
  let x: Experiment = { id: "x", name: "x", how: "", days: 14, measure: "energy", start: START, did: all };
  for (let d = 1; d <= 30; d++) {
    const today = addDays(START, d), l = xpLook(x, days.filter((f) => f.day < today), today);
    if (l && "early" in l) { x = { ...x, early: l.early, ended: l.early }; return { word: plainResult(judge(x, days, today))!, days: d }; }
    if (l && "extra" in l) { x = { ...x, extra: l.extra }; continue; }
    if (today >= addDays(START, 14 + (x.extra ?? 0))) return { word: plainResult(judge(x, days.filter((f) => f.day < today), today)) ?? "", days: d };
  }
  return { word: "", days: 30 };
}
const tally = (phi: number, lift: number, n = 200) => { const r = Array.from({ length: n }, (_, k) => run(world(k + 1 + phi * 1e4 + lift * 1e5, phi, lift)));
  return { verdict: r.filter((x) => x.word === "it helped" || x.word === "it made it worse").length / n, helped: r.filter((x) => x.word === "it helped").length / n, early: r.filter((x) => x.days < 14).length / n }; };

describe("the log answers the days it can", () => {
  const day = (o: Partial<DayFacts>) => ({ logged: true, alcoholG: 0, caffeineMg: 150, lateCaffeineMg: 0, taken: new Set<string>(), skipped: new Set<string>(), ...o }) as DayFacts;
  it("no drinks, no caffeine after 14:00, no caffeine, a supplement left out", () => {
    expect(autoRule({ name: "No drinks for 7 days", how: "" })!(day({ alcoholG: 14 }))).toBe(false);
    expect(autoRule({ name: "No alcohol for 7 days", how: "" })!(day({}))).toBe(true);
    expect(autoRule({ name: "No caffeine after 14:00", how: "" })!(day({ lateCaffeineMg: 80 }))).toBe(false);
    expect(autoRule({ name: "Caffeine-free week", how: "" })!(day({ caffeineMg: 0 }))).toBe(true);
    const saffron = autoRule({ name: "No saffron for 7 days", how: "" }, [{ id: "s1", name: "Saffron" }])!;
    expect(saffron(day({ taken: new Set(["s1"]) }))).toBe(false);
    expect(saffron(day({ skipped: new Set(["s1"]) }))).toBe(true);
    expect(saffron(day({}))).toBeNull(); // not answered: asked
  });
  it("a day with nothing logged is asked; a week's quota or something the log can't see isn't answered at all", () => {
    expect(autoRule({ name: "No drinks", how: "" })!(day({ logged: false }))).toBeNull();
    expect(autoRule({ name: "No drinks on 5 nights", how: "no alcohol on 5 nights of the 7" })).toBeNull();
    expect(autoRule({ name: "Phone out of the bedroom", how: "from 22:00" })).toBeNull();
  });
  it("only days from its start to yesterday that you haven't answered yourself", () => {
    const x: Experiment = { id: "x", name: "No drinks", how: "", days: 7, measure: "energy", start: "2026-11-10", did: { "2026-11-11": true } };
    const days = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"].map((d, i) => ({ day: d, logged: true, alcoholG: i === 3 ? 28 : 0 }) as unknown as DayFacts);
    expect(autoDays(x, days, [], "2026-11-13")).toEqual({ "2026-11-10": true, "2026-11-12": false });
    const [p] = xpAutoPatches([x], days, [], "2026-11-13");
    expect(p.patch.did).toEqual({ "2026-11-10": true, "2026-11-11": true, "2026-11-12": false });
    expect(p.patch.auto).toEqual({ "2026-11-10": true, "2026-11-12": false });
  });
});

describe("ending itself", () => {
  it("control: nothing planted, ratings carrying over (0.4, 0.7) — a verdict in at most ~1 in 6 (the old test: 18 % and 37 %)", () => {
    expect(tally(0, 0).verdict).toBeLessThan(0.08);
    expect(tally(0.4, 0).verdict).toBeLessThan(0.14);
    expect(tally(0.7, 0).verdict).toBeLessThan(0.18);
  });
  it("planted: energy +1.5 — 'it helped' in most, a good share already before day 14", () => {
    const t = tally(0, 1.5), t4 = tally(0.4, 1.5);
    expect(t.helped).toBeGreaterThan(0.8); expect(t.early).toBeGreaterThan(0.2);
    expect(t4.helped).toBeGreaterThan(0.55);
  });
  it("plain words: helped, worse, no difference only when the range is tight around nothing, else can't tell", () => {
    expect(plainResult({ state: "better" })).toBe("it helped");
    expect(plainResult({ state: "worse" })).toBe("it made it worse");
    expect(plainResult({ state: "no-clear-change", ci: [-0.3, 0.4] })).toBe("no difference");
    expect(plainResult({ state: "no-clear-change", ci: [-0.6, 1.4] })).toBe("can't tell");
    expect(flat({ ci: [-0.5, 0.5] })).toBe(true);
  });
});
