import { describe, expect, it } from "vitest";
import { measureDays, measureValue, measureWords } from "./digestchart";
import { dailyFacts } from "../insights";
import { DEFAULT_SETTINGS } from "../store";
import type { Entry } from "../types";
import { addDays } from "../time";

// PLAN 150: the morning read's charts are drawn from his own data, a value a day, oldest first, today last
const TODAY = "2026-10-21";
const at = (day: string, h: number, m = 0) => { const [y, mo, d] = day.split("-").map(Number); return new Date(y, mo - 1, d, h, m).getTime(); };
const food = (day: string, h: number, p: number, kcal = 500): Entry => ({ id: `f${day}${h}`, kind: "food", at: at(day, h), name: "Meal", grams: 300, macros: { kcal, p, c: 50, f: 15 } });
const facts = (es: Entry[]) => dailyFacts(es, [], DEFAULT_SETTINGS, addDays(TODAY, -13), TODAY);

describe("measureDays", () => {
  it("is 14 days, oldest first, with the drink's protein counted and unlogged days empty", () => {
    const es: Entry[] = [food("2026-10-20", 9, 40), food("2026-10-20", 13, 68),
      // the protein coffee (owner, 21 Oct: "the ai said 108 protein at eod, in reality it was 158")
      { id: "pc", kind: "drink", at: at("2026-10-20", 8), name: "Protein coffee", ml: 330, caffeineMg: 80, alcoholG: 0, kcal: 210, p: 50 },
      food("2026-10-08", 12, 120), food(TODAY, 8, 30)];
    const v = measureDays("protein", facts(es), es, TODAY);
    expect(v).toHaveLength(14);
    expect(v[0]).toBe(120); // the 8th, 13 days back
    expect(v[12]).toBe(158); // yesterday: 40 + 68 + 50
    expect(v[13]).toBe(30); // today so far
    expect(v.slice(1, 12).every((x) => x === null)).toBe(true);
  });

  it("weight is each day's first weigh-in, from the entries", () => {
    const es: Entry[] = [{ id: "a", kind: "weight", at: at("2026-10-19", 21), kg: 83.4 }, { id: "b", kind: "weight", at: at("2026-10-19", 7), kg: 82.6 }, { id: "c", kind: "weight", at: at(TODAY, 7), kg: 82.1 }];
    const v = measureDays("weight", facts(es), es, TODAY);
    expect(v[11]).toBe(82.6);
    expect(v[13]).toBe(82.1);
    expect(v.filter((x) => x != null)).toHaveLength(2);
  });

  it("caffeine is 0 on a day food was logged without coffee, and unknown on a day nothing was", () => {
    const es: Entry[] = [food("2026-10-20", 12, 50), { id: "k", kind: "drink", at: at("2026-10-19", 9), name: "Espresso", ml: 30, caffeineMg: 63, alcoholG: 0, kcal: 2 }];
    const v = measureDays("caffeine", facts(es), es, TODAY);
    expect(v[11]).toBe(63);
    expect(v[12]).toBe(0);
    expect(v[10]).toBeNull();
  });
});

describe("measureWords", () => {
  it("averages the finished days, not today's so far", () => {
    const v = [...Array(10).fill(null), 140, 150, 160, 20];
    expect(measureWords("protein", v)).toBe("avg 150 g over 3 days · yesterday 160 g · today 20 g so far");
  });
  it("a level today is a reading", () => {
    expect(measureWords("weight", [...Array(11).fill(null), 82.6, 82.4, 82.1])).toBe("avg 82.5 kg over 2 days · yesterday 82.4 kg · today 82.1 kg");
  });
  it("says when nothing was logged", () => {
    expect(measureWords("mood", Array(14).fill(null))).toBe("nothing logged in the last 14 days");
  });
  it("ratings keep a decimal, amounts are whole", () => {
    expect(measureValue("sleep", 6.66)).toBe("6.7/10");
    expect(measureValue("kcal", 1939.6)).toBe("1,940 kcal");
  });
});
