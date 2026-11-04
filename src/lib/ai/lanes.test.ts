// The fields the app picks at random (PLAN 194; owner, 4 Nov: "make research, protocols, studies fun and different,
// sometimes random ones"): every field once a round, a new order each round, never the same two days running.
import { describe, expect, it } from "vitest";
import { LANES, laneOn, pickFor } from "./lanes";
import { addDays } from "../time";

const days = (n: number, from = "2026-11-01") => Array.from({ length: n }, (_, k) => addDays(from, k));

describe("random fields", () => {
  it("never the same two days running, across rounds too", () => {
    const picks = days(400).map((d) => laneOn(d, "study").id);
    for (let k = 1; k < picks.length; k++) expect(picks[k]).not.toBe(picks[k - 1]);
  });
  it("every field once a round; the order changes from round to round", () => {
    const n = LANES.length, all = days(4 * n).map((d) => laneOn(d, "study").id);
    // a round starts where the day number is a multiple of n: find one, then look at it and the next
    const start = days(n).findIndex((d) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5) % n === 0);
    const r1 = all.slice(start, start + n), r2 = all.slice(start + n, start + 2 * n);
    expect(new Set(r1).size).toBe(n);
    expect(new Set(r2).size).toBe(n);
    expect(r1.join()).not.toBe(r2.join());
  });
  it("lists keep apart: the study and research don't walk in step; the same day picks the same", () => {
    const a = days(30).map((d) => laneOn(d, "study").id), b = days(30).map((d) => laneOn(d, "research").id);
    expect(a.filter((x, i) => x === b[i]).length).toBeLessThan(5);
    expect(laneOn("2026-11-04", "study")).toBe(laneOn("2026-11-04", "study"));
    expect(pickFor(["x"], "2026-11-04", "t")).toBe("x");
  });
});
