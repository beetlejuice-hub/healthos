import { describe, expect, it } from "vitest";
import { yesterdayGaps } from "./catchup";
import type { Entry, Supplement } from "./types";
import { addDays, atMinute } from "./time";

const TODAY = "2026-10-09", YDAY = "2026-10-08";
const mag: Supplement = { id: "mag", name: "Magnesium", dose: "200 mg", slot: "evening", at: 21 * 60 + 30, active: true };
const thea: Supplement = { id: "thea", name: "L-theanine", dose: "200 mg", slot: "morning", slots: ["morning", "midday"], at: 8 * 60 + 15, active: true };
let n = 0;
const supp = (day: string, id: string, slot: Supplement["slot"], status: "taken" | "skipped" = "taken"): Entry => ({ id: `s${n++}`, kind: "supp", at: atMinute(day, 600), suppId: id, status, slot });
const coffee = (day: string, min: number): Entry => ({ id: `c${n++}`, kind: "drink", at: atMinute(day, min), name: "Coffee", ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 });
const food = (day: string, min: number): Entry => ({ id: `f${n++}`, kind: "food", at: atMinute(day, min), name: "Pasta", grams: 300, macros: { kcal: 500, p: 20, c: 80, f: 10 } });
/** `k` days before yesterday, each with what `day(d, i)` returns. */
const history = (k: number, day: (d: string, i: number) => Entry[]) => Array.from({ length: k }, (_, i) => day(addDays(YDAY, -(i + 1)), i)).flat();

describe("yesterday's gaps: supplements", () => {
  it("one you've been ticking, with no answer last night: asked, at its time yesterday", () => {
    const g = yesterdayGaps(history(10, (d) => [supp(d, "mag", "evening")]), [mag], TODAY);
    expect(g).toEqual([expect.objectContaining({ kind: "supp", suppId: "mag", slot: "evening", at: atMinute(YDAY, 21 * 60 + 30) })]);
  });
  it("answered either way, paused, run out or never ticked: not asked", () => {
    const h = history(10, (d) => [supp(d, "mag", "evening")]);
    expect(yesterdayGaps([...h, supp(YDAY, "mag", "evening", "skipped")], [mag], TODAY)).toEqual([]);
    expect(yesterdayGaps(h, [{ ...mag, active: false }], TODAY)).toEqual([]);
    expect(yesterdayGaps(h, [{ ...mag, status: "out" }], TODAY)).toEqual([]);
    expect(yesterdayGaps([], [mag], TODAY)).toEqual([]);
  });
  it("two slots: only the one not answered", () => {
    const g = yesterdayGaps([...history(5, (d) => [supp(d, "thea", "morning")]), supp(YDAY, "thea", "morning")], [thea], TODAY);
    expect(g.map((x) => x.kind === "supp" && x.slot)).toEqual(["midday"]);
    expect(g[0].kind === "supp" && g[0].at).toBe(atMinute(YDAY, 13 * 60));
  });
});

describe("yesterday's gaps: what you have most days", () => {
  const meals = (d: string) => [food(d, 12 * 60 + 30), food(d, 19 * 60 + 30)];
  it("coffee on 10 of 12 days, none yesterday: your usual one, at your usual first time", () => {
    const h = history(12, (d, i) => [...meals(d), ...(i < 10 ? [coffee(d, 8 * 60 + (i % 3) * 10), coffee(d, 14 * 60)] : [])]);
    const g = yesterdayGaps([...h, ...meals(YDAY)], [], TODAY);
    expect(g).toEqual([expect.objectContaining({ kind: "drink", name: "Coffee", days: 10, of: 12, at: atMinute(YDAY, 8 * 60 + 10) })]);
    expect(g[0].kind === "drink" && g[0].usual).toEqual({ kind: "drink", name: "Coffee", ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 });
    expect(yesterdayGaps([...h, ...meals(YDAY), coffee(YDAY, 9 * 60)], [], TODAY)).toEqual([]);
  });
  it("on half the days, or on only 4: not a habit", () => {
    expect(yesterdayGaps(history(12, (d, i) => [...meals(d), ...(i % 2 ? [coffee(d, 480)] : [])]).concat(meals(YDAY)), [], TODAY)).toEqual([]);
    expect(yesterdayGaps(history(4, (d) => [...meals(d), coffee(d, 480)]).concat(meals(YDAY)), [], TODAY)).toEqual([]);
  });
  it("dinner most days, yesterday only lunch: dinner asked, lunch not", () => {
    const g = yesterdayGaps([...history(12, (d) => meals(d)), food(YDAY, 12 * 60 + 30)], [], TODAY);
    expect(g).toEqual([expect.objectContaining({ kind: "meal", meal: "dinner", days: 12, of: 12 })]);
  });
  it("nothing logged at all yesterday still asks — that's when you most forgot", () => {
    const g = yesterdayGaps([...history(10, (d) => [...meals(d), coffee(d, 480), supp(d, "mag", "evening")])], [mag], TODAY);
    expect(g.map((x) => x.kind).sort()).toEqual(["drink", "meal", "meal", "supp"]);
  });
});
