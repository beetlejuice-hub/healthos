// PLAN 177, body lab 3 — owner, 27 Oct: dose-response cards "yes", cigarettes "lets do B".
import { describe, expect, it } from "vitest";
import { drinkDose, labNights, lateCaffeine, smokeCompare, smokeMonth, type LabNight } from "./bodylab";
import type { Night } from "./sleep";
import { smokeEntry } from "./smoke";
import { addDays, atMinute } from "./time";
import type { Entry } from "./types";

function rng(seed: number) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
/**
 * 90 nights. Drinks: none on most, 1–5 on a quarter; cigarettes answered on most days, more often on drinking nights
 * (`together`); caffeine after 14:00 on about half. Planted (each only when asked): per drink sleeping HR +2.5 and HRV −5;
 * smoking on a dry day resting HR +4 next morning; per 100 mg after 14:00, 9 min less deep sleep.
 */
function world(seed: number, plant: { drinks?: boolean; smoke?: boolean; caf?: boolean; together?: boolean }): LabNight[] {
  const { r, g } = rng(seed), out: LabNight[] = [];
  for (let i = 0; i < 90; i++) {
    const eve = addDays("2026-07-01", i), drinks = r() < 0.25 ? 1 + Math.floor(r() * 5) : 0;
    const smokes = plant.together ? r() < (drinks >= 2 ? 0.8 : 0.15) : r() < 0.3, cigs = r() < 0.9 ? (smokes ? 4 : 0) : null;
    const lateMg = r() < 0.5 ? Math.round(r() * 250) : 0, d = Math.min(4, drinks);
    const meanHr = 55 + (plant.drinks ? 2.5 * d : 0) + g() * 1.5, hrv = 50 - (plant.drinks ? 5 * d : 0) + g() * 4;
    const rhr = 54 + (plant.drinks ? 1.5 * d : 0) + (plant.smoke && cigs ? 4 : 0) + g() * 1.5;
    const deep = 80 - (plant.caf ? 0.09 * lateMg : 0) + g() * 8;
    out.push({ night: { id: `n${i}`, day: addDays(eve, 1), eve, meanHr, hrv, rhr, deep } as Night, drinks, cigs, lateMg });
  }
  return out;
}
const count = (f: (s: number) => boolean) => Array.from({ length: 20 }, (_, s) => f(s + 1)).filter(Boolean).length;

