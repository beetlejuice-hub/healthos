// Owner, 27 Oct: "i had this weekend skipped fully... make sure app can still assume some things or recognize that im not
// logging anything, that means im still eating, and living just not logging" — "2 yes".
import { describe, expect, it } from "vitest";
import type { Entry } from "./types";
import { atMinute, addDays } from "./time";
import { ateEntries, daysWords, guessedKcal, isGap, openGap, usualBefore } from "./foodgaps";
import { measuredBurn } from "./energy";
import { glanceDays } from "./glance";
import { DEFAULT_SETTINGS } from "./store";
import { dayLine } from "./ai/context";
import { dailyFacts } from "./insights";

const TODAY = "2026-10-26"; // a Monday
let n = 0;
const food = (day: string, kcal: number, at = 13 * 60): Entry => ({ id: `f${n++}`, kind: "food", at: atMinute(day, at), name: "x", grams: 100, macros: { kcal, p: 30, c: 0, f: 0 } });
const coffee = (day: string): Entry => ({ id: `c${n++}`, kind: "drink", at: atMinute(day, 9 * 60), name: "Coffee", ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 });
const weigh = (day: string, kg: number): Entry => ({ id: `w${n++}`, kind: "weight", at: atMinute(day, 7 * 60), kg });
const weekend = (d: string) => new Date(`${d}T12:00:00`).getDay() % 6 === 0;
const answered = (es: Omit<Entry, "id">[]) => es.map((e, i) => ({ ...e, id: `a${i}` }) as Entry);

/** 5 weeks before today: weekdays logged at `kcal`; weekends as `wk` says (null: nothing at all). */
function life(kcal: number, wk: (d: string) => Entry[] = () => []): Entry[] {
  const out: Entry[] = [];
  for (let d = addDays(TODAY, -35); d < TODAY; d = addDays(d, 1)) out.push(...(weekend(d) ? wk(d) : [food(d, kcal)]));
  return out;
}

