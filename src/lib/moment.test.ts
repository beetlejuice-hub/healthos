import { describe, expect, it } from "vitest";
import { dayNumbers, momentOf } from "./moment";
import type { Entry } from "./types";

const at = (hm: string) => new Date(`2026-10-06T${hm}:00`).getTime();

describe("Today's Now card follows the clock", () => {
  it("morning 05:00–10:59, day 11:00–18:59, evening 19:00 to 04:59 (after midnight is still last evening)", () => {
    expect(["04:59", "05:00", "10:59", "11:00", "18:59", "19:00", "23:59", "00:00", "02:30"].map((t) => momentOf(at(t))))
      .toEqual(["evening", "morning", "morning", "day", "day", "evening", "evening", "evening", "evening"]);
  });
});

describe("the day in numbers (evening card)", () => {
  const food = (t: string, kcal: number, p: number): Entry => ({ id: t, kind: "food", at: at(t), name: "x", grams: 100, macros: { kcal, p, c: 0, f: 0 } });
  const feel = (t: string, mood: number): Entry => ({ id: "f" + t, kind: "feel", at: at(t), mood });
  const es = [food("04:30", 900, 50), food("09:00", 500, 30), food("13:00", 700, 40), feel("10:00", 6), feel("18:00", 8), { id: "c", kind: "drink", at: at("08:00"), name: "Coffee", ml: 30, caffeineMg: 95, alcoholG: 0, kcal: 2 } as Entry];
  it("sums food and caloric drinks since 05:00 and averages today's moods", () => {
    expect(dayNumbers(es, at("21:20"))).toEqual({ kcal: 1202, protein: 70, mood: 7, moodN: 2 });
  });
  it("at 01:00 it is still the day that's ending; 04:30 belongs to it", () => {
    const next = (t: string) => new Date(`2026-10-07T${t}:00`).getTime();
    expect(dayNumbers([...es, { ...food("x", 300, 20), at: next("00:30") }], next("01:00")).kcal).toBe(1502);
  });
  it("nothing logged is not a 0 kcal day", () => {
    expect(dayNumbers([feel("10:00", 6)], at("21:00"))).toEqual({ kcal: null, protein: null, mood: 6, moodN: 1 });
  });
});
