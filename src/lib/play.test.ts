// PLAN 204/205 — the game: defend your 70, levels, ghosts, the week's focus, seasons, the stake; and the player card.
// Known answers from planted weeks (the same six weeks as game.test: 7 drinks a week, in bed at 23:50, 150 g protein
// Mon–Wed, the stack every day, sessions Mon/Wed/Fri) with last week planted good — in bed 23:20 every night, 4 drinks.
// Controls: a bad last week, a new account, a stake not owed, a card with too little to rate.
import { describe, expect, it } from "vitest";
import { cardOf, middle, rate } from "./card";
import { vo2At } from "./fitage";
import type { Inputs, Progress } from "./game";
import { costOf, focusOf, gameOf, ghosts, history, levelOf, PLAY, playWeek, seasonOf, stakeDue, track, type Past } from "./play";
import { addDays, atMinute } from "./time";
import type { Entry, Supplement } from "./types";

const TODAY = "2026-11-10", MON = "2026-11-09", LAST = "2026-11-02", START = "2026-09-28";
const CREA: Supplement = { id: "crea", name: "Creatine", dose: "5 g", slot: "morning", at: 8 * 60, active: true } as Supplement;
let n = 0;
const drink = (day: string): Entry => ({ id: `d${n++}`, kind: "drink", at: atMinute(day, 20 * 60), name: "Beer", ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 215 } as Entry);
const food = (day: string, p: number, min = 12 * 60): Entry => ({ id: `f${n++}`, kind: "food", at: atMinute(day, min), name: "Meal", grams: 400, macros: { kcal: 700, p, c: 60, f: 20 } } as Entry);
const supp = (day: string): Entry => ({ id: `s${n++}`, kind: "supp", at: atMinute(day, 8 * 60), suppId: "crea", status: "taken" } as Entry);
const wd = (d: string) => (new Date(`${d}T12:00:00`).getDay() + 6) % 7; // 0 = Monday

/** Six weeks up to this Monday; `good`: last week in bed at 23:20 and only 4 drinks (Mon–Thu). */
function world(good = true): Inputs {
  const entries: Entry[] = [], beds: Inputs["beds"] = [], workouts: Inputs["workouts"] = [];
  for (let d = START; d < MON; d = addDays(d, 1)) {
    const last = good && d >= LAST;
    if (!last || wd(d) < 4) entries.push(drink(d));
    entries.push(food(d, wd(d) < 3 ? 150 : 60), supp(d));
    beds.push({ eve: d, h: last ? 23 + 20 / 60 : 23 + 50 / 60 });
    if (wd(d) % 2 === 0 && wd(d) < 5) workouts.push({ startedAt: atMinute(d, 18 * 60), endedAt: atMinute(d, 19 * 60) });
  }
  return { entries, supplements: [CREA], workouts, beds, proteinGoal: 140 };
}
/** This week: Monday 1 drink, in bed 23:20, 150 g, the stack, a session; Tuesday the stack and 82 g so far. */
const thisWeek = (inp: Inputs, more: Entry[] = [], beds: Inputs["beds"] = []): Inputs => ({ ...inp,
  entries: [...inp.entries, drink(MON), food(MON, 150), supp(MON), supp(TODAY), food(TODAY, 82, 9 * 60), ...more],
  beds: [...inp.beds, { eve: MON, h: 23 + 20 / 60 }, ...beds],
  workouts: [...inp.workouts, { startedAt: atMinute(MON, 18 * 60), endedAt: atMinute(MON, 19 * 60) }] });

const days = (need: number, d: (boolean | null)[]): Progress => ({ id: "bed", title: "", detail: "", kind: "days", target: need, need, done: d.filter((x) => x === true).length, days: d, pts: 0, pace: 0 });

