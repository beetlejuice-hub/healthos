import { describe, expect, it } from "vitest";
import { avg7, currentKg, drinkWeeks, latestWeighIn, nights, tierOfMg } from "./body";
import type { GlanceDay } from "./glance";
import { addDays } from "./time";

const day = (i: number, x: Partial<GlanceDay> = {}): GlanceDay => ({ day: addDays("2026-09-01", i), mood: null, energy: null, focus: null, stress: null, sleep: null, kcal: null, protein: null, cafBed: null, drinks: null, weight: null, trained: false, lateCaffeine: false, note: false, checkins: 0, ...x });

describe("avg7", () => {
  it("averages the last 7 days' weigh-ins, once there are 3", () => {
    const d = [80, null, 81, null, 82, 83, null, null, null, null].map((kg, i) => ({ day: addDays("2026-09-01", i), kcal: null, kg }));
    const a = avg7(d);
    expect(a[0]).toBeNull(); expect(a[3]).toBeNull();
    expect(a[4]).toBe(81); expect(a[5]).toBe(81.5);
    expect(a[9]).toBeNull(); // 3 days left in the window... only 82, 83 → too few
  });
});

describe("nights", () => {
  it("gives each evening the rating given the next morning", () => {
    const ds = [day(0, { lateCaffeine: true, cafBed: 80 }), day(1, { sleep: 5 }), day(2, { sleep: 8 })];
    const n = nights(ds);
    expect(n).toHaveLength(2);
    expect(n[0]).toMatchObject({ day: "2026-09-01", rating: 5, lateCaffeine: true, cafBed: 80 });
    expect(n[1].rating).toBe(8);
  });
});

describe("drinkWeeks", () => {
  it("totals each 7-day block ending on the last day, and says 'not enough' instead of 0", () => {
    const ds = Array.from({ length: 14 }, (_, i) => day(i, { drinks: i < 7 ? (i < 2 ? null : 0) : i === 12 ? 3 : 0 }));
    const w = drinkWeeks(ds, 2);
    expect(w.map((x) => x.start)).toEqual(["2026-09-01", "2026-09-08"]);
    expect(w[0]).toMatchObject({ drinks: 0, loggedDays: 5 });
    expect(w[1]).toMatchObject({ drinks: 3, loggedDays: 7 });
    const thin = drinkWeeks(ds.map((d, i) => (i >= 7 && i < 11 ? { ...d, drinks: null } : d)), 1);
    expect(thin[0].drinks).toBeNull();
  });
});

describe("tierOfMg", () => {
  it("uses the app's 30 / 100 mg tiers", () => {
    expect(tierOfMg(29)).toBe("low"); expect(tierOfMg(30)).toBe("possible"); expect(tierOfMg(100)).toBe("higher");
  });
});

import { coverage } from "./body";
describe("coverage", () => {
  it("fills each day by how fully it was logged", () => {
    const c = coverage([day(0, { checkins: 1, kcal: 2000 }), day(1, { checkins: 3, sleep: 7, drinks: 0, stackAnswered: true }), day(2, { checkins: 5, trained: true })]);
    const row = (n: string) => c.find((r) => r.name === n)!;
    expect(row("Check-ins").fill.map((v) => +v.toFixed(2))).toEqual([0.33, 1, 1]);
    expect(row("Food").days).toBe(1);
    expect(row("Drinks & coffee").fill).toEqual([0, 1, 0]); // 0 drinks logged still counts as logged
    expect(row("Supplements").days).toBe(1);
    expect(row("Workouts").fill).toEqual([0, 0, 1]);
  });
});

describe("your weight now (PLAN 73)", () => {
  const D = 86_400_000, now = Date.UTC(2026, 9, 13, 9);
  const w = (daysAgo: number, kg: number) => ({ id: `w${daysAgo}`, kind: "weight" as const, at: now - daysAgo * D, kg });
  it("the latest weigh-in in the last 60 days; Settings' number only before the first", () => {
    expect(latestWeighIn([w(3, 79.1), w(0.1, 78.4), w(10, 80)], now)).toEqual({ kg: 78.4, at: now - 0.1 * D });
    expect(currentKg([w(3, 79.1)], 70, now)).toBe(79.1);
    expect(currentKg([w(61, 79.1)], 70, now)).toBe(70);
    expect(currentKg([{ ...w(0, 81), at: now + D }], 70, now)).toBe(70); // not one dated tomorrow
    expect(currentKg([], 70, now)).toBe(70);
  });
});
