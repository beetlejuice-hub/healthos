import { describe, expect, it } from "vitest";
import { plan, DEFAULT_NOTIFY, type Reminder } from "./plan";
import type { Entry, Supplement } from "../types";

const T = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
const stack: Supplement[] = [
  { id: "cre", name: "Creatine", dose: "5 g", slot: "morning", at: 8 * 60, active: true },
  { id: "lth", name: "L-theanine", dose: "200 mg", slot: "morning", slots: ["morning", "midday"], at: 8 * 60, active: true },
  { id: "mag", name: "Magnesium", dose: "400 mg", slot: "evening", at: 21 * 60 + 30, active: true },
];
const ctx = (now: number, entries: Entry[] = [], prefs = DEFAULT_NOTIFY, bedMinute = 23 * 60) => ({ now, entries, supplements: stack, bedMinute, prefs });
const at = (rs: Reminder[], d: number) => rs.filter((r) => new Date(r.at).getDate() === d).map((r) => `${String(new Date(r.at).getHours()).padStart(2, "0")}:${String(new Date(r.at).getMinutes()).padStart(2, "0")} ${r.title}`);

describe("reminder plan", () => {
  it("a day with nothing logged yet, seen at 07:00", () => {
    expect(at(plan(ctx(T(2, 7))), 2)).toEqual([
      "08:30 Morning stack",
      "09:30 Morning weigh-in",
      "13:00 How now? · Midday stack", // 13:00 and 13:30: one buzz, not two
      "17:30 How now?",
      "21:00 How was today?",
      "22:00 Evening stack",
    ]);
  });

  it("rating at 12:50 cancels the 13:00 nudge; ticking theanine at midday drops it from the merge", () => {
    const es: Entry[] = [
      { id: "f", kind: "feel", at: T(2, 12, 50), mood: 7 },
      { id: "t", kind: "supp", at: T(2, 13, 5), suppId: "lth", status: "taken", slot: "midday" },
    ];
    const today = at(plan(ctx(T(2, 13, 6), es)), 2);
    expect(today.some((s) => s.includes("How now?") && s.startsWith("13:00"))).toBe(false);
    expect(today.some((s) => s.includes("Midday stack"))).toBe(false);
    expect(today[0]).toBe("17:30 How now?");
  });

  it("weighed already: no weigh-in today, but tomorrow's is planned", () => {
    const rs = plan(ctx(T(2, 9), [{ id: "w", kind: "weight", at: T(2, 7, 30), kg: 71.95 }]));
    expect(at(rs, 2).some((s) => s.includes("weigh-in"))).toBe(false);
    expect(at(rs, 3)).toContain("09:30 Morning weigh-in");
  });

  it("quiet hours: nothing before 08:00, nothing from 15 min before bedtime", () => {
    const rs = plan(ctx(T(2, 7), [], DEFAULT_NOTIFY, 21 * 60 + 10)); // bed 21:10
    expect(at(rs, 2).some((s) => s.startsWith("21:00") || s.startsWith("22:00"))).toBe(false);
    expect(rs.every((r) => new Date(r.at).getHours() >= 8)).toBe(true);
  });

  it("bedtime after midnight keeps the evening ones", () => {
    expect(at(plan(ctx(T(2, 7), [], DEFAULT_NOTIFY, 30)), 2)).toContain("22:00 Evening stack");
  });

  it("each kind can be switched off", () => {
    const rs = plan(ctx(T(2, 7), [], { checkins: false, supps: true, weigh: false }));
    expect(rs.every((r) => r.tag.startsWith("supp"))).toBe(true);
  });

  it("looks 48 h ahead, never into the past, at most 6 a day", () => {
    const now = T(2, 14), rs = plan(ctx(now));
    expect(rs.every((r) => r.at > now && r.at <= now + 48 * 3_600_000)).toBe(true);
    for (const d of [2, 3, 4]) expect(rs.filter((r) => new Date(r.at).getDate() === d).length).toBeLessThanOrEqual(6);
    expect(at(rs, 4).length).toBeGreaterThan(0);
  });
});
