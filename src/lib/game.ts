/**
 * The game: weekly goals and one week score (PLAN 203; owner, 9 Nov: "add a some type of gamifying, to push me to be
 * better, drink less, sleep better, eat less abd healthier, lift more … be momre consistent w supps"; 10 Nov, to "points
 * and levels, streaks and quests, or one week score?": weekly goals plus one week score — "1 yes"). Pure.
 *
 * Each Monday, up to five goals from your own last 4 weeks — a notch past what you've been doing, never a jump:
 *   drinks    "N drinks or fewer": your usual week (the middle of the 4) less a quarter (at least 1); only when you
 *             drink 2+ a week
 *   bed       "In bed by 23:30" on 5 nights: your usual bedtime less 15 minutes, on the quarter hour, not before 22:30;
 *             from the band's nights (10+ in the 4 weeks)
 *   protein   "140 g protein" on one day more than your usual week has (3 to 6 days); your protein goal, 10+ logged days
 *   stack     "The stack, every day": 6 of 7 days with every supplement due that day ticked — one free miss
 *   sessions  "N sessions": your usual week's (1–6)
 * 20 points each, so a week is out of 100 when all five apply (fewer goals: scaled to 100). Mid-week it says the points
 * so far and what you're on pace for (the same rate to Sunday), so a Tuesday isn't a 20. Drinks count as you go: within
 * the goal, its points grow with the days; one over, half; more, none.
 */

import { byDay } from "./nutrition";
import { dueOn } from "./schedule";
import { addDays, localDay } from "./time";
import type { Entry, Supplement } from "./types";

export const GAME = { weeks: 4, pts: 20, minDrinks: 2, minNights: 10, minLogged: 10, earliestBed: 22.5, bedNights: 5, stackDays: 6 } as const;

export type GoalId = "drinks" | "bed" | "protein" | "stack" | "sessions";
export type Goal = { id: GoalId; title: string; detail: string; kind: "atMost" | "days" | "count"; target: number; need: number; /** bed: hours from the evening's midnight */ at?: number };
export type Progress = Goal & {
  /** So far: drinks drunk, days hit, sessions done. */ done: number;
  /** Each day Mon–Sun: hit, missed, or not decided yet (null) — for days goals. */ days: (boolean | null)[];
  pts: number; pace: number;
};
export type Week = { from: string; dayN: number; goals: Progress[]; score: number; pace: number; last: number | null; streak: number | null };

export type Inputs = {
  entries: Entry[]; supplements: Supplement[];
  workouts: { startedAt: number; endedAt: number | null }[];
  /** Bedtimes from the band's nights: the evening's day and the hour (23.5 = 23:30, 24.25 = 00:15). */ beds: { eve: string; h: number }[];
  proteinGoal: number;
};

