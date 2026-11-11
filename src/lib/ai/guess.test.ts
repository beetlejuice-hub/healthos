// PLAN 210 — how sure, your guess, your gut's record. The verdict test's planted world: energy +1.5 during the
// experiment → very sure it helped; nothing planted → somewhere in between, never "sure"; the same lift on stress (lower
// is better) → sure it hurt. Guesses: right when they match the app's result, open only for the first 3 days.
import { describe, expect, it } from "vitest";
import { feelWorld } from "../bench";
import { addDays } from "../time";
import type { Experiment } from "../store";
import { judge } from "./apply";
import { guessOpen, guessRight, gutRecord } from "./guess";

const base = feelWorld({ seed: 7, days: 60, rateRate: 1 }).map((d, i) => ({ ...d, day: addDays("2026-08-01", i) }));
const x: Experiment = { id: "x", name: "No caffeine after 14:00", how: "Last coffee by 14:00", days: 21, measure: "energy", start: addDays("2026-08-01", 30) };
const lift = (k: "energy" | "stress") => base.map((d) => (d.day >= x.start && d[k] != null ? { ...d, [k]: d[k]! + 1.5 } : d));
const end = addDays(x.start, 25);

describe("how sure (PLAN 210)", () => {
  it("energy +1.5 during: 99 %+ it helped", () => expect(judge(x, lift("energy"), end).sure!).toBeGreaterThan(0.99));
  it("control: nothing planted — not sure either way", () => { const s = judge(x, base, end).sure!; expect(s).toBeGreaterThan(0.05); expect(s).toBeLessThan(0.95); });
  it("stress +1.5 (lower is better): sure it went the wrong way", () => expect(judge({ ...x, measure: "stress" }, lift("stress"), end).sure!).toBeLessThan(0.01));
  it("too few days: no number", () => expect(judge(x, lift("energy"), addDays(x.start, 3)).sure).toBeUndefined());
});

describe("your guess (PLAN 210)", () => {
  it("right when it matches the app's result", () => {
    expect(guessRight("helps", "better")).toBe(true); expect(guessRight("same", "no-clear-change")).toBe(true); expect(guessRight("hurts", "worse")).toBe(true);
    expect(guessRight("helps", "no-clear-change")).toBe(false); expect(guessRight(undefined, "better")).toBeNull(); expect(guessRight("helps", null)).toBeNull();
  });
  it("asked for the first 3 days only, not once guessed or ended", () => {
    expect(guessOpen(x, x.start)).toBe(true); expect(guessOpen(x, addDays(x.start, 2))).toBe(true); expect(guessOpen(x, addDays(x.start, 3))).toBe(false);
    expect(guessOpen({ ...x, guess: "helps" }, x.start)).toBe(false); expect(guessOpen({ ...x, ended: x.start }, x.start)).toBe(false);
  });
  it("your gut's record: right of guessed and done; none guessed — nothing", () => {
    const xs: Experiment[] = [{ ...x, id: "a", guess: "helps" }, { ...x, id: "b", guess: "hurts" }, { ...x, id: "c", guess: "same" }, { ...x, id: "d" }, { ...x, id: "e", guess: "helps" }];
    const out = { a: "better", b: "no-clear-change", c: "no-clear-change", d: "better", e: "better" } as const;
    expect(gutRecord(xs, (y) => out[y.id as keyof typeof out])).toEqual({ right: 3, of: 4, say: "Your gut so far: right 3 of 4 — you know your body well." });
    expect(gutRecord([{ ...x }], () => "better")).toBeNull();
  });
});
