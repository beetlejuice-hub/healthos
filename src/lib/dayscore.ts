/**
 * Your food over a whole day, out of 100 (owner, 21 Oct: "food notrution score can be bult too" … "do whatever" — the
 * day score first, short on Today, the breakdown in Insights → Intake). #139 scores each food and plate; this is the
 * day they add up to, built like readiness — each part with its points and why, a part the data can't judge left out and
 * named, the rest scaled to 100. Worked out by the app; nothing to type. Goal first (fat loss with muscle kept):
 *
 *   Protein 25        grams against your goal: full at the goal, none at half of it.
 *   Protein spread 10 meals with 25 g or more (muscle is built better from several hits than one big one):
 *                     3+ full, 2 → 7, 1 → 3.
 *   Calories 15       against your goal: full from 85 % to 110 % of it; none at 130 % — or at 60 %, a deficit too deep to
 *                     keep muscle on.
 *   Fibre 15          grams against 30 g (EFSA's adequate intake): full at 30, straight down to none.
 *   Plants 15         fruit, vegetables and legumes, grams against 400 g (WHO's "5 a day").
 *   Limits 10         salt under 5 g (WHO), saturated fat under 10 % of calories, sugar under 90 g (the EU reference
 *                     intake for total sugars): a third each, full under the limit, none at 1.5× it.
 *   Last meal 5       3 h or more before bed full, 1 h or less none (#139's timing).
 *   Alcohol 5         none full, 30 g (two pints) or more none.
 *
 * Fibre, plants and limits need the foods' nutrients (the built-in table, the AI's look-ups, a scanned pack): they count
 * only when foods with nutrients make up 70 % of the day's calories — otherwise they're left out and named. A day under
 * 1,000 kcal logged isn't scored: it's a day not logged in full, not a day of eating little. Never "bad food". Pure.
 */

import type { Entry, Food } from "./types";
import { foodDay } from "./foodday";
import { foodFor, hoursBeforeBed } from "./foodscore";
import { macrosOf } from "./nutrition";
import { localDay } from "./time";

export const DAY_SCORE = {
  protein: 25, spread: 10, kcal: 15, fiber: 15, plants: 15, limits: 10, late: 5, alcohol: 5,
  minKcal: 1000, coverage: 0.7, mealP: 25, fiberG: 30, plantsG: 400, saltG: 5, satFatPct: 10, sugarG: 90, alcoholG: 30,
} as const;

type Zone = "ideal" | "fair" | "poor";
export type DayPartId = "protein" | "spread" | "kcal" | "fiber" | "plants" | "limits" | "late" | "alcohol";
export type DayPart = { id: DayPartId; name: string; got: number; max: number; why: string; zone: Zone };
export type DayScore = { day: string; score: number; word: string; parts: DayPart[]; left: { id: DayPartId; name: string; max: number; why: string }[]; kcal: number;
  /** Share of the day's calories with nutrients known. */ known: number };

const curve = (pts: [number, number][], x: number) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0); }
  return pts[pts.length - 1][1];
};
const r1 = (v: number) => Math.round(v * 10) / 10;
const g0 = (v: number) => Math.round(v).toLocaleString("en-GB");
export const dayWord = (s: number) => (s >= 85 ? "great" : s >= 70 ? "good" : s >= 55 ? "fair" : "off goal");

