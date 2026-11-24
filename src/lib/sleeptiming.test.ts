// PLAN 227 — sleep timing. Known answers: 14 nights of 6½ h against a 7½ h need — debt about 10.5 h (weights 1 → ½);
// 14 nights at the need — 0; tonight's window from a usual 07:00 weekday wake, 15 min to fall asleep, the need and
// 30 min more for a big debt — 22:45 (22:30–23:00); chronotype: weekdays 00:00–07:00, weekends 01:30–09:30 —
// MSF 05:30, corrected for the 1 h catch-up to about 05:09, "later than most"; social jetlag 2 h (mid-sleep 03:30 against 05:30).
import { describe, expect, it } from "vitest";
import { bedWindow, chronotype, sleepDebt } from "./sleeptiming";
import type { Night } from "./sleep";
import { addDays, atMinute } from "./time";

const TODAY = "2026-11-24";
const night = (morning: string, bedHM: number, wakeHM: number): Night => {
  const eve = addDays(morning, -1), bed = atMinute(eve, bedHM), wake = atMinute(eve, wakeHM), onset = bed + 15 * 60_000;
  return { day: morning, eve, bed, onset, wake, up: wake + 5 * 60_000, asleep: (wake - onset) / 60_000, latency: 15 } as unknown as Night;
};
const NOW = atMinute(TODAY, 9 * 60);

describe("sleep timing", () => {
  it("debt: 14 short nights against the need, recent ones counting more; none at the need", () => {
    const short = Array.from({ length: 14 }, (_, i) => night(addDays(TODAY, -i), 23 * 60 + 30, 30 * 60 + 15)); // 6½ h asleep
    const d = sleepDebt(short, 7.5, NOW)!;
    expect(d.nights).toBe(14);
    expect(d.hours).toBeGreaterThan(10); expect(d.hours).toBeLessThan(11);
    expect(sleepDebt(Array.from({ length: 14 }, (_, i) => night(addDays(TODAY, -i), 23 * 60, 30 * 60 + 45)), 7.5, NOW)!.hours).toBe(0);
  });
  it("tonight's window: the usual wake for that kind of morning, minus need, time to fall asleep, and 30 min for a big debt", () => {
    const ns = Array.from({ length: 28 }, (_, i) => night(addDays(TODAY, -i), 23 * 60, 31 * 60)); // wakes 07:00
    const w = bedWindow(ns, 7.5, 4, "2026-11-25", NOW)!; // a Wednesday morning
    expect(w).toEqual({ from: "22:30", to: "23:00", target: "22:45", wake: "07:00" });
    expect(bedWindow(ns, 7.5, 1, "2026-11-25", NOW)!.target).toBe("23:15");
  });
  it("chronotype: free mornings later and longer — corrected for catching up; social jetlag", () => {
    const ns = Array.from({ length: 28 }, (_, i) => { const m = addDays(TODAY, -i), free = [0, 6].includes(new Date(`${m}T12:00:00`).getDay());
      return free ? night(m, 25 * 60 + 15, 33 * 60 + 30) : night(m, 23 * 60 + 45, 31 * 60); });
    const c = chronotype(ns)!;
    expect(c.msf).toBe("05:30");
    expect(c.word).toBe("later than most");
    expect(c.jetlagMin).toBe(120);
    expect(c.msfsc > "05:00" && c.msfsc < "05:30").toBe(true);
    expect(chronotype(ns.slice(0, 5))).toBeNull();
  });
});
