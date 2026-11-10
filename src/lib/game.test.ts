// PLAN 203 — the game: weekly goals and one week score (owner, 10 Nov: "1 yes" to weekly goals plus one week score).
// Known answers from a planted six weeks — 7 drinks a week, in bed at 23:50, 140 g protein on 3 days, the stack every day,
// 3 sessions — and this week's Monday and Tuesday: the goals (5 drinks or fewer, bed by 23:30, 140 g on 4 days, the
// stack, 3 sessions), the points so far, the pace, last week's score. Controls: a new account has no game; no drinks or
// no band leaves those goals out; the drinks goal at its edges; a stack streak lets one miss a week through, not two.
import { describe, expect, it } from "vitest";
import { GAME, goalsFor, monday, progress, stackStreak, weekOf, type Inputs } from "./game";
import { addDays, atMinute } from "./time";
import type { Entry, Supplement } from "./types";

const TODAY = "2026-11-10", MON = "2026-11-09", START = "2026-09-28"; // six full weeks before this one
const CREA: Supplement = { id: "crea", name: "Creatine", dose: "5 g", slot: "morning", at: 8 * 60, active: true } as Supplement;
let n = 0;
const drink = (day: string): Entry => ({ id: `d${n++}`, kind: "drink", at: atMinute(day, 20 * 60), name: "Beer", ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 215 } as Entry);
const food = (day: string, p: number, min = 12 * 60): Entry => ({ id: `f${n++}`, kind: "food", at: atMinute(day, min), name: "Meal", grams: 400, macros: { kcal: 700, p, c: 60, f: 20 } } as Entry);
const supp = (day: string): Entry => ({ id: `s${n++}`, kind: "supp", at: atMinute(day, 8 * 60), suppId: "crea", status: "taken" } as Entry);

/** Six weeks of habits from START up to `until` (exclusive), then whatever `extra` adds. */
function world(o: { drinks?: boolean; band?: boolean; supps?: boolean; until?: string } = {}): Inputs {
  const entries: Entry[] = [], beds: Inputs["beds"] = [], workouts: Inputs["workouts"] = [];
  for (let d = START; d < (o.until ?? MON); d = addDays(d, 1)) {
    const wd = (new Date(`${d}T12:00:00`).getDay() + 6) % 7; // 0 = Monday
    if (o.drinks !== false) entries.push(drink(d));
    entries.push(food(d, wd < 3 ? 150 : 60));
    if (o.supps !== false) entries.push(supp(d));
    if (o.band !== false) beds.push({ eve: d, h: 23 + 50 / 60 });
    if (wd === 0 || wd === 2 || wd === 4) workouts.push({ startedAt: atMinute(d, 18 * 60), endedAt: atMinute(d, 19 * 60) });
  }
  return { entries, supplements: o.supps === false ? [] : [CREA], workouts, beds, proteinGoal: 140 };
}
/** This week so far: Monday 1 drink, in bed 23:20, 150 g protein, the stack, a session; Tuesday the stack, 82 g so far. */
function thisWeek(inp: Inputs): Inputs {
  return { ...inp,
    entries: [...inp.entries, drink(MON), food(MON, 150), supp(MON), supp(TODAY), food(TODAY, 82, 9 * 60)],
    beds: [...inp.beds, { eve: MON, h: 23 + 20 / 60 }],
    workouts: [...inp.workouts, { startedAt: atMinute(MON, 18 * 60), endedAt: atMinute(MON, 19 * 60) }] };
}