describe("body lab: dose-response (PLAN 177)", () => {
  it("planted: each drink +2.5 bpm asleep, −5 ms HRV — found, near the size, sure; the columns climb", () => {
    const d = drinkDose(world(7, { drinks: true }));
    expect(d.hr!.fit.slope!).toBeGreaterThan(2); expect(d.hr!.fit.slope!).toBeLessThan(3);
    expect(d.hrv!.fit.slope!).toBeGreaterThan(-6); expect(d.hrv!.fit.slope!).toBeLessThan(-4);
    expect([d.hr!.fit.sure, d.hrv!.fit.sure]).toEqual(["clear", "clear"]);
    const mids = d.hr!.bins.map((b) => b.mid);
    expect(mids[0]).toBeCloseTo(0, 0); expect(mids.at(-1)!).toBeGreaterThan(7);
    expect(d.nights.reduce((a, n) => a + n, 0)).toBe(90);
  });
  it("planted in 20 worlds: found clear in 19+; control (no effect): clear in at most 1, likely-or-clear in at most 3", () => {
    expect(count((s) => drinkDose(world(s, { drinks: true })).hr!.fit.sure === "clear")).toBeGreaterThanOrEqual(19);
    expect(count((s) => drinkDose(world(s, {})).hr!.fit.sure === "clear")).toBeLessThanOrEqual(1);
    expect(count((s) => ["clear", "likely"].includes(drinkDose(world(s, {})).hrv!.fit.sure))).toBeLessThanOrEqual(3);
  });
  it("planted: smoking on a dry day, resting HR +4 next morning — found; HRV untouched — not", () => {
    const c = smokeCompare(world(3, { smoke: true }))!;
    const rhr = c.rows.find((x) => x.id === "rhr")!, hrv = c.rows.find((x) => x.id === "hrv")!;
    expect(rhr.fit.slope!).toBeGreaterThan(3); expect(rhr.fit.slope!).toBeLessThan(5); expect(rhr.fit.sure).toBe("clear");
    expect(rhr.smoked - rhr.not).toBeGreaterThan(3);
    expect(hrv.fit.sure).not.toBe("clear");
    expect(count((s) => smokeCompare(world(s, { smoke: true }))!.rows.find((x) => x.id === "rhr")!.fit.sure === "clear")).toBeGreaterThanOrEqual(19);
  });
  it("control: smoking mostly on drinking nights, the effect only the drinks' — drinking nights left out, cigarettes not blamed", () => {
    expect(count((s) => smokeCompare(world(s, { drinks: true, together: true }))?.rows.some((x) => x.fit.sure === "clear") ?? false)).toBeLessThanOrEqual(1);
    expect(count((s) => smokeCompare(world(s, { drinks: true, together: true })) != null)).toBeGreaterThanOrEqual(15);
    const c = smokeCompare(world(5, { drinks: true, together: true }))!;
    expect(c.drinkNights).toBeGreaterThan(5);
  });
  it("a day not answered is neither a smoking day nor a smoke-free one; too few of either side — nothing", () => {
    const w = world(4, { smoke: true }), c = smokeCompare(w)!;
    expect(c.smoked + c.not + c.drinkNights).toBe(w.filter((l) => l.cigs != null).length);
    expect(smokeCompare(w.map((l) => ({ ...l, cigs: l.cigs ? 4 : null })))).toBeNull(); // no "none" answers
  });
  it("planted: 100 mg after 14:00, 9 min less deep sleep — found near the size; control not", () => {
    const c = lateCaffeine(world(11, { caf: true }))!;
    expect(c.per100!).toBeGreaterThan(-13); expect(c.per100!).toBeLessThan(-5);
    expect(["clear", "likely"]).toContain(c.fit.sure);
    expect(count((s) => lateCaffeine(world(s, {}))!.fit.sure === "clear")).toBeLessThanOrEqual(1);
  });
  it("too few nights, or no drinking nights: no line drawn", () => {
    expect(drinkDose(world(2, { drinks: true }).slice(0, 10)).hr).toBeNull();
    expect(drinkDose(world(2, {}).map((l) => ({ ...l, drinks: 0 }))).hr).toBeNull();
    expect(lateCaffeine(world(2, {}).map((l) => ({ ...l, lateMg: 0 })))).toBeNull();
  });
  it("from the log: drinks noon to bed (not after), cigarettes as answered, caffeine from 14:00", () => {
    const eve = "2026-10-24", day = "2026-10-25", n = { id: "n", day, eve, bed: atMinute(day, 60) } as Night;
    const drink = (at: number, alcoholG: number, caffeineMg = 0) => ({ id: `d${at}`, kind: "drink", at, name: "x", ml: 500, kcal: 100, alcoholG, caffeineMg }) as unknown as Entry;
    const es = [drink(atMinute(eve, 11 * 60), 20), drink(atMinute(eve, 20 * 60), 20), drink(atMinute(eve, 23 * 60), 20), drink(atMinute(day, 2 * 60), 20),
      drink(atMinute(eve, 13 * 60), 0, 80), drink(atMinute(eve, 15 * 60), 0, 80), drink(atMinute(eve, 17 * 60), 0, 60), { id: "s", ...smokeEntry(eve, "1-2") } as Entry];
    expect(labNights([n], es)[0]).toMatchObject({ drinks: 2, cigs: 1.5, lateMg: 140 });
    expect(labNights([n], [])[0]).toMatchObject({ drinks: 0, cigs: null, lateMg: 0 });
  });
});

describe("the month of cigarettes (SmokeB)", () => {
  const ans = (day: string, band: "0" | "1-2" | "3-5" | "6+") => ({ id: day, ...smokeEntry(day, band) }) as Entry;
  it("October: starts on a Thursday, counts smoke-free and smoking days, unanswered stays blank, the future isn't counted", () => {
    const es = ["2026-10-02", "2026-10-03", "2026-10-09", "2026-10-10", "2026-10-16", "2026-10-17", "2026-10-21"].map((d) => ans(d, "3-5"));
    for (const d of ["2026-10-05", "2026-10-06", "2026-10-07"]) es.push(ans(d, "0"));
    const m = smokeMonth(es, "2026-10-27");
    expect(m.lead).toBe(3);
    expect(m.days).toHaveLength(31);
    expect([m.free, m.smoking, m.answered]).toEqual([3, 7, 10]);
    expect(m.days.find((d) => d.day === "2026-10-08")!.band).toBeNull();
    expect(m.days.filter((d) => d.future).map((d) => d.day)).toEqual(["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]);
    expect(m.weekdays).toEqual({ names: "Fri–Sat", n: 6 });
  });
  it("no weekday line when smoking days are spread out or few", () => {
    const spread = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"].map((d) => ans(d, "1-2"));
    expect(smokeMonth(spread, "2026-10-27").weekdays).toBeNull();
    expect(smokeMonth(spread.slice(0, 3), "2026-10-27").weekdays).toBeNull();
  });
});
