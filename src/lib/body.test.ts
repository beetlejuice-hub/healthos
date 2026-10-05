import { describe, expect, it } from "vitest";
import { avg7, drinkWeeks, nights, tierOfMg } from "./body";
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