/** The Monday of `day`'s week. */
export function monday(day: string): string {
  const d = new Date(`${day}T12:00:00`), back = (d.getDay() + 6) % 7;
  return addDays(day, -back);
}
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
const week7 = (from: string) => Array.from({ length: 7 }, (_, k) => addDays(from, k));
const hhmm = (h: number) => { const m = Math.round(h * 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

/** byDay once per entries list: the history below scores many weeks from the same entries. */
const days0 = new WeakMap<Entry[], ReturnType<typeof byDay>>();
const daysOf = (es: Entry[]) => { let d = days0.get(es); if (!d) { d = byDay(es); days0.set(es, d); } return d; };

const drinkDays = (es: Entry[]) => es.filter((e) => e.kind === "drink" && e.alcoholG > 0).map((e) => localDay(e.at));
function stackDay(inp: Inputs, day: string): boolean | null {
  const due = inp.supplements.filter((s) => s.active && dueOn(s, day));
  if (!due.length) return null;
  const took = new Set(inp.entries.filter((e) => e.kind === "supp" && e.status === "taken" && localDay(e.at) === day).map((e) => (e.kind === "supp" ? e.suppId : "")));
  return due.every((s) => took.has(s.id));
}

/** The week's goals, from the 4 weeks before `from` (a Monday). */
export function goalsFor(from: string, inp: Inputs): Goal[] {
  const weeks = Array.from({ length: GAME.weeks }, (_, k) => addDays(from, -7 * (k + 1)));
  const inWeek = (day: string, w: string) => day >= w && day < addDays(w, 7);
  const out: Goal[] = [];
  const dd = drinkDays(inp.entries), dw = median(weeks.map((w) => dd.filter((d) => inWeek(d, w)).length));
  if (dw >= GAME.minDrinks) { const t = Math.max(0, Math.round(dw) - Math.max(1, Math.round(dw * 0.25))); out.push({ id: "drinks", title: `${t} drinks or fewer`, detail: `usual ${Math.round(dw)} a week`, kind: "atMost", target: t, need: t }); }
  const beds = inp.beds.filter((b) => b.eve >= weeks[GAME.weeks - 1] && b.eve < from);
  if (beds.length >= GAME.minNights) {
    const m = median(beds.map((b) => b.h)), at = Math.max(GAME.earliestBed, Math.floor((m - 0.25) * 4) / 4);
    out.push({ id: "bed", title: `In bed by ${hhmm(at)}`, detail: `${GAME.bedNights} nights · usual ${hhmm(m)}`, kind: "days", target: GAME.bedNights, need: GAME.bedNights, at });
  }
  const days = daysOf(inp.entries), logged = [...days.values()].filter((d) => d.logged && d.day >= weeks[GAME.weeks - 1] && d.day < from);
  if (inp.proteinGoal > 0 && logged.length >= GAME.minLogged) {
    const hit = median(weeks.map((w) => logged.filter((d) => inWeek(d.day, w) && d.totals.p >= inp.proteinGoal).length));
    const need = Math.min(6, Math.max(3, Math.round(hit) + 1));
    out.push({ id: "protein", title: `${Math.round(inp.proteinGoal)} g protein`, detail: `${need} days · usual ${Math.round(hit)}`, kind: "days", target: need, need });
  }
  if (week7(from).some((d) => inp.supplements.some((s) => s.active && dueOn(s, d)))) out.push({ id: "stack", title: "The stack, every day", detail: "one free miss", kind: "days", target: GAME.stackDays, need: GAME.stackDays });
  const sw = median(weeks.map((w) => inp.workouts.filter((x) => x.endedAt != null && inWeek(localDay(x.startedAt), w)).length));
  if (sw >= 1) { const t = Math.min(6, Math.round(sw)); out.push({ id: "sessions", title: `${t} session${t === 1 ? "" : "s"}`, detail: "your usual week", kind: "count", target: t, need: t }); }
  return out;
}

/** One goal over its week up to `today` (today's day isn't decided until it's done, or over — `closed`: it's over). */
export function progress(g: Goal, from: string, today: string, inp: Inputs, closed = false): Progress {
  const ds = week7(from), dayN = Math.min(7, Math.max(1, ds.filter((d) => d <= today).length)), P = GAME.pts;
  if (g.kind === "atMost") {
    const done = drinkDays(inp.entries).filter((d) => d >= from && d <= today && d < addDays(from, 7)).length;
    const at = (n: number) => (n <= g.target ? P : n === g.target + 1 ? P / 2 : 0);
    return { ...g, done, days: ds.map(() => null), pts: Math.round(at(done) * (dayN / 7) * 10) / 10, pace: at(Math.round((done / dayN) * 7)) };
  }
  if (g.kind === "count") {
    const done = inp.workouts.filter((x) => x.endedAt != null && localDay(x.startedAt) >= from && localDay(x.startedAt) <= today && localDay(x.startedAt) < addDays(from, 7)).length;
    return { ...g, done, days: ds.map(() => null), pts: P * Math.min(1, done / g.need), pace: P * Math.min(1, ((done / dayN) * 7) / g.need) };
  }
  const hitOn = (d: string): boolean | null => {
    if (d > today) return null;
    const over = d < today || closed;
    if (g.id === "bed") { const b = inp.beds.find((x) => x.eve === d); return b ? b.h <= g.at! + 1 / 120 : over ? false : null; } // tonight isn't over
    if (g.id === "protein") { const p = daysOf(inp.entries).get(d)?.totals.p ?? 0; return p >= inp.proteinGoal ? true : over ? false : null; }
    const s = stackDay(inp, d); return s === true ? true : s === false && over ? false : null;
  };
  const days = ds.map(hitOn), done = days.filter((x) => x === true).length, decided = days.filter((x) => x !== null).length;
  const rate = decided ? done / decided : 1, left = days.filter((x) => x === null).length;
  return { ...g, done, days, pts: P * Math.min(1, done / g.need), pace: P * Math.min(1, (done + rate * left) / g.need) };
}

/** The stack's run of days up to today, one missed day a week let through (it doesn't count, and doesn't break it). */
export function stackStreak(inp: Inputs, today: string): number | null {
  if (!inp.supplements.some((s) => s.active)) return null;
  let n = 0, d = stackDay(inp, today) === true ? today : addDays(today, -1);
  const missed = new Set<string>();
  for (let k = 0; k < 400; k++, d = addDays(d, -1)) {
    const s = stackDay(inp, d);
    if (s === null) continue; // nothing due that day
    if (s) { n++; continue; }
    const w = monday(d);
    if (missed.has(w)) break;
    missed.add(w);
  }
  return n;
}

/** This week: its goals (from the 4 weeks before), each so far and on pace; the score out of 100; last week's; the stack's streak. Null with no goals. */
export function weekOf(today: string, inp: Inputs): Week | null {
  const from = monday(today), goals = goalsFor(from, inp).map((g) => progress(g, from, today, inp));
  if (!goals.length) return null;
  const scale = 100 / (goals.length * GAME.pts), dayN = week7(from).filter((d) => d <= today).length;
  const prev = addDays(from, -7), lastGoals = goalsFor(prev, inp).map((g) => progress(g, prev, addDays(from, -1), inp));
  return {
    from, dayN, goals,
    score: Math.round(goals.reduce((a, g) => a + g.pts, 0) * scale),
    pace: Math.round(goals.reduce((a, g) => a + g.pace, 0) * scale),
    last: lastGoals.length ? Math.round(lastGoals.reduce((a, g) => a + g.pts, 0) * (100 / (lastGoals.length * GAME.pts))) : null,
    streak: stackStreak(inp, today),
  };
}
