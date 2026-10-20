import { describe, expect, it } from "vitest";
import { checkList, mergeChecks } from "./overall";
import { checkReview, SYSTEM } from "./ai/tasks";
import type { Finding } from "./findings";
import type { Pattern } from "./scout";

// Owner, 20 Oct: "from time to time the app should do an overall check … catch things like findings that are irrelevant,
// nonsense, or its just simply clear that they are not affecting eachother - and just name these, not delete" (PLAN 137)
const f = (id: string, title: string): Finding => ({ id, area: "caffeine", title, value: "−22", unit: "min", detail: "", evidence: "18 days vs 22, 90% range −35 to −9", sure: "clear", weight: 1 });
const offered = new Map([["n:late-coffee", "Coffee after 2 pm → 22 min less sleep"], ["s:caf|coffee", "More caffeine on coffee days"]]);

describe("the list the month read gets", () => {
  it("each finding on show with an id it can point at, and its evidence", () => {
    const p = { id: "caf|coffee", text: "More caffeine on coffee days", held: 20, of: 21, n: 40, r: 0.97, p: 0.0004 } as unknown as Pattern;
    expect(checkList([f("late-coffee", "Coffee after 2 pm → 22 min less sleep")], [p])).toEqual([
      "- [n:late-coffee] Coffee after 2 pm → 22 min less sleep — −22 min; 18 days vs 22, 90% range −35 to −9 (clear)",
      "- [s:caf|coffee] More caffeine on coffee days — held on 20 of 21; 40 days, correlation 0.97, p < 0.001",
    ]);
  });
});

describe("what it named", () => {
  it("kept only for findings it was sent; a made-up id or verdict is dropped; titles kept for the hidden list", () => {
    const c = mergeChecks([], [{ id: "s:caf|coffee", verdict: "obvious", why: "coffee is caffeine" }, { id: "n:invented", verdict: "noise", why: "x" }, { id: "n:late-coffee", verdict: "wrong", why: "y" }], offered, 1);
    expect(c).toEqual([{ id: "s:caf|coffee", verdict: "obvious", why: "coffee is caffeine", at: 1, title: "More caffeine on coffee days" }]);
  });
  it("his answers stay: hidden stays hidden, kept isn't asked about again; the rest take the new month's word", () => {
    const prev = [{ id: "n:late-coffee", verdict: "noise" as const, why: "old", at: 1, hidden: true as const }, { id: "s:caf|coffee", verdict: "obvious" as const, why: "old", at: 1 }];
    const c = mergeChecks(prev, [{ id: "n:late-coffee", verdict: "obvious", why: "new" }], offered, 2);
    expect(c).toEqual([{ id: "n:late-coffee", verdict: "noise", why: "old", at: 1, hidden: true }]);
  });
  it("at most 5, one each", () => {
    const many = new Map(Array.from({ length: 8 }, (_, i) => [`n:f${i}`, `F${i}`]));
    const c = mergeChecks([], [...many.keys(), "n:f0"].map((id) => ({ id, verdict: "noise", why: "thin" })), many, 1);
    expect(c.map((x) => x.id)).toEqual(["n:f0", "n:f1", "n:f2", "n:f3", "n:f4"]);
  });
  it("the month read's answer may carry them; a week read's doesn't need to", () => {
    const base = { title: "t", summary: "s", notices: [], next: [], remember: [] };
    expect(checkReview(base).checks).toBeUndefined();
    expect(checkReview({ ...base, checks: [{ id: "n:x", verdict: "noise", why: "thin" }, { id: "n:y", verdict: "maybe" as "noise", why: "?" }] }).checks).toEqual([{ id: "n:x", verdict: "noise", why: "thin" }]);
    expect(SYSTEM.review).toMatch(/never call one noise just because it's surprising/);
  });
});
