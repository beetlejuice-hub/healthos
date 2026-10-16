import { describe, expect, it } from "vitest";
import { digestDue, freshRead, nightIn } from "./morning";
import type { SleepSession } from "../band";

// Owner, 16 Oct: "looks like app does daily read based on yyesterdays data" — the 16 Oct read was written on the 15th at
// 20:00+, so its "rough night" and "today's 11:36 check-in" were the 15th's.
const at = (d: string, hm: string) => new Date(`2026-10-${d}T${hm}:00`).getTime();
const night = (start: number, end: number, nap = false): SleepSession => ({ id: `n${start}`, start, end, asleepMin: null, awakeMin: null, toFallAsleepMin: null, nap, stageMin: {}, stages: [] });
const writtenEve = { day: "2026-10-16", at: at("15", "20:31") }, writtenMorning = { day: "2026-10-16", at: at("16", "07:41") };

describe("when the morning read is written", () => {
  it("not the evening before any more — that's what wrote the 16th's read about the 15th", () => {
    expect(digestDue(at("15", "20:30"), { day: "2026-10-15", at: at("15", "07:50") }, true)).toBeNull();
    expect(digestDue(at("15", "23:50"), { day: "2026-10-15", at: at("15", "07:50") }, true)).toBeNull();
    expect(digestDue(at("16", "04:30"), null, true)).toBeNull();
    // first opened at 20:30 with no read that day: a "morning read" then is no use
    expect(digestDue(at("15", "20:30"), null, true)).toBeNull();
    expect(digestDue(at("15", "17:55"), null, true)).toBe("2026-10-15");
  });
  it("in the morning once last night is in; until then it waits, and from 11:00 it goes ahead anyway", () => {
    expect(digestDue(at("16", "07:40"), { day: "2026-10-15", at: at("15", "07:50") }, false)).toBeNull();
    expect(digestDue(at("16", "07:40"), { day: "2026-10-15", at: at("15", "07:50") }, true)).toBe("2026-10-16");
    expect(digestDue(at("16", "11:05"), { day: "2026-10-15", at: at("15", "07:50") }, false)).toBe("2026-10-16");
  });
  it("a read for today written the evening before (or not saying when) is written again, once", () => {
    expect(digestDue(at("16", "07:40"), writtenEve, true)).toBe("2026-10-16");
    expect(digestDue(at("16", "07:40"), { day: "2026-10-16" }, true)).toBe("2026-10-16");
    expect(digestDue(at("16", "07:45"), writtenMorning, true)).toBeNull();
    expect(digestDue(at("16", "21:00"), writtenMorning, true)).toBeNull();
  });
  it("fresh means written that morning", () => {
    expect([freshRead(writtenEve), freshRead(writtenMorning), freshRead({ day: "2026-10-16" }), freshRead(null)]).toEqual([false, true, false, false]);
  });
});

describe("last night is in", () => {
  const now = at("16", "07:40");
  it("a night that ended this morning, or a sleep rating today", () => {
    expect(nightIn([night(at("16", "00:30"), at("16", "07:10"))], false, now)).toBe(true);
    expect(nightIn([], true, now)).toBe(true);
    expect(nightIn(undefined, false, now)).toBe(false);
  });
  it("not yesterday's night, a nap, or 2 hours that ended at 03:00", () => {
    expect(nightIn([night(at("15", "00:30"), at("15", "07:10"))], false, now)).toBe(false);
    expect(nightIn([night(at("15", "14:00"), at("15", "15:00"), true)], false, at("15", "16:00"))).toBe(false);
    expect(nightIn([night(at("16", "01:00"), at("16", "03:00"))], false, now)).toBe(false);
  });
});
