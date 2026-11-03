// How often a supplement is taken (PLAN 190; owner, 3 Nov: "Should be able to set supplements not as daily but cycling,
// taking only when needing it like l theanine so i should have rhe option to log it but not every day i need it").
// When needed: never on Today's list, never reminded, never asked about the next morning, never drafted — logged with "+"
// and shown when it is; its days without count as off days. A cycle: on the list on its on days only. Every day: as before.
import { describe, expect, it } from "vitest";
import { cycleOn, dueOn, scheduleToday, scheduleWords } from "./schedule";
import { nowItems } from "./today";
import { yesterdayGaps } from "./catchup";
import { extrasOn } from "./supplog";
import { plan, DEFAULT_NOTIFY } from "./push/plan";
import { suppByDay } from "./suppdays";
import type { Entry, Supplement } from "./types";

const cre: Supplement = { id: "cre", name: "Creatine", dose: "5 g", slot: "morning", at: 8 * 60, active: true };
const lth: Supplement = { id: "lth", name: "L-theanine", dose: "200 mg", slot: "morning", at: 8 * 60, active: true, schedule: { kind: "needed" } };
// Mon 2 Nov 2026 is the cycle's first day: on Mon–Fri, off Sat–Sun
const ash: Supplement = { id: "ash", name: "Ashwagandha", dose: "600 mg", slot: "evening", at: 21 * 60 + 30, active: true, schedule: { kind: "cycle", on: 5, off: 2, from: "2026-11-02" } };
const T = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();

describe("how often (PLAN 190)", () => {
  it("every day is due every day; when needed never; a cycle on its on days, before its start too", () => {
    expect(dueOn(cre, "2026-11-07")).toBe(true);
    expect(dueOn(lth, "2026-11-03")).toBe(false);
    expect(["02", "03", "04", "05", "06", "07", "08", "09"].map((d) => dueOn(ash, `2026-11-${d}`))).toEqual([true, true, true, true, true, false, false, true]);
    expect(dueOn(ash, "2026-11-01")).toBe(false); // the Sunday before: the stretch before it, off
    expect(cycleOn(ash.schedule as never, "2026-11-04")).toEqual({ on: true, dayOf: 3, of: 5, next: "2026-11-07" });
    expect(cycleOn(ash.schedule as never, "2026-11-08")).toEqual({ on: false, dayOf: 2, of: 2, next: "2026-11-09" });
  });
  it("in words", () => {
    expect([cre, lth, ash].map(scheduleWords)).toEqual(["every day", "when needed", "5 days on, 2 days off"]);
    expect(scheduleWords({ schedule: { kind: "cycle", on: 56, off: 28, from: "2026-11-02" } })).toBe("8 weeks on, 4 weeks off");
    expect(scheduleToday(ash, "2026-11-04")).toBe("on — day 3 of 5");
    expect(scheduleToday(ash, "2026-11-07")).toBe("off — back on Mon 9 Nov");
    expect(scheduleToday(lth, "2026-11-07")).toBe("log it when you take it");
  });
  it("Today's list: when needed is never there; a cycle's off day isn't; every day is", () => {
    const items = (d: number) => nowItems({ now: T(d, 23), entries: [], supplements: [cre, lth, ash], goals: { kcal: 2300, p: 150 } as never, bedMinute: 23 * 60 + 30, halfLifeMin: 300 })
      .filter((x) => x.kind === "supp-missed").flatMap((x) => (x.kind === "supp-missed" ? x.suppIds : []));
    expect(items(4)).toEqual(["cre", "ash"]);
    expect(items(7)).toEqual(["cre"]);
  });
  it("reminders: none for one taken when needed, none on a cycle's off day", () => {
    const rs = (d: number) => plan({ now: T(d, 7), entries: [], supplements: [cre, lth, ash], bedMinute: 23 * 60, prefs: DEFAULT_NOTIFY }).filter((r) => new Date(r.at).getDate() === d && /stack/i.test(r.title)).map((r) => r.body);
    expect(rs(4).join(" | ")).toMatch(/^Creatine 5 g: .* \| Ashwagandha 600 mg: /);
    expect(rs(7).join(" | ")).not.toMatch(/Ashwagandha|L-theanine/);
    expect(rs(4).join(" | ")).not.toMatch(/L-theanine/);
  });
  it("the next morning asks about yesterday's list only", () => {
    const had: Entry[] = [{ id: "a", kind: "supp", at: T(1, 8), suppId: "cre", status: "taken" }, { id: "b", kind: "supp", at: T(1, 8), suppId: "lth", status: "taken" }, { id: "c", kind: "supp", at: T(1, 21), suppId: "ash", status: "taken" }];
    const gaps = (today: string) => yesterdayGaps(had, [cre, lth, ash], today).filter((g) => g.kind === "supp").map((g) => (g as { suppId: string }).suppId);
    expect(gaps("2026-11-05")).toEqual(["cre", "ash"]); // Wed: on
    expect(gaps("2026-11-08")).toEqual(["cre"]); // Sat: off
  });
  it("logged when needed: shown with the day's stack as taken, and the days without it are off days for the engines", () => {
    const es: Entry[] = [{ id: "t1", kind: "supp", at: T(3, 15), suppId: "lth", status: "taken", slot: "midday" }, { id: "f", kind: "feel", at: T(4, 18), mood: 6 }];
    expect(extrasOn(es, [cre, lth, ash], "2026-11-03").map((e) => e.id)).toEqual(["t1"]);
    // the morning slot too (its slot is "morning" — still one it shows, not a tick it waits for)
    expect(extrasOn([{ id: "t2", kind: "supp", at: T(3, 8), suppId: "lth", status: "taken", slot: "morning" }], [lth], "2026-11-03").map((e) => e.id)).toEqual(["t2"]);
    const by = suppByDay(es, "2026-11-05");
    expect(by.get("2026-11-03")?.get("lth")).toBe(true);
    expect(by.get("2026-11-04")?.get("lth")).toBe(false);
  });
});