describe("defend your 70 (BE FIT: points you can lose)", () => {
  it("a days goal: misses within its spare days are free, each one past costs 10", () => {
    expect(costOf(days(5, [true, false, false, null, null, null, null]), 3, false)).toMatchObject({ lost: 0, spare: 0, risk: true });
    expect(costOf(days(5, [true, false, false, false, null, null, null]), 4, false)).toMatchObject({ lost: 10, spare: 0, risk: true });
    expect(costOf(days(5, [true, true, true, true, true, false, false]), 7, true)).toMatchObject({ lost: 0, met: true, risk: false });
  });
  it("drinks: each one over the goal costs 10; at the goal, the next one costs", () => {
    const d = (done: number): Progress => ({ ...days(5, []), id: "drinks", kind: "atMost", target: 5, need: 5, done, days: [] });
    expect(costOf(d(7), 5, false)).toMatchObject({ lost: 20 });
    expect(costOf(d(5), 4, false)).toMatchObject({ lost: 0, spare: 0, risk: true });
    expect(costOf(d(5), 7, true)).toMatchObject({ lost: 0, met: true, risk: false });
  });
  it("sessions: only once they can't fit any more", () => {
    const s = (done: number): Progress => ({ ...days(3, []), id: "sessions", kind: "count", target: 3, need: 3, done, days: [] });
    expect(costOf(s(1), 6, false)).toMatchObject({ lost: 0, spare: 0, risk: true }); // Saturday, 2 to go, Saturday and Sunday left
    expect(costOf(s(1), 7, true)).toMatchObject({ lost: 20 }); // Sunday's over
    expect(costOf(s(1), 3, false)).toMatchObject({ lost: 0, spare: 3, risk: false });
  });
  it("this Tuesday: nothing lost yet — 70; Tuesday over with nothing more: still 70 (spare days)", () => {
    const inp = thisWeek(world());
    expect(playWeek(MON, TODAY, inp)!.points).toBe(70);
    const closed = playWeek(MON, TODAY, inp, true)!;
    expect(closed.points).toBe(70);
    expect(closed.costs.map((c) => [c.id, c.spare])).toEqual([["drinks", 4], ["bed", 1], ["protein", 2], ["stack", 1], ["sessions", 3]]);
  });
  it("last week, planted good: protein 3 of 4 cost 10 → 60, day by day 70 … 60", () => {
    const past = history(TODAY, thisWeek(world())), last = past.at(-1)!;
    expect(last.from).toBe(LAST);
    expect(last.costs.map((c) => [c.id, c.lost])).toEqual([["drinks", 0], ["bed", 0], ["protein", 10], ["stack", 0], ["sessions", 0]]);
    expect(last.points).toBe(60);
    expect(track(LAST, world(), addDays(LAST, 6), true)).toEqual([70, 70, 70, 70, 70, 70, 60]);
  });
  it("control: last week bad — 7 drinks, never in bed by 23:30 — loses 80 and stops at 0", () => {
    const last = history(TODAY, world(false)).at(-1)!;
    expect(last.costs.map((c) => c.lost)).toEqual([20, 50, 10, 0, 0]);
    expect(last.points).toBe(0);
  });
  it("history starts the week you did: no weeks before the first thing logged (a stack goal would miss them all)", () => {
    const past = history(TODAY, thisWeek(world(false)));
    expect(past[0].from).toBe(START);
    expect(past.map((w) => w.points)).toEqual([70, 70, 0, 0, 0, 0]);
    expect(levelOf(past).level).toBe(1); // 1 → 2 → 3, then four weeks under 50: 2, 1, 1, 1
  });
  it("levels: 50+ kept up one, under 50 down one, never under 1", () => {
    const p = (pts: number[]) => pts.map((points) => ({ points }) as Past);
    expect(levelOf(p([60, 40, 55, 70]))).toEqual({ level: 3, best: 3 });
    expect(levelOf(p([40, 40]))).toEqual({ level: 1, best: 1 });
    expect(levelOf([])).toEqual({ level: 1, best: 1 });
  });
});

