// Owner, 3 Nov: "Make sure if i put a custom tag for body saying good or awesome it means in a positive way yk". A body
// tag that says feeling good is a good feeling everywhere it goes: the pattern finder says "you felt awesome" (not "you
// noted awesome", like a complaint), the AI is told it's a good feeling, the chip is marked good. Negated, it isn't.
import { describe, expect, it } from "vitest";
import { feelWorld, rng } from "./bench";
import { bodyGood, bodyKeys, bodyLine, goodWord } from "./bodywords";
import { ownSignal, scout } from "./scout";
import { addDays } from "./time";

describe("a body tag that says feeling good", () => {
  it("good, awesome, strong, feeling fresh, as typed — and a complaint said not felt", () => {
    const keys = (t: string) => bodyKeys(t);
    expect(["good", "Awesome", "strong", "feeling fresh", "energised", "on fire", "not tired", "no headache"].map((t) => keys(t).map(bodyGood))).toEqual([[true], [true], [true], [true], [true], [true], [true], [true]]);
    expect(goodWord("feeling-fresh")).toBe("fresh");
    expect(goodWord("not-tired")).toBe("not tired");
  });
  it("controls: not good, isn't great, not so good, the seven complaints, your other words — not good feelings", () => {
    expect(["not good", "isn't great", "not so good", "never good", "tired", "weak", "knee pain", "cramps", "light-headed"].map((t) => bodyKeys(t).map(bodyGood))).toEqual([[false], [false], [false], [false], [false], [false], [false], [false], [false]]);
  });
  it("said as a feeling in the pattern finder; a complaint stays 'noted'", () => {
    expect(ownSignal("awesome")).toMatchObject({ name: "feeling awesome", yes: "a day you felt awesome", say: "you felt awesome" });
    expect(ownSignal("knee-pain")).toMatchObject({ name: "knee pain", say: "you noted knee pain" });
  });
  it("the AI is told it's a good feeling, beside the complaints", () => {
    expect(bodyLine({ awesome: 2, sore: 1 }, true)).toBe("awesome (a lot, a good feeling), sore (a bit)");
  });
  it("planted: awesome the day after a gym day → found, in words of feeling", () => {
    const f = feelWorld({ seed: 5, days: 90 }), { r } = rng(55);
    f.forEach((d, i) => {
      d.day = addDays("2026-07-29", i);
      if (d.energy == null) { d.felt = null; return; }
      const how: Record<string, number> = {};
      if (r() < (f[i - 1]?.trained ? 0.7 : 0.05)) how.awesome = 1;
      d.felt = Object.keys(how); d.feltHow = how;
    });
    const p = scout(f, []).find((x) => x.b.id === "felt-awesome")!;
    expect(p.text).toMatch(/^On the day after a gym day, you felt awesome more often \(\d+ % of days vs \d+ %\)$/);
  });
});
