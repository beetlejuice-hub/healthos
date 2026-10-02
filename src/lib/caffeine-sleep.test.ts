import { describe, expect, it } from "vitest";
import { bedtimeOn, bedtimeVerdict, CAF_SLEEP, personalSleep, ratedNights, tierOf, tonightsBed, type Night, type Personal } from "./caffeine-sleep";
import { rng } from "./bench";
import { addDays, atMinute } from "./time";
import type { Entry } from "./types";

const H = 3_600_000;
const learning: Personal = { state: "learning", withN: 0, withoutN: 0 };

describe("how much is left, and could it matter (general tiers)", () => {
  it("tiers at the configured cut-points", () => {
    expect([29, 30, 99, 100].map(tierOf)).toEqual(["low", "possible", "possible", "higher"]);
  });

  it("matches the evidence anchors: a coffee 8.8 h before bed ≈ the low line; 400 mg 6 h before ≈ 175 mg, higher", () => {
    const bed = atMinute("2026-10-02", 23 * 60);
    const gardiner = bedtimeVerdict([{ at: bed - 8.8 * H, mg: 107 }], bed, "23:00", 300, learning);
    expect(Math.abs(gardiner.mg - CAF_SLEEP.lowBelowMg)).toBeLessThanOrEqual(3);
    const drake = bedtimeVerdict([{ at: bed - 6 * H, mg: 400 }], bed, "23:00", 300, learning);
    expect(drake.mg).toBeGreaterThan(170);
    expect(drake.tier).toBe("higher");
  });

  it("gives a range from the typical half-life spread, around the estimate", () => {
    const bed = atMinute("2026-10-02", 22 * 60 + 30);
    const v = bedtimeVerdict([{ at: bed - 7.5 * H, mg: 148 }], bed, "22:30", 300, learning);
    expect(v.range[0]).toBeLessThan(v.mg);
    expect(v.range[1]).toBeGreaterThan(v.mg);
    expect(v.body).toMatch(/Likely \d+–\d+ mg/);
  });

  it("says it calmly: quiet when low or merely possible, a calm item when higher, '!' only when your own nights agree", () => {
    const bed = atMinute("2026-10-02", 23 * 60);
    const at = (mg: number, p: Personal) => bedtimeVerdict([{ at: bed - 2 * H, mg: mg / 0.758 }], bed, "23:00", 300, p).prominence;
    const worse: Personal = { state: "worse", withN: 8, withoutN: 8, diff: -1.4, lo: -2.3, hi: -0.5 };
    const none: Personal = { state: "no-difference", withN: 12, withoutN: 12, diff: -0.1, lo: -0.6, hi: 0.4 };
    expect([at(20, learning), at(60, learning), at(150, learning)]).toEqual(["quiet", "quiet", "info"]);
    expect([at(60, worse), at(150, worse)]).toEqual(["info", "notice"]);
    expect(at(150, none)).toBe("quiet");
  });

  it("a bedtime after midnight is the next calendar day", () => {
    expect(new Date(bedtimeOn("2026-10-02", 30)).getDate()).toBe(3);
    expect(new Date(bedtimeOn("2026-10-02", 23 * 60)).getDate()).toBe(2);
    // At 01:00 with a 00:30 bedtime you're past it; at 01:00 with a 02:00 bedtime it's still ahead tonight.
    const oneAm = new Date(2026, 9, 3, 1).getTime();
    expect(tonightsBed(oneAm, 2 * 60)).toBe(new Date(2026, 9, 3, 2).getTime());
  });
});

describe("does it seem to affect your sleep (your own nights)", () => {
  const coffee = (at: number, mg: number): Entry => ({ id: `c${at}`, kind: "drink", at, name: "Coffee", ml: 250, caffeineMg: mg, alcoholG: 0, kcal: 2 });
  const rate = (at: number, rating: number, slow = false): Entry => ({ id: `s${at}`, kind: "sleep", at, rating, slow });

  it("pairs a morning rating with the night before; afternoon ratings and second ratings don't count", () => {
    const d = "2026-10-01", next = addDays(d, 1);
    const es = [coffee(atMinute(d, 19 * 60), 200), rate(atMinute(next, 8 * 60), 4, true), rate(atMinute(next, 9 * 60), 9), rate(atMinute(next, 16 * 60), 9)];
    const n = ratedNights(es, 300, 23 * 60);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ day: d, sleep: 4, slow: true });
    expect(n[0].atBedMg).toBeGreaterThan(100);
  });

  // A fake person: 30 nights, half with a late coffee. `effect` = rating points lost on those nights.
  const world = (seed: number, effect: number, nights = 30): Night[] => {
    const { r, g } = rng(seed);
    return Array.from({ length: nights }, (_, i) => {
      const late = r() < 0.5, atBedMg = late ? 40 + r() * 100 : r() * 25;
      return { day: addDays("2026-08-01", i), atBedMg, sleep: Math.max(1, Math.min(10, Math.round(7 + g() * 1.2 - (late ? effect : 0)))), slow: false };
    });
  };

  it("finds a planted effect (1.5 points worse on 30+ mg nights)", () => {
    const found = Array.from({ length: 40 }, (_, s) => personalSleep(world(s, 1.5)).state).filter((x) => x === "worse").length;
    expect(found).toBeGreaterThanOrEqual(34); // ≥85% of fake people
  });

  it("doesn't find an effect that isn't there, and can say 'no real difference' with enough nights", () => {
    const states = Array.from({ length: 200 }, (_, s) => personalSleep(world(1000 + s, 0, 40)).state);
    expect(states.filter((x) => x === "worse").length / 200).toBeLessThanOrEqual(0.06); // ~2.5% expected
    expect(states.filter((x) => x === "no-difference").length / 200).toBeGreaterThan(0.5);
  });

  it("stays quiet about you until there are enough nights of each kind", () => {
    const p = personalSleep(world(7, 3, 30).slice(0, 8));
    expect(p.state).toBe("learning");
  });
});