describe("the game: weekly goals, one week score", () => {
  it("the week starts on Monday", () => {
    expect([monday("2026-11-09"), monday("2026-11-10"), monday("2026-11-15"), monday("2026-11-16")]).toEqual(["2026-11-09", "2026-11-09", "2026-11-09", "2026-11-16"]);
  });
  it("goals from the 4 weeks before, a notch past them", () => {
    const g = goalsFor(MON, world());
    expect(g.map((x) => [x.id, x.title, x.detail])).toEqual([
      ["drinks", "5 drinks or fewer", "usual 7 a week"],
      ["bed", "In bed by 23:30", "5 nights · usual 23:50"],
      ["protein", "140 g protein", "4 days · usual 3"],
      ["stack", "The stack, every day", "one free miss"],
      ["sessions", "3 sessions", "your usual week"],
    ]);
  });
  it("Tuesday: the points so far, and the pace", () => {
    const inp = thisWeek(world()), w = weekOf(TODAY, inp)!;
    expect(w.dayN).toBe(2);
    expect(w.goals.map((g) => [g.id, g.done, Math.round(g.pts * 10) / 10, Math.round(g.pace)])).toEqual([
      ["drinks", 1, 5.7, 20], ["bed", 1, 4, 20], ["protein", 1, 5, 20], ["stack", 2, 6.7, 20], ["sessions", 1, 6.7, 20],
    ]);
    expect([w.score, w.pace]).toEqual([28, 100]);
    // today isn't decided until it's done: protein's Tuesday is open (82 of 140 so far), the stack's is done
    expect(w.goals.find((g) => g.id === "protein")!.days.slice(0, 3)).toEqual([true, null, null]);
    expect(w.goals.find((g) => g.id === "stack")!.days.slice(0, 3)).toEqual([true, true, null]);
  });
  it("last week, scored the same way: 7 drinks (none), bed never by 23:30 (none), protein 3 of 4, the stack, 3 sessions → 55", () => {
    expect(weekOf(TODAY, thisWeek(world()))!.last).toBe(55);
  });
  it("drinks at the week's end: within the goal all 20, one over half, more none", () => {
    const g = goalsFor(MON, world()).find((x) => x.id === "drinks")!, base = world(), sun = addDays(MON, 6);
    const end = (k: number) => progress(g, MON, sun, { ...base, entries: [...base.entries, ...Array.from({ length: k }, () => drink(addDays(MON, 3)))] }).pts;
    expect([end(5), end(6), end(7)]).toEqual([20, 10, 0]);
  });
  it("control: a new account has no game", () => {
    expect(weekOf(TODAY, { entries: [], supplements: [], workouts: [], beds: [], proteinGoal: 140 })).toBeNull();
  });
  it("control: no drinks, or no band, leaves those goals out — the rest scaled to 100", () => {
    const ids = (inp: Inputs) => goalsFor(MON, inp).map((g) => g.id);
    expect(ids(world({ drinks: false }))).toEqual(["bed", "protein", "stack", "sessions"]);
    expect(ids(world({ band: false }))).toEqual(["drinks", "protein", "stack", "sessions"]);
    const w = weekOf(addDays(MON, 6), { ...world({ drinks: false, band: false }), entries: [...world({ drinks: false, band: false }).entries] })!;
    expect(w.goals.length).toBe(3);
    expect(w.score).toBeLessThanOrEqual(100);
  });
  it("the stack's streak: one missed day a week is let through, a second breaks it", () => {
    const base = world({ until: TODAY });
    expect(stackStreak(base, TODAY)).toBe(43); // 28 Sep – 9 Nov, every day
    const one = { ...base, entries: base.entries.filter((e) => !(e.kind === "supp" && e.at === atMinute("2026-11-04", 8 * 60))) };
    expect(stackStreak(one, TODAY)).toBe(42); // the Wednesday missed: not counted, not broken
    const two = { ...one, entries: one.entries.filter((e) => !(e.kind === "supp" && e.at === atMinute("2026-11-05", 8 * 60))) };
    expect(stackStreak(two, TODAY)).toBe(4); // Thursday too: back to the days after it (6–9 Nov)
    expect(stackStreak({ ...base, supplements: [] }, TODAY)).toBeNull();
  });
  it("points per goal as set", () => {
    expect(GAME.pts * 5).toBe(100);
  });
});
