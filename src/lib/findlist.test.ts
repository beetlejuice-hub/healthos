// One list (PLAN 195): a lead isn't shown again when a Noticed card already says it. Planted: Noticed's "2+ drinks →
// next-day mood" card, and leads alcohol → next-day mood (the same), alcohol → that day's mood (not), gym → next-day
// energy against a gym-that-day card (not), a supplement's, and one Noticed doesn't ask (steps).
import { describe, expect, it } from "vitest";
import { leadGroup, sameAsNoticed } from "./findlist";

const lead = (a: string, b: string, lag: number) => ({ a: { id: a }, b: { id: b }, lag });
const cards = [{ id: "fx-alc-mood", covers: ["fx-alc-2-mood", "fx-alc-drink-mood"] }, { id: "fx-gym-energy" }, { id: "fx-supp-saf-mood" }, { id: "fx-late-caf-sleep" }];

describe("one list: a lead that's already a Noticed card goes", () => {
  it("the same cause, lag and outcome: the same finding", () => {
    expect(sameAsNoticed(lead("alcohol", "mood", 1), cards)).toBe(true);
    expect(sameAsNoticed(lead("supp-saf", "mood", 1), cards)).toBe(true);
    expect(sameAsNoticed(lead("lateCaf", "sleepRating", 1), cards)).toBe(true);
    expect(sameAsNoticed(lead("gym", "energy", 0), cards)).toBe(true);
  });
  it("controls: another lag, another outcome, or a question Noticed doesn't ask — kept", () => {
    expect(sameAsNoticed(lead("alcohol", "mood", 0), cards)).toBe(false);
    expect(sameAsNoticed(lead("gym", "energy", 1), cards)).toBe(false);
    expect(sameAsNoticed(lead("alcohol", "focus", 1), cards)).toBe(false);
    expect(sameAsNoticed(lead("steps", "mood", 0), cards)).toBe(false);
    expect(sameAsNoticed(lead("alcohol", "mood", 1), [])).toBe(false);
    expect(leadGroup(lead("asleep", "mood", 1))).toBeNull();
  });
});
