import { describe, expect, it } from "vitest";
import { NIGHT_TAGS, nightLabel, nightTagOrder, phoneLabel, tagFactors, tagNights, tagsComing } from "./lastnight";
import type { Evening, Night } from "./sleep";
import { thisMorning, type MindFactor } from "./mind";
import { DAY } from "./time";
import type { Entry } from "./types";

const ev = (tags: string[] | null): Evening => ({ drinks: [], caffeineAtBed: 0, trained: false, ateLate: false, rating: null, tags });
const night = {} as Night;

describe("last-night tags (PLAN 90)", () => {
  it("the built-in chips stay in place; your own words follow, most used first, from the last 60 days", () => {
    const now = Date.UTC(2026, 9, 13, 8), s = (daysAgo: number, tags: string[]): Entry => ({ id: `${daysAgo}${tags}`, kind: "sleep", at: now - daysAgo * DAY, tags });
    const order = nightTagOrder([s(1, ["sauna", "gf"]), s(2, ["argument"]), s(3, ["argument"]), s(70, ["gaming"]), s(4, ["worklate"])], now);
    expect(order).toEqual([...NIGHT_TAGS.map((t) => t.tag), "argument", "sauna"]);
    expect(order.map(nightLabel).slice(0, 3)).toEqual(["with gf", "worked late", "out with friends"]);
    // "scrolled in bed" became the phone question (PLAN 88); old mornings still read
    expect(nightLabel("scrolled")).toBe("scrolled in bed");
    expect([0, 15, 30, 45, 60].map(phoneLabel)).toEqual(["no phone", "phone ~15 min", "phone ~30 min", "phone ~45 min", "phone 1 h+"]);
  });
  it("a tag gets a grid row at 5 nights; under that it's 'coming', with its count; unasked nights don't count", () => {
    const evs = [...Array(5)].map(() => ev(["gf"])).concat([ev(["out"]), ev(["out"]), ev([]), ev(null), ev(null)]);
    expect(tagNights(evs)).toEqual(new Map([["gf", 5], ["out", 2]]));
    const rows = tagFactors(evs);
    expect(rows.map((f) => [f.id, f.name])).toEqual([["tag:gf", "With gf"]]);
    expect(tagsComing(evs)).toEqual([{ tag: "out", n: 2 }]);
    // with / without / unknown
    expect([ev(["gf"]), ev([]), ev(null)].map((e) => [rows[0].has(night, e), rows[0].known!(night, e)])).toEqual([[true, true], [false, true], [false, false]]);
  });
  it("this morning's line on the Mind page can name a tag (it's known by the morning)", () => {
    const f: MindFactor = { ...tagFactors([...Array(5)].map(() => ev(["out"])))[0], when: "last night" };
    const cell = { factor: "tag:out", outcome: "mood", nWith: 6, nWithout: 12, diff: -1.4, p: 0.001, sure: "clear" as const, toward: "worse" as const };
    expect(thisMorning(night, ev(["out"]), [f], [cell]).map((l) => l.factor.name)).toEqual(["Out with friends"]);
    expect(thisMorning(night, ev([]), [f], [cell])).toEqual([]);
  });
});
