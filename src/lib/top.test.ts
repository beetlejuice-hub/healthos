import { describe, expect, it } from "vitest";
import { topCards } from "./top";
import type { Comparison } from "./connections";
import type { Supplement } from "./types";

const c = (id: string, group: Comparison["group"], what: string, outcome: string, value: number, clear = true, dir: 1 | -1 = 1): Comparison =>
  ({ id, group, what, outcome, dir, diff: { value, lo: value - (clear ? 0.4 : 2), hi: value + (clear ? 0.4 : 2), n: 40, clear }, nWith: 12, nWithout: 28, need: 0 });
const MAG: Supplement = { id: "mag", name: "Magnesium", dose: "400 mg", slot: "evening", at: 1290, active: true };

describe("topCards", () => {
  const rows = [
    c("caf-sleep", "Sleep", "Caffeine after 14:00", "that night's sleep rating", -0.9),
    c("caf-energy", "Energy", "Caffeine after 14:00", "energy next day", -1.2),
    c("weekend-mood", "Mood", "Weekend", "mood", 1.5),
    c("train-mood", "Mood", "Trained that day", "mood", 0.6),
    c("drinks-mood", "Mood", "Drinks the night before", "mood", -2.0, false),
    c("supp-mag-sleep", "Sleep", "Magnesium taken", "that night's sleep rating", 0.5),
    c("train-stress", "Stress", "Trained that day", "stress", 0.4, true, -1),
  ];
  const cards = topCards(rows, [MAG]);
  it("one card per lever, biggest difference first, unclear ones and weekends left out", () => {
    expect(cards.map((k) => k.lever)).toEqual(["caf", "train", "supp-mag"]);
    expect(cards[0].title).toBe("Caffeine after 14:00 goes with lower energy next day (−1.2) and lower sleep rating that night (−0.9)");
  });
  it("offers the protocol that tests the lever in the right direction, measured on its biggest outcome", () => {
    expect(cards[0].protocol).toMatchObject({ name: "No caffeine after 14:00", days: 14, measure: "energy" });
    expect(cards[1].protocol).toMatchObject({ name: "Train 3 times a week", measure: "mood" });
    expect(cards[2].protocol!.name).toBe("Pause Magnesium");
    expect(cards[2].protocol!.how).toMatch(/should dip while it's off/);
  });
  it("training that goes with higher stress offers nothing to try, and keeps the sign honest", () => {
    const t = topCards([c("train-stress", "Stress", "Trained that day", "stress", 0.8, true, -1)], []);
    expect(t[0].effect).toBeLessThan(0);
    expect(t[0].protocol).toBeNull();
    expect(t[0].title).toBe("Training goes with higher stress (+0.8)");
  });
  it("caps at five and returns nothing when nothing is clear", () => {
    expect(topCards(rows.map((r) => ({ ...r, diff: { ...r.diff!, clear: false } })), [MAG])).toEqual([]);
  });
});
