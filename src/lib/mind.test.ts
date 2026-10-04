import { describe, expect, it } from "vitest";
import { moodCourse, moodRhythm, stepOf } from "./mind";
import type { GlanceDay } from "./glance";
import type { Entry } from "./types";
import { addDays } from "./time";

const day = (d: string, mood: number | null, extra: Partial<GlanceDay> = {}): GlanceDay => ({ day: d, mood, energy: null, focus: null, stress: null, sleep: null, kcal: null, protein: null, cafBed: null, drinks: null, weight: null, trained: false, lateCaffeine: false, note: false, checkins: mood == null ? 0 : 1, ...extra });

describe("moodCourse", () => {
  const days = [day("2026-09-28", 6), day("2026-09-29", 8, { drinks: 2 }), day("2026-09-30", 4), day("2026-10-01", null), day("2026-10-02", 6)];
  const c = moodCourse(days, 4);
  it("measures each day against your average of every rated day", () => {
    expect(c.base).toBe(6);
    expect(c.days.map((d) => d.dev)).toEqual([2, -2, null, 0]);
    expect(c.above).toBe(1);
    expect(c.rated).toBe(3);
  });
  it("names the best and lowest day, and flags the day after drinks", () => {
    expect(c.best!.day).toBe("2026-09-29");
    expect(c.lowest!.day).toBe("2026-09-30");
    expect(c.days[1].drinksBefore).toBe(true); // the 30th follows the 29th's drinks
  });
  it("copes with no ratings", () => {
    const e = moodCourse([day("2026-10-01", null)], 7);
    expect(e.base).toBeNull(); expect(e.best).toBeNull(); expect(e.above).toBe(0);
  });
});

describe("moodRhythm", () => {
  const at = (iso: string, h: number) => new Date(`${iso}T${String(h).padStart(2, "0")}:15`).getTime();
  // Four weeks: mood 5 everywhere, but Monday evenings (18–21) are 8 — a planted rhythm.
  const es: Entry[] = []; let n = 0;
  for (let k = 0; k < 28; k++) {
    const d = addDays("2026-09-06", k), mon = new Date(`${d}T12:00`).getDay() === 1;
    for (const h of [9, 14, 19]) es.push({ id: String(n++), kind: "feel", at: at(d, h), mood: mon && h === 19 ? 8 : 5 });
  }
  const r = moodRhythm(es, 0);
  it("finds a planted best time: Monday 18–21", () => {
    expect(r.best).toMatchObject({ row: 0, col: 4, mean: 8, n: 4 });
    expect(r.n).toBe(84);
  });
  it("doesn't invent a lowest time when everything else is flat", () => {
    expect(r.lowest!.mean).toBe(5);
    expect(r.lo).toBe(5); expect(r.hi).toBe(8);
  });
  it("puts a 01:00 check-in in the evening before (Sunday 01:00 → Saturday 21–24)", () => {
    const x = moodRhythm([{ id: "x", kind: "feel", at: at("2026-10-04", 1), mood: 3 }], 0);
    expect(x.cells.find((c) => c.n)).toMatchObject({ row: 5, col: 5 });
  });
  it("leaves out check-ins before the window", () => {
    expect(moodRhythm(es, at("2026-10-04", 0)).n).toBe(0);
    expect(moodRhythm(es, at("2026-10-03", 0)).n).toBe(3);
  });
  it("steps colour between the grid's lowest and highest", () => {
    expect(stepOf(5, 5, 8)).toBe(0); expect(stepOf(8, 5, 8)).toBe(5); expect(stepOf(6.5, 5, 8)).toBe(2);
  });
});