describe("ghosts (STEP UP: competition)", () => {
  it("you against last week's you at the same point: level on Tuesday", () => {
    const inp = thisWeek(world()), g = ghosts(TODAY, inp, history(TODAY, inp));
    expect(g.you).toEqual([70, 70]);
    expect(g.last).toEqual([70, 70, 70, 70, 70, 70, 60]);
    expect(g.vsLast).toBe(0);
    // the best: the first week, when only the stack was a goal (no weeks before it for the rest) — all 70 kept
    expect([g.bestFrom, g.bestPoints, g.vsBest]).toEqual([START, 70, 0]);
  });
  it("control: when last week is the best, one ghost, not two", () => {
    const best = { from: LAST, points: 60, track: [70, 70, 70, 70, 70, 70, 60] } as Past;
    expect(ghosts(TODAY, thisWeek(world()), [best]).best).toBeNull();
  });
  it("a best week that isn't last week races too", () => {
    const inp = thisWeek(world()), past = history(TODAY, inp);
    const best = { from: "2026-10-12", points: 70, track: [70, 70, 70, 70, 70, 70, 70] } as Past;
    const lost = { ...past.at(-1)!, track: [60, 50, 50, 40, 40, 40, 40], points: 40 } as Past;
    const g = ghosts(TODAY, { ...inp }, [best, lost]);
    expect([g.vsLast, g.vsBest, g.bestFrom, g.bestPoints]).toEqual([20, 0, "2026-10-12", 70]);
  });
});

describe("this week's focus (last week's weakest goal; plain words — no creatures, 10 Nov)", () => {
  it("protein (3 of 4 last week) is the focus: 75 % still to go on Tuesday; after it, drinks", () => {
    const inp = thisWeek(world()), past = history(TODAY, inp), f = focusOf(playWeek(MON, TODAY, inp)!, past.at(-1)!)!;
    expect([f.id, f.area, f.left, f.state, f.next]).toEqual(["protein", "Protein", 75, "on", "drinks"]);
  });
  it("done when the goal's met: protein on Thu, Fri and Sat → nothing left", () => {
    const sat = addDays(MON, 5), inp = thisWeek(world(), [food(addDays(MON, 3), 150), food(addDays(MON, 4), 150), food(sat, 150)]);
    const f = focusOf(playWeek(MON, sat, inp)!, history(TODAY, inp).at(-1)!)!;
    expect([f.left, f.state]).toEqual([0, "done"]);
  });
  it("control: after a bad week the focus is bedtime (0 of 5), missed once a third night's gone", () => {
    const inp = thisWeek(world(false)), last = history(TODAY, inp).at(-1)!;
    expect(focusOf(playWeek(MON, TODAY, inp)!, last)!.area).toBe("Bedtime");
    const thu = addDays(MON, 3), late = thisWeek(world(false), [], [1, 2, 3].map((k) => ({ eve: addDays(MON, k), h: 25 })));
    expect(focusOf(playWeek(MON, thu, late, true)!, last)!.state).toBe("missed");
  });
  it("controls: no last week, or a last week that met every goal — no focus", () => {
    const now = playWeek(MON, TODAY, thisWeek(world()))!;
    expect(focusOf(now, null)).toBeNull();
    const all = history(TODAY, thisWeek(world())).find((w) => w.points === 70 && w.costs.every((c) => c.met))!;
    expect(focusOf(now, all)).toBeNull();
  });
});