describe("days not logged (PLAN 174)", () => {
  it("a gap is under half your usual: nothing, a coffee, a breakfast — not a smaller day", () => {
    expect([isGap(null, 2300), isGap(2, 2300), isGap(600, 2300), isGap(1149, 2300), isGap(1150, 2300), isGap(1900, 2300)]).toEqual([true, true, true, true, false, false]);
  });
  it("planted: a weekend not logged is asked about on Monday — Sat–Sun, against your usual 2,300", () => {
    const g = openGap(life(2300), TODAY)!;
    expect(g).toMatchObject({ days: ["2026-10-24", "2026-10-25"], usual: 2300 });
    expect(daysWords(g.days, TODAY)).toBe("Sat 24 – Sun 25 Oct");
  });
  it("a coffee or only a breakfast is still not logged", () => {
    const es = life(2300, (d) => (d.endsWith("24") ? [coffee(d)] : d.endsWith("25") ? [food(d, 600, 9 * 60)] : []));
    // Sunday's breakfast is yesterday's: the catch-up asks about its missing meals this morning; Saturday's coffee is a gap
    expect(openGap(es, TODAY)!.days).toEqual(["2026-10-24"]);
    expect(openGap(es, "2026-10-27")!.days).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]); // Monday has nothing in this data either
  });
  it("control: every day logged — nothing to ask", () => {
    expect(openGap(life(2300, (d) => [food(d, 2600)]), TODAY)).toBeNull();
  });
  it("answered days aren't asked again; answering one leaves the other", () => {
    const es = life(2300);
    expect(openGap([...es, ...answered(ateEntries(["2026-10-24", "2026-10-25"], "more"))], TODAY)).toBeNull();
    expect(openGap([...es, ...answered(ateEntries(["2026-10-25"], "usual"))], TODAY)!.days).toEqual(["2026-10-24"]);
  });
  it("the latest run in the past week: Wednesday alone when the weekend's logged; one day says yesterday", () => {
    const es = life(2300, (d) => [food(d, 2400)]).filter((e) => !(e.kind === "food" && e.at >= atMinute("2026-10-21", 0) && e.at < atMinute("2026-10-22", 0)));
    expect(openGap(es, TODAY)!.days).toEqual(["2026-10-21"]);
    expect(daysWords(["2026-10-25"], TODAY)).toBe("yesterday");
    expect(daysWords(["2026-09-30", "2026-10-01"], "2026-10-05")).toBe("Wed 30 Sep – Thu 1 Oct");
  });
  it("yesterday with a meal or so logged is the morning catch-up's (\"No dinner logged · Log it\"), asked here from the day after; with nothing, here", () => {
    const es = life(2300, (d) => [food(d, 2400)]);
    const partYday = [...es.filter((e) => !(e.at >= atMinute("2026-10-25", 0))), food("2026-10-25", 800)];
    expect(openGap(partYday, TODAY)).toBeNull();
    expect(openGap(partYday, "2026-10-27")?.days).toEqual(["2026-10-25", "2026-10-26"]);
    const coffeeYday = [...es.filter((e) => !(e.at >= atMinute("2026-10-25", 0))), coffee("2026-10-25")];
    expect(openGap(coffeeYday, TODAY)?.days).toEqual(["2026-10-25"]);
  });
  it("no usual day to judge by (under 7 fully logged days in four weeks): nothing asked", () => {
    expect(openGap([food("2026-10-20", 2300), food("2026-10-21", 2300)], TODAY)).toBeNull();
  });
  it("what you said is a guess for the burn only: 'more' is your usual × 1.25; 'not sure' and a logged day stay as they are", () => {
    const es = [...life(2300), ...answered(ateEntries(["2026-10-24"], "more")), ...answered(ateEntries(["2026-10-25"], "unsure")), ...answered(ateEntries(["2026-10-23"], "less"))];
    expect(usualBefore(es, "2026-10-24")).toBe(2300);
    expect([guessedKcal(es, "2026-10-24", null), guessedKcal(es, "2026-10-25", null), guessedKcal(es, "2026-10-23", 2300)]).toEqual([2875, null, 2300]);
  });
  it("planted: weekdays 2,300 logged, weekends ~3,300 eaten and not logged, weight flat — a true burn of ~2,590. Saying 'more' moves the measured burn toward it", () => {
    const es = life(2300);
    for (let d = addDays(TODAY, -35), i = 0; d <= TODAY; d = addDays(d, 1), i++) es.push(weigh(d, 82 + [0.3, -0.2, 0.1, -0.3, 0.2, 0, -0.1][i % 7]));
    const blind = measuredBurn(es, TODAY)!.kcal;
    const said = [...es, ...answered(ateEntries(Array.from({ length: 28 }, (_, i) => addDays(TODAY, -i - 1)).filter(weekend), "more"))];
    const told = measuredBurn(said, TODAY)!.kcal;
    expect(Math.abs(blind - 2300)).toBeLessThanOrEqual(30); // only the logged days: too low
    expect(told).toBeGreaterThan(blind + 120); // 8 weekend days at 2,875
    expect(Math.abs(told - 2590)).toBeLessThan(Math.abs(blind - 2590));
  });
  it("the averages leave a barely logged day out: a coffee day isn't a 2 kcal day, a 600 breakfast isn't a 600 day", () => {
    const es = [...life(2300), coffee("2026-10-24"), food("2026-10-25", 600)];
    const g = glanceDays(es, [], DEFAULT_SETTINGS, "2026-10-19", "2026-10-25");
    expect(g.map((d) => d.kcal)).toEqual([2300, 2300, 2300, 2300, 2300, null, null]);
  });
  it("the AI reads a day not logged as not logged — never as eating little — with what you said", () => {
    const es = [...life(2300), food("2026-10-25", 600), ...answered(ateEntries(["2026-10-24"], "more"))];
    const [sat, sun, mon] = dailyFacts(es, [], DEFAULT_SETTINGS, "2026-10-24", "2026-10-26");
    const ctx = { usual: 2300, said: new Map([["2026-10-24", "more" as const]]) };
    expect(dayLine(sat, new Map(), ctx)).toContain("nothing logged (they still ate — just didn't log it) — they said: ate more than usual");
    expect(dayLine(sun, new Map(), ctx)).toContain("600 kcal logged — partly logged (their usual day is ~2300 kcal), not a day of eating little");
    expect(dayLine(mon, new Map(), ctx)).not.toContain("partly");
  });
});
