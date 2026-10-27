// PLAN 177, body lab 9 — owner, 27 Oct: ghost logging "okay?"; "not really, i eat different stuff".
import { describe, expect, it } from "vitest";
import { ghostAnswers, ghostDrafts } from "./ghost";
import { addDays, atMinute } from "./time";
import type { Entry, Supplement } from "./types";

const today = "2026-10-27"; // Tue; Sat 24 and Sun 25 not logged, Mon 26 logged
const supps: Supplement[] = [
  { id: "cre", name: "Creatine", dose: "5 g", slot: "morning", at: 8 * 60, active: true },
  { id: "vitd", name: "Vitamin D3", dose: "2000 IU", slot: "morning", at: 8 * 60, active: true },
];
let n = 0;
const drink = (day: string, min: number, name = "Flat white") => ({ id: `d${n++}`, kind: "drink", at: atMinute(day, min), name, ml: 200, caffeineMg: 80, alcoholG: 0, kcal: 110 }) as Entry;
const food = (day: string, min: number, name: string, kcal = 700) => ({ id: `f${n++}`, kind: "food", at: atMinute(day, min), name, grams: 300, macros: { kcal, p: 30, c: 80, f: 25 } }) as Entry;
const supp = (day: string, id: string) => ({ id: `s${n++}`, kind: "supp", at: atMinute(day, 8 * 60 + 5), suppId: id, status: "taken", slot: "morning" }) as Entry;
/** 21 logged days (3–23 Oct) and Mon 26: a flat white ~09:10 every day, a 2nd at ~14:30 on 16 of 21, the morning stack, food different every day, pancakes every Saturday. */
function log(o: { random?: boolean } = {}): Entry[] {
  const es: Entry[] = [];
  const days = [...Array.from({ length: 21 }, (_, i) => addDays("2026-10-03", i)), "2026-10-26"];
  days.forEach((d, i) => {
    if (!o.random || i % 2 === 0) es.push(drink(d, 9 * 60 + 5 + (i % 3) * 5));
    if (!o.random && i % 4 !== 3) es.push(drink(d, 14 * 60 + 30));
    if (!o.random || i % 3 === 0) { es.push(supp(d, "cre")); es.push(supp(d, "vitd")); }
    es.push(food(d, 13 * 60, `lunch ${i}`, 900), food(d, 19 * 60 + 30, `dinner ${i}`, 1000));
    if (new Date(`${d}T12:00:00`).getDay() === 6) es.push(food(d, 10 * 60 + 30, "Pancakes", 500));
  });
  return es;
}
const titles = (es: Entry[], day: string) => ghostDrafts(es, supps, today)!.drafts.filter((d) => d.day === day).map((d) => d.title);

describe("ghost logging (PLAN 177)", () => {
  it("the weekend not logged: what you do every day, at its usual time — the 2nd coffee too, the morning stack as one line", () => {
    const g = ghostDrafts(log(), supps, today)!;
    expect(g.days).toEqual(["2026-10-24", "2026-10-25"]);
    expect(titles(log(), "2026-10-25")).toEqual(["08:05 · Morning stack: Creatine, Vitamin D3", "09:10 · Flat white", "14:30 · Flat white"]);
    const fw = g.drafts.find((d) => d.day === "2026-10-25" && d.title === "09:10 · Flat white")!;
    expect(fw.why).toBe("your usual — 21 of your last 21 logged days");
    expect(fw.entries).toHaveLength(1); expect(fw.entries[0]).toMatchObject({ kind: "drink", name: "Flat white", at: atMinute("2026-10-25", 9 * 60 + 10) });
    expect(g.drafts.find((d) => d.title === "14:30 · Flat white")!.why).toBe("your usual — 16 of your last 21 logged days");
    expect(g.drafts.find((d) => d.day === "2026-10-25" && /stack/.test(d.title))!.why).toBe("your usual — all of your last 21 logged days");
    expect(g.drafts.find((d) => /Pancakes/.test(d.title))!.kcal).toBe(500); expect(fw.kcal).toBeNull();
  });
  it("food you vary is never drafted; a Saturday thing only on Saturday", () => {
    expect(titles(log(), "2026-10-24")).toContain("10:30 · Pancakes");
    expect(ghostDrafts(log(), supps, today)!.drafts.find((d) => d.title === "10:30 · Pancakes")!.why).toBe("3 of your last 3 Saturdays");
    expect(titles(log(), "2026-10-25")).not.toContain("10:30 · Pancakes");
    expect(ghostDrafts(log(), supps, today)!.drafts.some((d) => /lunch|dinner/.test(d.title))).toBe(false);
  });
  it("what's already logged that day isn't drafted again", () => {
    const es = [...log(), drink("2026-10-25", 10 * 60)];
    expect(titles(es, "2026-10-25")).toEqual(["08:05 · Morning stack: Creatine, Vitamin D3", "14:30 · Flat white"]);
  });
  it("a day answered (kept or none) isn't drafted again; both answered — nothing", () => {
    const one = [...log(), ...ghostAnswers(["2026-10-24"], 3).map((e, i) => ({ ...e, id: `a${i}` }) as Entry)];
    expect(ghostDrafts(one, supps, today)!.days).toEqual(["2026-10-25"]);
    const both = [...log(), ...ghostAnswers(["2026-10-24", "2026-10-25"], 0).map((e, i) => ({ ...e, id: `b${i}` }) as Entry)];
    expect(ghostDrafts(both, supps, today)).toBeNull();
  });
  it("control: nothing done 7 in 10 days — no drafts (half the days isn't usual)", () => {
    const g = ghostDrafts(log({ random: true }), supps, today)!;
    expect(g.drafts.filter((d) => !/Pancakes/.test(d.title))).toEqual([]);
  });
  it("too few logged days to know what's usual — no drafts", () => {
    const short = log().filter((e) => e.at >= atMinute("2026-10-19", 0));
    expect(ghostDrafts(short, supps, today)?.drafts ?? []).toEqual([]);
  });
});
