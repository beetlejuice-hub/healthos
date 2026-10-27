// PLAN 177, body lab 1 — owner, 27 Oct: coin-flip experiments "like this"; "some supps work when taken all day, for longer".
import { describe, expect, it } from "vitest";
import { COIN, coinDays, coinResult, coinToday, didOn, followEntry, newCoin, presets, type Coin } from "./coin";
import type { Night } from "./sleep";
import { addDays, atMinute } from "./time";
import type { Entry, Supplement } from "./types";

function rng(seed: number) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
const screens = (seed: number): Coin => newCoin(presets([])[1], "c", "2026-10-01", seed);
/** The run's nights, with `plant` added to an outcome on heads days. */
function nightsFor(c: Coin, seed: number, plant: { deep?: number; latency?: number } = {}): Night[] {
  const { g } = rng(seed * 31 + 1);
  return coinDays(c).map(({ day, side }) => {
    const h = side === "heads";
    return { id: day, eve: day, day: addDays(day, 1), deep: 80 + (h ? plant.deep ?? 0 : 0) + g() * 10, latency: Math.max(1, 15 + (h ? plant.latency ?? 0 : 0) + g() * 5), asleep: 450 + g() * 20, hrv: 50 + g() * 4 } as Night;
  });
}
const after = (c: Coin) => addDays(c.start, c.days + 1);
const count = (f: (s: number) => boolean) => Array.from({ length: 20 }, (_, s) => f(s + 1)).filter(Boolean).length;

describe("coin-flips: the coins (PLAN 177)", () => {
  it("21 days: heads and tails within one of each other, the same run every time it's read, another run another order", () => {
    const a = coinDays(screens(5)), h = a.filter((d) => d.side === "heads").length;
    expect(a).toHaveLength(21); expect([10, 11]).toContain(h);
    expect(coinDays(screens(5))).toEqual(a);
    expect(coinDays(screens(6)).map((d) => d.side)).not.toEqual(a.map((d) => d.side));
    expect(a[0].day).toBe("2026-10-01"); expect(a[20].day).toBe("2026-10-21");
  });
  it("no day of the run leans to one side (across 400 runs, each day heads 40–60 %)", () => {
    const heads = new Array(21).fill(0);
    for (let s = 1; s <= 400; s++) coinDays(screens(s)).forEach((d, i) => { if (d.side === "heads") heads[i]++; });
    expect(Math.min(...heads)).toBeGreaterThanOrEqual(160); expect(Math.max(...heads)).toBeLessThanOrEqual(240);
  });
});

describe("coin-flips: what you did", () => {
  const coffee = newCoin(presets([])[0], "k", "2026-10-01", 3), day = "2026-10-02";
  const cup = (min: number) => ({ id: `c${min}`, kind: "drink", at: atMinute(day, min), name: "Coffee", ml: 200, caffeineMg: 80, alcoholG: 0, kcal: 5 }) as Entry;
  it("coffee, from the log: none after 13:00 is heads; one at 14:30 is tails; one at 17:00 is neither", () => {
    expect(didOn(coffee, day, [cup(9 * 60)]).side).toBe("heads");
    expect(didOn(coffee, day, [cup(9 * 60), cup(14 * 60 + 30)]).side).toBe("tails");
    expect(didOn(coffee, day, [cup(17 * 60)]).side).toBe("other");
  });
  it("a supplement, from its ticks: taken is heads, skipped or not logged is tails; Followed logs it that evening", () => {
    const mg = { id: "mg", name: "Magnesium", dose: "400 mg", slot: "evening", at: 21 * 60 + 30, active: true } as Supplement;
    const c = newCoin(presets([mg])[2], "m", "2026-10-01", 3);
    expect(c.name).toBe("Magnesium at night");
    const tick = (status: "taken" | "skipped") => ({ id: "t", kind: "supp", at: atMinute(day, 21 * 60), suppId: "mg", status, slot: "evening" }) as Entry;
    expect([didOn(c, day, [tick("taken")]).side, didOn(c, day, [tick("skipped")]).side, didOn(c, day, []).side]).toEqual(["heads", "tails", "tails"]);
    expect(followEntry(c, day, "tails")).toEqual({ kind: "supp", at: atMinute(day, 21 * 60 + 30), suppId: "mg", status: "skipped", slot: "evening" });
    expect(followEntry(screens(1), day, "heads")).toBeNull();
  });
  it("a supplement ticked after midnight (00:30) is the evening before's, not the new day's", () => {
    const mg = { id: "mg", name: "Magnesium", dose: "400 mg", slot: "evening", at: 21 * 60 + 30, active: true } as Supplement;
    const c = newCoin(presets([mg])[2], "m", "2026-10-01", 3), late = { id: "t", kind: "supp", at: atMinute(addDays(day, 1), 30), suppId: "mg", status: "taken", slot: "evening" } as Entry;
    expect([didOn(c, day, [late]).side, didOn(c, addDays(day, 1), [late]).side]).toEqual(["heads", "tails"]);
    expect(coinToday(atMinute(addDays(day, 1), 30))).toBe(day);
    expect(coinToday(atMinute(addDays(day, 1), 4 * 60))).toBe(addDays(day, 1));
  });
  it("screens: your answer; not answered counts as following the coin — and is counted as such", () => {
    const c = { ...screens(9), did: { "2026-10-02": "tails" as const } };
    expect(didOn(c, "2026-10-02", [])).toEqual({ side: "tails", how: "said" });
    expect(didOn(c, "2026-10-03", []).how).toBe("assumed");
  });
});

