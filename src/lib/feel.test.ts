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

describe("How now? helpers", async () => {
  const { tagOf, doingOrder, inferredDoing, sinceLast, DOING } = await import("./feel");
  const T = (h: number, m = 0) => new Date(2026, 9, 2, h, m).getTime();

  it("your own tag: one word, tidied", () => {
    expect(tagOf("  Reading ")).toBe("reading");
    expect(tagOf("deep work")).toBe("deep");
    expect(tagOf("x")).toBeNull();
    expect(tagOf("sauna!!")).toBe("sauna");
    expect(tagOf("úszás")).toBe("úszás");
  });

  it("tags you use most come first; built-in order otherwise; your own ones join once used", () => {
    expect(doingOrder([], T(12)).slice(0, 3)).toEqual(DOING.slice(0, 3).map((d) => d.tag));
    const es = [1, 2, 3].map((i): import("./types").Entry => ({ id: `f${i}`, kind: "feel", at: T(9 + i), mood: 6, doing: ["sauna", "commute"] }));
    const o = doingOrder(es, T(18));
    expect(o.slice(0, 2)).toEqual(["commute", "sauna"]); // tie → built-in first, then yours
    expect(o).toContain("work");
  });

  it("pre-ticks what the logs already show since the last check-in", () => {
    const es: import("./types").Entry[] = [
      { id: "l", kind: "food", at: T(12, 30), name: "Lunch", grams: 400, macros: { kcal: 650, p: 30, c: 70, f: 20 } },
      { id: "b", kind: "food", at: T(16), name: "Biscuit", grams: 20, macros: { kcal: 90, p: 1, c: 12, f: 4 } },
    ];
    expect(inferredDoing(es, [{ startedAt: T(15) }], T(13), T(17))).toEqual(["gym"]); // the biscuit isn't a meal
    expect(inferredDoing(es, [], T(9), T(13))).toEqual(["eating"]);
  });

  it("the small reward: changes since the last check-in that day, and what was in between", () => {
    const prev: import("./types").Entry = { id: "p", kind: "feel", at: T(13), mood: 4, stress: 7 };
    const open = { id: "o", kind: "feel" as const, at: T(17), mood: 7, stress: 4, doing: ["outside"] };
    const r = sinceLast([prev, open], open, [{ startedAt: T(15) }])!;
    expect(r.at).toBe(T(13));
    expect(r.changes).toEqual([{ k: "mood", d: 3 }, { k: "stress", d: -3 }]);
    expect(r.between.sort()).toEqual(["gym", "outside"]);
    // Yesterday's check-in doesn't count.
    expect(sinceLast([{ ...prev, at: T(13) - 86_400_000 }, open], open, [])).toBeNull();
  });
});
