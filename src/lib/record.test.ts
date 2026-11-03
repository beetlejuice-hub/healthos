// The record (PLAN 188 phase 3; owner, 3 Nov: "see if it was right or no"): a claim is re-checked on the days since it was
// said, and only those. Planted: energy +1.5 on gym days, only after the day it was said → held; nothing after → not held;
// what came before can't change the answer; new claims take today, kept ones keep their day.
import { describe, expect, it } from "vitest";
import { feelWorld, rng } from "./bench";
import { leadClaim, noticedClaim, patternClaim, recheck, recheckPattern, recheckWords, recordLines, remember, RECORD, type Claim } from "./record";
import type { GlanceDay } from "./glance";
import { addDays } from "./time";
import type { DayFacts } from "./insights";
import type { Finding } from "./findings";
import type { Pattern } from "./scout";

const SAID = addDays("2026-08-01", 60);
const world = (seed: number, after: number, before = 0): DayFacts[] => feelWorld({ seed, days: 120, rateRate: 1 }).map((d, i) => {
  const day = addDays("2026-08-01", i), lift = d.trained && d.energy != null ? (day >= SAID ? after : before) : 0;
  return { ...d, day, energy: d.energy == null ? null : Math.max(1, Math.min(10, d.energy + lift)) };
});
const gym: Claim = { id: "noticed:gym:energy", from: "noticed", text: "On gym days, your energy is 1.5 points higher", said: SAID, x: "gym", y: "energy", lag: 0, sign: 1 };

describe("the record (PLAN 188 phase 3)", () => {
  it("planted after it was said: held; nothing after: not held, and mostly called 'didn't hold'", () => {
    const real = Array.from({ length: 20 }, (_, s) => recheck(gym, world(s + 1, 1.5), [])!.state);
    const none = Array.from({ length: 20 }, (_, s) => recheck(gym, world(s + 1, 0, 1.5), [])!.state);
    expect(real.filter((x) => x === "held").length).toBeGreaterThanOrEqual(17);
    expect(none.filter((x) => x === "held").length).toBeLessThanOrEqual(2);
    expect(none.filter((x) => x === "didn't hold").length).toBeGreaterThanOrEqual(6);
  });
  it("only the days since count: what came before can't change it", () => {
    const a = recheck(gym, world(4, 1.5, 0), [])!, b = recheck(gym, world(4, 1.5, -3), [])!;
    expect(b.b).toBe(a.b);
    expect(b.state).toBe(a.state);
  });
  it("too few new days: checking, with what it needs", () => {
    const early = recheck({ ...gym, said: addDays("2026-08-01", 110) }, world(1, 1.5), [])!;
    expect(early.state).toBe("checking");
    expect(recheckWords({ ...gym, said: addDays("2026-08-01", 110) }, early)).toMatch(/^Said \w{3} \d+ \w{3} · checking it on the days since \(\d+ with, \d+ without — 8 of each before it can say\)$/);
  });
  it("in words: said when, the days since, both averages, the state", () => {
    const r = recheck(gym, world(2, 1.5), [])!;
    expect(recheckWords(gym, r)).toMatch(/^Said Wed 30 Sep · since: \d+ days with, \d+ without — energy \d\.\d vs \d\.\d · held$/);
  });
  it("a claim the app can't ask any more (a supplement gone) says nothing", () => {
    expect(recheck({ ...gym, id: "noticed:supp-x:mood", x: "supp-x", y: "mood" }, world(1, 0), [])).toBeNull();
  });
  it("remember: new claims take today, a kept one keeps its first day; at most RECORD.keep", () => {
    const kept = remember([], [{ ...gym, said: "" }], "2026-10-01");
    expect(kept[0].said).toBe("2026-10-01");
    // a lead first shown before the record began keeps that day; a day not before today becomes today
    expect(remember([], [{ ...gym, said: "2026-09-12" }], "2026-10-01")[0].said).toBe("2026-09-12");
    expect(remember([], [{ ...gym, said: "2026-10-05" }], "2026-10-01")[0].said).toBe("2026-10-01");
    const again = remember(kept, [{ ...gym, said: "x" }, { ...gym, id: "lead:a~b", said: "" }], "2026-10-09");
    expect(again.map((c) => [c.id, c.said])).toEqual([["noticed:gym:energy", "2026-10-01"], ["lead:a~b", "2026-10-09"]]);
    expect(remember(kept, [], "2026-10-09")).toBe(kept);
    const many = Array.from({ length: RECORD.keep + 5 }, (_, i) => ({ ...gym, id: `c${i}`, said: "" }));
    expect(remember([], many, "2026-10-01")).toHaveLength(RECORD.keep);
  });
  it("leads and Noticed findings become claims with their way", () => {
    const p = { id: "alc~feel", a: { id: "alcohol" }, b: { id: "energy" }, lag: 1, sign: -1, text: "After a drinking day, energy tends to be lower" } as unknown as Pattern;
    expect(leadClaim(p, "2026-10-01")).toEqual({ id: "lead:alc~feel", from: "lead", text: p.text, said: "2026-10-01", x: "alcohol", y: "energy", lag: 1, sign: -1 });
    const f = { id: "fx-alc-2-energy", title: "The day after 2+ drinks, your energy is 1.2 points lower", value: "−1.2" } as Finding;
    expect(noticedClaim(f, "2026-10-01")).toMatchObject({ id: "noticed:alc-2:energy", x: "alc-2", y: "energy", sign: -1 });
    expect(noticedClaim({ ...f, id: "weird" }, "2026-10-01")).toBeNull();
    // a card is its cause's group; the question it leads with is the first it covers
    expect(noticedClaim({ ...f, id: "fx-alc-energy", covers: ["fx-alc-drink-energy", "fx-alc-2-energy"] }, "")).toMatchObject({ id: "noticed:alc:energy", x: "alc-drink", y: "energy" });
  });
});