describe("seasons (fresh starts; games fade unless they change)", () => {
  it("season 1 is 2 Nov – 13 Dec; its area from its first week's focus (bedtime → Sleep); XP = points kept + 10 a night on time", () => {
    const inp = thisWeek(world()), past = history(TODAY, inp), s = seasonOf(TODAY, playWeek(MON, TODAY, inp), past);
    expect([s.n, s.from, s.to, s.week, s.name]).toEqual([1, LAST, "2026-12-13", 2, "Sleep"]);
    expect(s.xp).toBe(60 + 70 + 70 + 10); // last week 60 + 7 nights; this week 70 so far + Monday's night
    expect([s.tier, s.toNext]).toEqual([4, 40]);
  });
  it("the next season starts 14 Dec; before the first, it's season 1's first week", () => {
    expect(seasonOf("2026-12-15", null, []).from).toBe("2026-12-14");
    expect(seasonOf("2026-12-15", null, []).n).toBe(2);
    expect(seasonOf("2026-10-20", null, []).week).toBe(1);
  });
});

describe("the stake (a deposit you'd lose)", () => {
  const past = (points: number) => [{ from: LAST, points } as Past];
  it("owed when last week ended under 50 and it isn't done yet", () => {
    expect(stakeDue({ [LAST]: { what: "100 burpees" } }, past(40), TODAY)).toEqual({ from: LAST, what: "100 burpees" });
  });
  it("controls: 50+ kept, already done, or none set", () => {
    expect(stakeDue({ [LAST]: { what: "100 burpees" } }, past(50), TODAY)).toBeNull();
    expect(stakeDue({ [LAST]: { what: "100 burpees", paid: true } }, past(40), TODAY)).toBeNull();
    expect(stakeDue({}, past(40), TODAY)).toBeNull();
  });
});

describe("all of it", () => {
  it("gameOf: the week, level, ghosts, focus, season", () => {
    const g = gameOf(TODAY, thisWeek(world()))!;
    expect([g.now.points, g.level.level >= 1, g.focus?.id, g.season.name]).toEqual([70, true, "protein", "Sleep"]);
    expect(g.risk.map((c) => c.id)).toEqual([]);
  });
  it("control: a new account has no game", () => {
    expect(gameOf(TODAY, { entries: [], supplements: [], workouts: [], beds: [], proteinGoal: 140 })).toBeNull();
  });
  it("the numbers as set", () => {
    expect([PLAY.start, PLAY.miss, PLAY.keep]).toEqual([70, 10, 50]);
  });
});

describe("the player card (rated against the big studies)", () => {
  const avg = { vo2: vo2At(34, "male"), age: 34, sex: "male" as const, rhr: 65, asleepMin: 407, steps: 4961, strPerWeek: 0, kept: 35 };
  it("right at every average: 67s, overall 67, Silver, Gold at 75", () => {
    const c = cardOf(avg);
    expect(c.stats.map((s) => s.rating)).toEqual([67, 67, 67, 67, 67, 67]);
    expect([c.ovr, c.tier, c.next]).toEqual([67, "Silver", { name: "Gold", at: 75 }]);
  });
  it("one spread better is 89, one worse 45; lower resting heart rate is better", () => {
    const c = cardOf({ ...avg, vo2: avg.vo2 + 8, rhr: 57, asleepMin: 407 - 48, steps: 4961 + 2684 });
    expect(c.stats.map((s) => s.rating)).toEqual([89, 89, 45, 89, 67, 67]);
    expect([c.weakest?.key, c.best?.key]).toEqual(["REC", "END"]);
  });
  it("the ends: 35 at the bottom, 99 at the top; Elite from 85", () => {
    expect([rate(0), rate(1), rate(0.5)]).toEqual([35, 99, 67]);
    expect(cardOf({ ...avg, vo2: avg.vo2 + 30, rhr: 40, asleepMin: 560, steps: 20000, strPerWeek: 3, kept: 70 }).tier).toBe("Elite");
  });
  it("controls: no age, no END; under 3 stats, no overall", () => {
    expect(cardOf({ ...avg, age: null }).stats[0]).toMatchObject({ rating: null, says: "needs your age" });
    expect(cardOf({ rhr: 60, steps: 8000 }).ovr).toBeNull();
    expect([middle([3, 1, 2]), middle([4, 1, 2, 3]), middle([])]).toEqual([2, 2.5, null]);
  });
});
