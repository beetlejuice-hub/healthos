import { describe, expect, it } from "vitest";
import { extrasOn, logIntake, takenCount } from "./supplog";
import { doseCompare } from "./dose";
import type { Entry, EntryOf, Supplement } from "./types";

const at = (h: number, m = 0, d = 13) => new Date(2026, 9, d, h, m).getTime();
const mag: Supplement = { id: "mag", name: "Magnesium", dose: "200 mg", slot: "evening", at: 21 * 60 + 30, active: true };
const d3: Supplement = { id: "d3", name: "Vitamin D3", dose: "2000 IU", slot: "morning", slots: ["morning", "midday"], at: 8 * 60, active: true };
let n = 0;
const apply = (es: Entry[], s: Supplement, t: number): Entry[] => {
  const r = logIntake(s, es, t);
  return r.op === "add" ? [...es, { ...r.entry, id: `e${++n}` } as Entry] : es.map((e) => (e.id === r.id ? ({ ...e, ...r.patch } as Entry) : e));
};
const supp = (es: Entry[]) => es.filter((e): e is EntryOf<"supp"> => e.kind === "supp");

describe("supplements logged like food (PLAN 87)", () => {
  it("in its planned slot and not answered yet, the tap is the plan's tick — not an extra", () => {
    const es = apply([], mag, at(22));
    expect(supp(es)).toMatchObject([{ suppId: "mag", status: "taken", slot: "evening" }]);
    expect(supp(es)[0].again).toBeUndefined();
    expect(extrasOn(es, [mag], "2026-10-13")).toHaveLength(0);
  });
  it("morning and night: twice a day, each counted; the second in the same slot is 'again'", () => {
    let es = apply([], mag, at(8)); // not planned in the morning: an extra, in the morning
    es = apply(es, mag, at(22)); // the planned evening tick
    es = apply(es, mag, at(23, 30)); // and once more that evening
    expect(supp(es).map((e) => [e.slot, e.again ?? false])).toEqual([["morning", false], ["evening", false], ["evening", true]]);
    expect(takenCount(es, "2026-10-13").get("mag")).toBe(3);
    expect(extrasOn(es, [mag], "2026-10-13").map((e) => e.slot)).toEqual(["morning", "evening"]);
  });
  it("answered 'didn't take', then taken after all: the answer flips, no second entry", () => {
    const es0: Entry[] = [{ id: "s1", kind: "supp", at: at(8), suppId: "d3", status: "skipped", slot: "morning" }];
    const es = apply(es0, d3, at(9, 30));
    expect(supp(es)).toHaveLength(1);
    expect(supp(es)[0]).toMatchObject({ id: "s1", status: "taken", at: at(9, 30) });
  });
  it("a tap the next day starts a new day: no 'again'", () => {
    const es = apply(apply([], mag, at(22, 0, 12)), mag, at(22, 0, 13));
    expect(supp(es).every((e) => !e.again)).toBe(true);
  });
  it("a day's dose adds the intakes taken again on top; the same slot ticked twice still counts once", () => {
    // 4 days at one capsule (200 mg), 4 days with a second one that night (400 mg)
    let es: Entry[] = [];
    for (let d = 1; d <= 8; d++) {
      es.push({ id: `t${d}`, kind: "supp", at: at(21, 30, d), suppId: "mag", status: "taken", slot: "evening" });
      if (d > 4) es.push({ id: `a${d}`, kind: "supp", at: at(23, 0, d), suppId: "mag", status: "taken", slot: "evening", again: true });
    }
    // a double tick (old data): the same slot twice, no `again` — one intake
    es.push({ id: "dup", kind: "supp", at: at(21, 40, 1), suppId: "mag", status: "taken", slot: "evening" });
    es = es.sort((a, b) => a.at - b.at);
    const c = doseCompare(es, [mag]).find((x) => x.suppId === "mag")!;
    expect(c.hi).toEqual({ dose: "400 mg", days: 4 }); expect(c.lo).toEqual({ dose: "200 mg", days: 4 });
  });
});
