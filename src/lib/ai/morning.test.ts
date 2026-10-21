import { describe, expect, it } from "vitest";
import { digestDue, freshRead, morningShown, nightIn, nightShown } from "./morning";
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

// PLAN 155 — owner, 21 Oct: "make sure it does not sit for long. like if i get them at yesterday morning, it should not
// be there/ or the same at next morning, asking about 2 days from before".
describe("each read until the next one replaces it", () => {
  const m20 = { day: "2026-10-20", at: at("20", "07:40") }, n20 = { day: "2026-10-20", at: at("20", "21:30") }, m21 = { day: "2026-10-21", at: at("21", "07:55") };
  it("yesterday morning's read is gone this morning, even before today's is written", () => {
    expect(morningShown(m20, null, at("21", "06:30"))).toBe(false);
    expect(morningShown(m20, null, at("21", "09:00"))).toBe(false);
  });
  it("the morning read stays through the day, until that evening's read is written", () => {
    expect(morningShown(m20, null, at("20", "18:00"))).toBe(true);
    expect(morningShown(m20, n20, at("20", "21:00"))).toBe(true); // the evening read isn't written yet at 21:00
    expect(morningShown(m20, n20, at("20", "21:31"))).toBe(false);
    expect(morningShown(m20, null, at("21", "00:40"))).toBe(true); // no evening read: still that day's, past midnight
    expect(morningShown(m20, null, at("21", "04:00"))).toBe(false);
  });
  it("the evening read stays overnight, until the next morning read is written, and never past noon", () => {
    expect(nightShown(n20, m20, at("20", "22:00"))).toBe(true); // that morning's read is older: it doesn't replace it
    expect(nightShown(n20, m20, at("21", "07:00"))).toBe(true);
    expect(nightShown(n20, m21, at("21", "07:50"))).toBe(true); // written at 07:55 — not yet
    expect(nightShown(n20, m21, at("21", "08:00"))).toBe(false);
    expect(nightShown(n20, null, at("21", "11:59"))).toBe(true);
    expect(nightShown(n20, null, at("21", "12:00"))).toBe(false);
  });
  it("a read-back written the next morning (the app wasn't opened that evening) shows, until noon", () => {
    const late = { day: "2026-10-20", at: at("21", "08:30") };
    expect(nightShown(late, m21, at("21", "09:00"))).toBe(true); // the morning read came first
    expect(morningShown(m21, late, at("21", "09:00"))).toBe(true); // a read-back for yesterday doesn't hide today's
    expect(nightShown(late, m21, at("21", "12:01"))).toBe(false);
  });
});
