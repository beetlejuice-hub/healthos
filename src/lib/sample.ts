/**
 * Sample data: 60 days that look like the owner's answers, so Insights has something to show
 * before real data piles up. Every id starts with `sample:` and one button removes it all.
 * Deterministic (seeded), so it's the same every time.
 *
 * Built with known effects (PLAN 151: "plant a known effect in fake data and check you find it, and check you DON'T find
 * effects that aren't there"), so the engines can be checked against an answer:
 *   - caffeine left at bedtime (30+ mg at 23:00) → that night's sleep rated about 1.6 lower;
 *   - alcohol in the evening → the night rated a little lower (0.05 a gram) and less energy the next day;
 *   - caffeine late in the day → less energy the next day (as before);
 *   - protein → the next day's energy: a point per 25 g from 160 g (120 g → −1.6, 185 g → +1), within ±2;
 *   - no supplement does anything — so "it helps" about any of them is a false finding.
 * `effects: false` is the same days, the same draws, with every effect off: the control, where nothing should be found.
 */

import type { Entry, Workout } from "./types";
import { DAY, MIN, startOfDay } from "./time";
import { caffeineAt } from "./caffeine";

function rng(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

const LIFTS: Record<string, [start: number, end: number, reps: number]> = {
  "Bench press": [88, 97, 6], "Barbell row": [78, 87, 8], "Overhead press": [55, 60.5, 6], "Lat pulldown": [62, 70, 10],
  "Squat": [110, 123, 5], "Romanian deadlift": [100, 112, 8], "Leg press": [180, 205, 10], "Calf raise": [90, 100, 12],
  "Pull-ups": [85, 90, 8], "Incline DB press": [30, 34, 10], "Bicep curl": [14, 16, 12],
  "Deadlift": [140, 152, 5], "Front squat": [85, 94, 6], "Leg curl": [45, 52, 12],
};
const SPLIT: [string, string[]][] = [
  ["Upper A", ["Bench press", "Barbell row", "Overhead press", "Lat pulldown"]],
  ["Lower A", ["Squat", "Romanian deadlift", "Leg press", "Calf raise"]],
  ["Upper B", ["Overhead press", "Pull-ups", "Incline DB press", "Bicep curl"]],
  ["Lower B", ["Deadlift", "Front squat", "Leg curl"]],
];

/** What's planted, by how much (the tests read these). */
export const PLANTED = { cafSleep: -1.6, cafBedMg: 30, alcSleepPerG: -0.05, proteinMid: 160, proteinPerPoint: 25, sleepAt: 7 * 60 + 20, bedMinute: 23 * 60 };

export function makeSample(now = Date.now(), days = 60, o: { effects?: boolean } = {}): { entries: Entry[]; workouts: Workout[] } {
  const fx = o.effects === false ? 0 : 1;
  const r = rng(29092026);
  const g = () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  const entries: Entry[] = [], workouts: Workout[] = [];
  let n = 0;
  const id = () => `sample:${n++}`;
  const today = startOfDay(now);
  let split = 0, prevProtein: number | null = null;
  const clamp = (v: number) => Math.max(1, Math.min(10, Math.round(v)));
  for (let k = days; k >= 1; k--) {
    const base = today - k * DAY, dow = new Date(base).getDay(), t = (h: number, m = 0, jitter = 0) => base + (h * 60 + m + g() * jitter) * MIN;
    const prog = (days - k) / days, yProtein = prevProtein;
    // the morning's rating of last night: caffeine left at 23:00 and the evening's alcohol pull it down (most mornings rated)
    if (r() < .88) {
      const caf = entries.flatMap((e) => (e.kind === "drink" && e.caffeineMg > 0 ? [{ at: e.at, mg: e.caffeineMg }] : []));
      const mg = caffeineAt(caf, base - DAY + PLANTED.bedMinute * MIN), alc = entries.reduce((a, e) => a + (e.kind === "drink" && e.at > base - 10 * 60 * MIN && e.at < base ? e.alcoholG : 0), 0);
      const hi = mg >= PLANTED.cafBedMg, slow = r() < .15 + (hi ? fx * .3 : 0);
      entries.push({ id: id(), kind: "sleep", at: t(7, 20, 10), rating: clamp(7.3 + fx * ((hi ? PLANTED.cafSleep : 0) + PLANTED.alcSleepPerG * alc) + g() * .8), ...(slow ? { slow } : {}) });
    }
    // coffee
    entries.push({ id: id(), kind: "drink", at: t(8, 5, 20), name: "Filter coffee", ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 });
    if (r() < .55) entries.push({ id: id(), kind: "drink", at: t(12, 50, 40), name: r() < .6 ? "Filter coffee" : "Espresso", ml: 250, caffeineMg: r() < .6 ? 95 : 63, alcoholG: 0, kcal: 2 });
    if (r() < .3) entries.push({ id: id(), kind: "drink", at: t(16, 15, 50), name: "Espresso", ml: 30, caffeineMg: 63, alcoholG: 0, kcal: 1 });
    // alcohol on some weekend evenings
    if ((dow === 5 || dow === 6) && r() < .55) { const c = 1 + Math.floor(r() * 3); for (let i = 0; i < c; i++) entries.push({ id: id(), kind: "drink", at: t(20, 30 + i * 45, 20), name: "Beer 500 ml, 5%", ml: 500, caffeineMg: 0, alcoholG: 19.7, kcal: 215 }); }
    // meals (a few days not logged at all); protein swings with the snack and the dinner
    prevProtein = null;
    if (r() > .07) {
      let protein = 0;
      const meal = (h: number, m: number, name: string, kcal: number, pShare: number) => {
        const p = Math.round(kcal * pShare / 4), f = Math.round(kcal * .26 / 9), c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
        protein += p;
        entries.push({ id: id(), kind: "food", at: t(h, m, 20), name, grams: 0, macros: { kcal: Math.round(kcal), p, c, f } });
      };
      meal(8, 0, "Oats, whey, banana", 580 + g() * 60, .27);
      meal(13, 0, "Chicken rice bowl", 780 + g() * 90, .29);
      if (r() < .5) meal(16, 30, "Greek yoghurt, berries", 300 + g() * 50, .35);
      const fish = r() < .5;
      meal(19, 40, fish ? "Salmon, potatoes, veg" : "Pasta bolognese", 850 + g() * 120, fish ? .3 : .17);
      prevProtein = protein;
    }
    // supplements
    for (const [sid, h, m, p] of [["creatine", 8, 15, .93], ["vitd", 8, 15, .88], ["cumin", 8, 18, .7], ["mag", 22, 30, .9], ["saffron", 22, 32, .88]] as const) {
      if (r() < p) entries.push({ id: id(), kind: "supp", at: t(h, m, 15), suppId: sid, status: "taken" });
    }
    // weight
    if (r() < .9) entries.push({ id: id(), kind: "weight", at: t(7, 30), kg: Math.round((80 - 1.6 * prog + g() * .3) * 10) / 10 });
    // how you feel (energy dips after late caffeine and alcohol the night before, and after a low-protein day)
    if (r() < .85) {
      const prev = entries.filter((e) => e.kind === "drink" && e.at > base - 10 * 60 * MIN && e.at < base);
      const late = fx * prev.reduce((a, e) => a + (e.kind === "drink" ? e.caffeineMg * .3 + e.alcoholG * .5 : 0), 0);
      const lowP = fx * (yProtein != null ? Math.max(-2, Math.min(2, (yProtein - PLANTED.proteinMid) / PLANTED.proteinPerPoint)) : 0);
      entries.push({ id: id(), kind: "feel", at: t(12, 40), energy: clamp(7 - late / 12 + lowP + g() * 1.1), mood: clamp(6.8 - late / 18 + g() * 1.1), focus: clamp(6.8 - late / 15 + g()), stress: clamp(4 + g() * 1.2), anxiety: clamp(3.5 + g() * 1.2) });
    }
    // training Tue/Thu/Sat
    if ((dow === 2 || dow === 4 || dow === 6) && r() < .94) {
      const [name, exs] = SPLIT[split++ % SPLIT.length];
      const start = t(dow === 6 ? 11 : 17, 30, 10);
      const w: Workout = { id: `sample:w${n++}`, template: name, startedAt: start, endedAt: start + 70 * MIN };
      workouts.push(w);
      let clock = start + 5 * MIN;
      for (const ex of exs) {
        const [a, b, reps] = LIFTS[ex];
        const target = a + (b - a) * prog + g();
        const kg = Math.round(target / (1 + reps / 30) / 2.5) * 2.5;
        for (let s = 0; s < 3; s++) {
          const got = Math.max(1, reps + Math.round(g() * .6) - (s === 2 && r() < .35 ? 1 : 0));
          entries.push({ id: id(), kind: "set", at: clock, workoutId: w.id, exercise: ex, kg, reps: got });
          clock += 3 * MIN;
        }
      }
    }
  }
  return { entries: entries.sort((a, b) => a.at - b.at), workouts };
}
