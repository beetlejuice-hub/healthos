import { describe, expect, it } from "vitest";
import { checkSet, checkWeight } from "./sanity";

// Owner, 20 Oct: "things like i lifted 315 kg per hand - possible misstype from 31,5" (#137) — "do these" (#145)
const past = (kg: number, n = 6, reps = 10) => Array.from({ length: n }, (_, i) => ({ kg: kg + (i % 2), reps }));

describe("a set far outside his own history asks once", () => {
  it("315 for 31.5: far above the best, with the fix", () => {
    expect(checkSet(315, 10, past(30))).toEqual({ msg: "315 kg — far above your best on this (31 kg).", fix: { kg: 31.5, label: "31.5 kg" } });
  });
  it("one dumbbell typed when he logs both: half his usual total → the total", () => {
    expect(checkSet(20, 10, past(40), true)).toEqual({ msg: "20 kg — you log both dumbbells together, usually about 40.5.", fix: { kg: 40, label: "40 kg (both)" } });
    expect(checkSet(20, 10, past(40), false)).toBeNull(); // not a pair: a light set, not asked
  });
  it("a dropped digit: 4 for 40", () => {
    expect(checkSet(4, 10, past(40))).toMatchObject({ fix: { kg: 40 } });
  });
  it("reps: 80 for 8", () => {
    expect(checkSet(60, 80, past(60, 6, 8))).toEqual({ msg: "80 reps — far more than usual (8).", fix: { reps: 8, label: "8 reps" } });
  });
  it("real sets aren't questioned: a new best +10 %, a lighter week −20 %, a deload to half isn't a typo either way unless it fits one", () => {
    expect(checkSet(34, 8, past(30))).toBeNull();
    expect(checkSet(24, 10, past(30))).toBeNull();
    expect(checkSet(15, 10, past(30))).toBeNull(); // half, not a pair, no digit fits: kept without asking
  });
  it("too little history to judge: only the impossible is asked", () => {
    expect(checkSet(315, 10, past(30, 2))).toBeNull();
    expect(checkSet(450, 5, [])).toEqual({ msg: "450 kg is more than anyone's set." });
  });
});

describe("a weigh-in far from the last one", () => {
  it("8.46 for 84.6, 846 for 84.6 → asked, with the decimal moved", () => {
    expect(checkWeight(8.46, 84.6)).toEqual({ msg: "8.46 kg — down 90 % from your last weigh-in (84.6 kg).", fix: { kg: 84.6, label: "84.6 kg" } });
    expect(checkWeight(846, 84.6)?.fix?.kg).toBe(84.6);
  });
  it("a normal day, or the first weigh-in: nothing asked", () => {
    expect(checkWeight(85.4, 84.6)).toBeNull();
    expect(checkWeight(80, null)).toBeNull();
  });
  it("a real big change (10 %+) is asked without a fix — his to keep", () => {
    expect(checkWeight(70, 84.6)).toEqual({ msg: "70 kg — down 17 % from your last weigh-in (84.6 kg)." });
  });
});