/** The day `day`'s food score, or null under 1,000 kcal logged. */
export function dayScore(entries: Entry[], foods: Food[], goals: { kcal: number; p: number }, bedMinute: number, day: string): DayScore | null {
  const fd = foodDay(entries, day), items = fd.meals.flatMap((m) => m.items), kcal = fd.totals.kcal;
  if (kcal < DAY_SCORE.minKcal) return null;
  const parts: DayPart[] = [], left: DayScore["left"] = [];
  const part = (id: DayPartId, name: string, max: number, frac: number, why: string) =>
    parts.push({ id, name, max, got: r1(max * Math.max(0, Math.min(1, frac))), why, zone: frac >= 0.8 ? "ideal" : frac >= 0.5 ? "fair" : "poor" });

  // protein: the day's grams, and the meals that had 25 g or more
  const p = fd.totals.p;
  part("protein", "Protein", DAY_SCORE.protein, curve([[0.5, 0], [1, 1]], p / Math.max(1, goals.p)), `${g0(p)} g of ${g0(goals.p)}`);
  const hits = fd.meals.filter((m) => m.items.reduce((a, e) => a + (macrosOf(e)?.p ?? 0), 0) >= DAY_SCORE.mealP).length;
  part("spread", "Protein spread", DAY_SCORE.spread, [0, 0.3, 0.7, 1][Math.min(3, hits)], `${hits} meal${hits === 1 ? "" : "s"} with ${DAY_SCORE.mealP} g or more`);
  // calories against the goal: over costs, and so does a deficit too deep to keep muscle on
  const ratio = kcal / Math.max(1, goals.kcal), pct = Math.round((ratio - 1) * 100);
  part("kcal", "Calories", DAY_SCORE.kcal, curve([[0.6, 0], [0.85, 1], [1.1, 1], [1.3, 0]], ratio),
    `${g0(kcal)} of ${g0(goals.kcal)} kcal${ratio > 1.1 ? ` — ${pct} % over` : ratio < 0.85 ? ` — ${-pct} % under, a deep deficit` : ""}`);

  // the nutrients, from the foods that have them
  let known = 0, fiber = 0, plants = 0, salt = 0, satFat = 0, sugar = 0;
  for (const e of items) {
    if (e.kind !== "food") continue;
    const n = foodFor(e, foods)?.nutri;
    if (!n) continue;
    const k = e.grams / 100;
    known += e.macros.kcal; fiber += n.fiber * k; plants += ((n.fvl ?? 0) / 100) * e.grams; salt += n.salt * k; satFat += n.satFat * k; sugar += n.sugar * k;
  }
  const share = known / kcal;
  if (share >= DAY_SCORE.coverage) {
    const est = share < 0.95 ? ` (${Math.round(share * 100)} % of the day has nutrients)` : "";
    part("fiber", "Fibre", DAY_SCORE.fiber, fiber / DAY_SCORE.fiberG, `${g0(fiber)} g of ${DAY_SCORE.fiberG}${est}`);
    part("plants", "Fruit, veg, legumes", DAY_SCORE.plants, plants / DAY_SCORE.plantsG, `${g0(plants)} g of ${DAY_SCORE.plantsG}${est}`);
    const satPct = (satFat * 9 * 100) / kcal, under = (v: number, lim: number) => curve([[1, 1], [1.5, 0]], v / lim);
    const over = [salt > DAY_SCORE.saltG && `salt ${r1(salt)} g`, satPct > DAY_SCORE.satFatPct && `saturated fat ${Math.round(satPct)} % of calories`, sugar > DAY_SCORE.sugarG && `sugar ${g0(sugar)} g`].filter(Boolean);
    part("limits", "Salt, sat. fat, sugar", DAY_SCORE.limits, (under(salt, DAY_SCORE.saltG) + under(satPct, DAY_SCORE.satFatPct) + under(sugar, DAY_SCORE.sugarG)) / 3,
      over.length ? `over: ${over.join(", ")}` : "all under their limits");
  } else {
    const why = `only ${Math.round(share * 100)} % of the day's calories have nutrients`;
    left.push({ id: "fiber", name: "Fibre", max: DAY_SCORE.fiber, why }, { id: "plants", name: "Fruit, veg, legumes", max: DAY_SCORE.plants, why }, { id: "limits", name: "Salt, sat. fat, sugar", max: DAY_SCORE.limits, why });
  }

  // the last real meal (50 kcal+) against that night's bedtime
  const last = [...items].reverse().find((e) => (macrosOf(e)?.kcal ?? 0) >= 50);
  if (last) { const h = hoursBeforeBed(last.at, bedMinute); part("late", "Last meal", DAY_SCORE.late, curve([[1, 0], [3, 1]], h), h >= 3 ? "3 h or more before bed" : h <= 0 ? "after bedtime" : `${h.toFixed(1)} h before bed`); }
  const alc = entries.reduce((a, e) => a + (e.kind === "drink" && e.alcoholG > 0 && localDay(e.at) === day ? e.alcoholG : 0), 0);
  part("alcohol", "Alcohol", DAY_SCORE.alcohol, curve([[0, 1], [DAY_SCORE.alcoholG, 0]], alc), alc > 0 ? `${g0(alc)} g` : "none");

  const got = parts.reduce((a, x) => a + x.got, 0), max = parts.reduce((a, x) => a + x.max, 0), score = Math.round((got / max) * 100);
  return { day, score, word: dayWord(score), parts, left, kcal, known: share };
}

/** The part furthest from full, in a few words: "fibre low (14 g of 30)" — for the one-line places. */
export function weakest(s: DayScore): string | null {
  const w = [...s.parts].sort((a, b) => a.got / a.max - b.got / b.max || b.max - a.max)[0];
  if (!w || w.got / w.max >= 0.8) return null;
  const low = w.id === "kcal" || w.id === "limits" || w.id === "late" || w.id === "alcohol" ? w.why : `${w.name.toLowerCase()} low (${w.why})`;
  return low.replace(/ \(\d+ % of the day has nutrients\)/, "");
}

/** For the AI: the day's score and its parts. */
export function dayScoreLines(s: DayScore, label: string): string[] {
  return [`${label}: ${s.score}/100 (${s.word}) — ${s.parts.map((p) => `${p.name} ${r1(p.got)}/${p.max} (${p.why})`).join("; ")}${s.left.length ? `; not judged: ${s.left.map((l) => l.name).join(", ")} (${s.left[0].why})` : ""}.`];
}