describe("coin-flips: the result", () => {
  it("sealed until the run is over: no numbers mid-way, only how many days are in", () => {
    const c = screens(4), r = coinResult(c, nightsFor(c, 4, { latency: -8 }), [], "2026-10-12");
    expect([r.rows.length, r.verdict, r.done]).toEqual([0, null, false]);
    expect(r.counted).toBe(11);
  });
  it("planted: screens off → 8 min faster to fall asleep — found, the right way (less is better), in 17+ of 20 runs", () => {
    const c = screens(2), r = coinResult(c, nightsFor(c, 2, { latency: -8 }), [], after(c));
    expect(r.done).toBe(true); expect(r.counted).toBe(21);
    expect(r.rows[0].id).toBe("latency"); expect(r.rows[0].diff!).toBeLessThan(-4);
    expect(r.verdict).toBe("better");
    expect(count((s) => { const x = screens(s); return coinResult(x, nightsFor(x, s, { latency: -8 }), [], after(x)).verdict === "better"; })).toBeGreaterThanOrEqual(17);
  });
  it("planted the wrong way: heads 8 min slower — 'worse', not 'better'", () => {
    const c = screens(3);
    expect(coinResult(c, nightsFor(c, 3, { latency: 8 }), [], after(c)).verdict).toBe("worse");
  });
  it("control: nothing planted — a claim (better or worse) in at most 2 of 20 runs", () => {
    expect(count((s) => { const x = screens(s); const v = coinResult(x, nightsFor(x, s), [], after(x)).verdict; return v === "better" || v === "worse"; })).toBeLessThanOrEqual(2);
  });
  it("days the coin wasn't followed are left out and counted; ended early with too few days — no verdict", () => {
    const c = screens(8), ds = coinDays(c), did: Record<string, "heads" | "tails"> = {};
    for (const d of ds.slice(0, 4)) did[d.day] = d.side === "heads" ? "tails" : "heads";
    const r = coinResult({ ...c, did }, nightsFor(c, 8), [], after(c));
    expect([r.broken, r.counted, r.assumed]).toEqual([4, 17, 17]);
    const early = coinResult({ ...c, ended: addDays(c.start, 6) }, nightsFor(c, 8), [], after(c));
    expect(early.done).toBe(true); expect(early.verdict).toBeNull(); expect(early.rows[0].sure).toBe("too few");
  });
  it("energy is the next day's check-ins", () => {
    const c = { ...screens(12), outcomes: ["energy" as const] }, es: Entry[] = [];
    for (const { day, side } of coinDays(c)) es.push({ id: day, kind: "feel", at: atMinute(addDays(day, 1), 10 * 60), energy: side === "heads" ? 8 : 5 } as Entry);
    const r = coinResult(c, [], es, after(c));
    expect(r.rows[0].heads).toBe(8); expect(r.rows[0].tails).toBe(5); expect(r.verdict).toBe("better");
    expect(COIN.days).toBe(21);
  });
});
