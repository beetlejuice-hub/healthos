/**
 * Your food over a week (PLAN 154; owner, 20 Oct: "need a bit better look for macro breakdwon, food, and trackking food
 * overall, looking back to yesterday too" — #128 did the day; this is the overall look). The 7 days ending on a day, each
 * with its calories and protein as Today's Food card counts them (food and drinks) and its plate score, and the week in
 * one line: finished days only (today isn't over), days that count are days food was logged. Pure.
 */

import type { Entry, Food, Goals } from "./types";
import { foodDay } from "./foodday";
import { foodFor, itemScore, FOOD_SCORE } from "./foodscore";
import { macrosOf } from "./nutrition";
import { addDays } from "./time";

export const FOOD_WEEK = {
  days: 7,
  /** Protein "hit" from this share of the goal: 158 g of 160 is a hit, not a miss. */
  proteinHit: 0.95,
  /** A day's plate score needs this share of its calories scored; less, and one known plate would speak for the day. */
  scoredShare: 0.7,
};

export type WeekDay = {
  day: string;
  /** Food was logged that day — else it's unknown, not zero. */
  logged: boolean;
  /** Today, so far. */
  partial: boolean;
  kcal: number; p: number;
  /** Everything eaten that day, weighed by calories; null when too little of it has a score. */
  score: number | null;
};

/** The `n` days ending on `end` (oldest first). */
export function foodWeek(entries: Entry[], foods: Food[], bedMinute: number, end: string, today: string, n = FOOD_WEEK.days): WeekDay[] {
  const out: WeekDay[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = addDays(end, -i), d = foodDay(entries, day);
    let all = 0, scored = 0, sum = 0;
    for (const e of d.meals.flatMap((m) => m.items)) {
      const kcal = macrosOf(e)!.kcal;
      if (kcal < FOOD_SCORE.minKcal) continue;
      all += kcal;
      const s = itemScore(e, foodFor(e, foods), bedMinute)?.score;
      if (s != null) { scored += kcal; sum += kcal * s; }
    }
    const logged = d.meals.some((m) => m.items.some((e) => e.kind === "food"));
    out.push({ day, logged, partial: day === today, kcal: d.totals.kcal, p: d.totals.p, score: all && scored >= all * FOOD_WEEK.scoredShare ? Math.round(sum / scored) : null });
  }
  return out;
}

export type WeekRead = {
  /** Finished, logged days the line is about. */
  n: number;
  kcal: number | null; p: number | null; score: number | null;
  /** Of the `n` days: at or under the calorie goal, and protein at goal. */
  underKcal: number; hitP: number;
};

/** The week in one line: averages of finished logged days, and how many met each goal. */
export function weekRead(week: WeekDay[], goals: Pick<Goals, "kcal" | "p">): WeekRead {
  const done = week.filter((d) => d.logged && !d.partial), n = done.length;
  const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  const scores = done.map((d) => d.score).filter((s): s is number => s != null);
  return {
    n, kcal: avg(done.map((d) => d.kcal)), p: avg(done.map((d) => d.p)), score: scores.length ? Math.round(avg(scores)!) : null,
    underKcal: done.filter((d) => d.kcal <= goals.kcal).length, hitP: done.filter((d) => d.p >= goals.p * FOOD_WEEK.proteinHit).length,
  };
}