describe("the AI is told the record", () => {
  it("each claim said in the last 120 days, in words, under one heading", () => {
    const today = addDays("2026-08-01", 120), lines = recordLines([gym], world(2, 1.5), [], today);
    expect(lines[0]).toMatch(/^## What the app said, re-checked on the days since/);
    expect(lines[1]).toMatch(/^- "On gym days, your energy is 1\.5 points higher" — Said Wed 30 Sep · since: .* · held$/);
    expect(recordLines([{ ...gym, said: "2026-01-01" }], world(2, 1.5), [], today)).toEqual([]);
  });
});

// PLAN 188: the record for best/worst days too. Planted after it was said: on the days with mood at or under the cut,
// that morning's sleep rating 2 lower → held; nothing planted after → not held; before it was said doesn't count.
describe("the record for best and worst days", () => {
  const glance = (seed: number, after: number, before = 0) => {
    const { r, g } = rng(seed);
    return Array.from({ length: 100 }, (_, i) => {
      const day = addDays("2026-08-01", i), mood = Math.round(6 + g() * 1.5), low = mood <= 5, lift = low ? (day >= SAID ? after : before) : 0;
      return { day, mood, sleep: Math.max(1, Math.min(10, Math.round(7 + g() - lift))), checkins: 1, kcal: 2000, drinks: r() < 0.2 ? 1 : 0 } as unknown as GlanceDay;
    });
  };
  const c: Claim = { id: "pattern:worst:sleep", from: "pattern", text: "Before your lowest days: sleep rating that morning lower", said: SAID, x: "sleep", y: "worst", lag: 0, sign: -1, cut: 5 };
  it("planted after it was said: held; nothing after: not held; before it doesn't count", () => {
    const held = Array.from({ length: 12 }, (_, s) => recheckPattern(c, glance(s + 1, 2))!.state);
    const none = Array.from({ length: 12 }, (_, s) => recheckPattern(c, glance(s + 1, 0, 2))!.state);
    expect(held.filter((x) => x === "held").length).toBeGreaterThanOrEqual(10);
    expect(none.filter((x) => x === "held").length).toBeLessThanOrEqual(1);
  });
  it("in words; too few days: checking; a row as a claim", () => {
    const r = recheckPattern(c, glance(3, 2))!;
    expect(recheckWords(c, r)).toMatch(/^Said Wed 30 Sep · since: \d+ of your lowest days, \d+ others — sleep rating that morning \d\.\d vs \d\.\d · held$/);
    expect(recheckPattern({ ...c, said: addDays("2026-08-01", 97) }, glance(3, 2))!.state).toBe("checking");
    const row = { f: { k: "sleep", name: "Sleep rating that morning" }, diff: { value: -1.6 } } as never;
    expect(patternClaim("worst", row, 5, "")).toMatchObject({ id: "pattern:worst:sleep", from: "pattern", text: "Before your lowest days: sleep rating that morning lower", x: "sleep", y: "worst", sign: -1, cut: 5 });
    expect(recheck(c, [], [])).toBeNull();
  });
});
