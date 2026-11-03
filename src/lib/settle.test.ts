// Asking harder (PLAN 188 phase 4; owner, 3 Nov: "do 1 and 2"). The finding nearest to settled asks for what would
// settle it: "likely" first, then "early" a week or less away; its short side in words; a try only to leave something
// out — never to do more of drinks or caffeine; "Not now" rests it 2 weeks; one already being tried isn't offered again.
import { describe, expect, it } from "vitest";
import { restSettle, settleNext } from "./settle";
import type { Evidence } from "./evidence";
import type { Result } from "./detectors/effects";

const R = (id: string, thing: string, o: string, p: Partial<Result>, more?: [string, string]): Result => ({
  q: { id, group: id, area: "feel", kind: "binary", lag: 1, thing, phrase: thing, x: () => null, outcomes: [], ...(more ? { more } : {}) },
  o: { key: o, name: o, get: () => null, minEffect: 0.5, unit: "points" },
  n: 40, nOn: 30, nOff: 10, b: -0.9, lo: -1.6, hi: -0.2, p: 0.02, sigma: 1, meanOn: 6.1, meanOff: 7.0, replicated: true, enough: true, need: 4, status: "checking", ...p,
}) as Result;
const ev = (rows: [string, "likely" | "early" | "clear" | "no effect", Result][]): Evidence => new Map(rows.map(([k, word, r]) => [k, { word, r }]));

describe("asking harder (PLAN 188 phase 4)", () => {
  const saffron = R("supp-saffron", "Saffron", "mood", { nOn: 34, nOff: 6, need: 5 }, ["days taking Saffron", "days skipping Saffron"]);
  // too few days with: no adjusted effect yet (b null) — the raw means say which way
  const drinks = R("alc-2", "2+ drinks", "energy", { nOn: 5, nOff: 35, need: 3, enough: false, b: null, p: 1, meanOn: 5.6, meanOff: 6.8 });
  it("a likely one first; its short side in words; leaving a supplement out offered as 7 days", () => {
    const s = settleNext(ev([["alc:energy", "early", drinks], ["supp-saffron:mood", "likely", saffron]]), {}, "2026-11-03")!;
    expect(s).toMatchObject({ key: "supp-saffron:mood", word: "likely", side: "without", sideWords: "days skipping Saffron", need: 5 });
    expect(s.try).toEqual({ name: "No saffron for 7 days", how: "Leave out saffron for 7 days and keep the rest as usual — it settles whether it goes with your mood.", days: 7, measure: "mood" });
  });
  it("never a try to do more: drinks short on days WITH them settle with time, no experiment", () => {
    const s = settleNext(ev([["alc:energy", "early", drinks]]), {}, "2026-11-03")!;
    expect(s).toMatchObject({ key: "alc:energy", side: "with", need: 3 });
    expect(s.try).toBeUndefined();
  });
  it("too far off, not a cause → outcome to ask about, resting, or clear already: nothing", () => {
    expect(settleNext(ev([["alc:energy", "early", { ...drinks, need: 12 }]]), {}, "2026-11-03")).toBeNull();
    expect(settleNext(ev([["alc:energy", "early", { ...drinks, meanOn: 6.6 }]]), {}, "2026-11-03")).toBeNull(); // too small to settle
    expect(settleNext(ev([["weekend:kcal", "likely", R("weekend", "Weekend", "kcal", {})]]), {}, "2026-11-03")).toBeNull();
    expect(settleNext(ev([["supp-saffron:mood", "clear", saffron]]), {}, "2026-11-03")).toBeNull();
    const rest = restSettle({}, "supp-saffron:mood", "2026-11-03");
    expect(rest).toEqual({ "supp-saffron:mood": "2026-11-17" });
    expect(settleNext(ev([["supp-saffron:mood", "likely", saffron]]), rest, "2026-11-10")).toBeNull();
    expect(settleNext(ev([["supp-saffron:mood", "likely", saffron]]), rest, "2026-11-17")).not.toBeNull();
  });
  it("one already being tried isn't offered again", () => {
    expect(settleNext(ev([["supp-saffron:mood", "likely", saffron]]), {}, "2026-11-03", ["No saffron for 7 days"])).toBeNull();
  });
});
