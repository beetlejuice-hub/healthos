import { describe, expect, it } from "vitest";
import { feelChange, feelState, JOIN_MS } from "./feel";
import type { Entry } from "./types";

const T = new Date(2026, 8, 30, 20, 0).getTime();
const old: Entry = { id: "f1", kind: "feel", at: T - 3 * 60 * 60_000, energy: 7, mood: 6, focus: 5, stress: 3 };

describe("feelings: only what you touch", () => {
  it("changing stress alone logs stress alone — no energy/mood/focus copied from last time", () => {
    const c = feelChange([old], T, "stress", 6);
    expect(c).toEqual({ op: "add", entry: { kind: "feel", at: T, stress: 6 } });
  });

  it("touching the same value still logs it", () => {
    const c = feelChange([old], T, "energy", 7);
    expect(c).toMatchObject({ op: "add", entry: { energy: 7 } });
  });

  it("touches within a few minutes join one rating", () => {
    const first: Entry = { id: "f2", kind: "feel", at: T, stress: 6 };
    expect(feelChange([old, first], T + 60_000, "mood", 8)).toEqual({ op: "update", id: "f2", patch: { mood: 8 } });
    expect(feelChange([old, first], T + JOIN_MS + 1, "mood", 8).op).toBe("add");
  });

  it("sliders start empty and show the last value per field", () => {
    const partial: Entry = { id: "f3", kind: "feel", at: T - 60 * 60_000, stress: 6 };
    const s = feelState([old, partial], T);
    expect(s.stress).toEqual({ now: undefined, last: { v: 6, at: partial.at } });
    expect(s.energy).toEqual({ now: undefined, last: { v: 7, at: old.at } }); // from the older, complete rating
    const s2 = feelState([old, { id: "f4", kind: "feel", at: T - 60_000, focus: 9 }], T);
    expect(s2.focus.now).toBe(9);
    expect(s2.energy.now).toBeUndefined();
  });
});
