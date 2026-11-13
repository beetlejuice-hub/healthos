import { describe, expect, it } from "vitest";
import { briefLine, briefWatch, checkInDue, usualOf, type BriefIn } from "./brief";
import { addDays } from "./time";

// Today's brief (owner, 13 Nov: "A A A"; canvas Today A).
const base: BriefIn = { moment: "morning", night: { asleepMin: 450, score: 88 }, hrv: { today: 50, usual: 46 }, ready: { score: 86, word: "ready" }, cafBed: 0, bedClock: "23:30" };

describe("the line", () => {
  it("the night, HRV against your usual, readiness", () => {
    expect(briefLine(base)).toBe("Slept 7 h 30, score 88. HRV 50, above your usual 46. Readiness 86: ready.");
  });
  it("HRV within 5 % is 'your usual'; below says so", () => {
    expect(briefLine({ ...base, hrv: { today: 47, usual: 46 } })).toContain("HRV 47, your usual.");
    expect(briefLine({ ...base, hrv: { today: 38, usual: 46 } })).toContain("HRV 38, below your usual 46.");
  });
  it("not in the evening: then it's about tonight", () => {
    expect(briefLine({ ...base, moment: "evening" })).toBeNull();
    expect(briefLine({ ...base, moment: "day" })).not.toBeNull();
  });
  it("only what's known; nothing known, no line", () => {
    expect(briefLine({ ...base, night: null, ready: null })).toBe("HRV 50, above your usual 46.");
    expect(briefLine({ ...base, night: null, hrv: null, ready: null })).toBeNull();
  });
});

describe("one thing to watch", () => {
  it("caffeine still in you at bedtime, from 50 mg", () => {
    expect(briefWatch({ ...base, cafBed: 87 })).toBe("About 90 mg of caffeine will still be in you at 23:30, your bedtime.");
    expect(briefWatch({ ...base, cafBed: 30 })).toBeNull();
  });
  it("in the evening, the bedtime", () => {
    expect(briefWatch({ ...base, moment: "evening" })).toBe("Bed by 23:30 keeps your week regular.");
  });
});

describe("your usual HRV, and when to ask how you feel", () => {
  it("the median of the 28 mornings before today, 7 at least; today's left out", () => {
    const today = "2026-11-13", s: Record<string, number> = { [today]: 99 };
    for (let i = 1; i <= 40; i++) s[addDays(today, -i)] = i <= 28 ? 40 + (i % 5) : 10;
    expect(usualOf(s, today)).toBe(42);
    expect(usualOf({ [addDays(today, -1)]: 50 }, today)).toBeNull();
  });
  it("a check-in 4 hours on", () => {
    expect(checkInDue(null, 0)).toBe(true);
    expect(checkInDue(0, 3 * 3600e3)).toBe(false);
    expect(checkInDue(0, 4 * 3600e3)).toBe(true);
  });
});
