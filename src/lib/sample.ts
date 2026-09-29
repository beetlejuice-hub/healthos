/**
 * Sample data: 60 days that look like the owner's answers, so Insights has something to show
 * before real data piles up. Every id starts with `sample:` and one button removes it all.
 * Deterministic (seeded), so it's the same every time.
 */

import type { Entry, Workout } from "./types";
import { DAY, MIN, startOfDay } from "./time";

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

export function makeSample(now = Date.now(), days = 60): { entries: Entry[]; workouts: Workout[] } {
  const r = rng(29092026);
  const g = () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  const entries: Entry[] = [], workouts: Workout[] = [];
  let n = 0;
  const id = () => `sample:${n++}`;
  const today = startOfDay(now);
  let split = 0;
  for (let k = days; k >= 1; k--) {
    const base = today - k * DAY, dow = new Date(base).getDay(), t = (h: number, m = 0, jitter = 0) => base + (h * 60 + m + g() * jitter) * MIN;
    const prog = (days - k) / days;
    // coffee
    entries.push({ id: id(), kind: "drink", at: t(8, 5, 20), name: "Filter coffee", ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 });
    if (r() < .85) entries.push({ id: id(), kind: "drink", at: t(12, 50, 40), name: r() < .6 ? "Filter coffee" : "Espresso", ml: 250, caffeineMg: r() < .6 ? 95 : 63, alcoholG: 0, kcal: 2 });
    if (r() < .3) entries.push({ id: id(), kind: "drink", at: t(16, 15, 50), name: "Espresso", ml: 30, caffeineMg: 63, alcoholG: 0, kcal: 1 });
    // alcohol on some weekend evenings
    if ((dow === 5 || dow === 6) && r() < .55) { const c = 1 + Math.floor(r() * 3); for (let i = 0; i < c; i++) entries.push({ id: id(), kind: "drink", at: t(20, 30 + i * 45, 20), name: "Beer 500 ml, 5%", ml: 500, caffeineMg: 0, alcoholG: 19.7, kcal: 215 }); }
    // meals (a few days not logged at all)
    if (r() > .07) {
      const meal = (h: number, m: number, name: string, kcal: number, pShare: number) => {
        const p = Math.round(kcal * pShare / 4), f = Math.round(kcal * .26 / 9), c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
        entries.push({ id: id(), kind: "food", at: t(h, m, 20), name, grams: 0, macros: { kcal: Math.round(kcal), p, c, f } });
      };
      meal(8, 0, "Oats, whey, banana", 580 + g() * 60, .27);
      meal(13, 0, "Chicken rice bowl", 780 + g() * 90, .29);
      if (r() < .6) meal(16, 30, "Greek yoghurt, berries", 300 + g() * 50, .35);
      meal(19, 40, r() < .5 ? "Salmon, potatoes, veg" : "Pasta bolognese", 850 + g() * 120, .26);
    }
    // supplements
    for (const [sid, h, m, p] of [["creatine", 8, 15, .93], ["vitd", 8, 15, .88], ["cumin", 8, 18, .7], ["mag", 22, 30, .9], ["saffron", 22, 32, .88]] as const) {
      if (r() < p) entries.push({ id: id(), kind: "supp", at: t(h, m, 15), suppId: sid, status: "taken" });
    }
    // weight
    if (r() < .9) entries.push({ id: id(), kind: "weight", at: t(7, 30), kg: Math.round((80 - 1.6 * prog + g() * .3) * 10) / 10 });
    // how you feel (energy dips after late caffeine and alcohol the night before)
    if (r() < .85) {
      const prev = entries.filter((e) => e.kind === "drink" && e.at > base - 10 * 60 * MIN && e.at < base);
      const late = prev.reduce((a, e) => a + (e.kind === "drink" ? e.caffeineMg * .3 + e.alcoholG * .5 : 0), 0);
      const clamp = (v: number) => Math.max(1, Math.min(10, Math.round(v)));
      entries.push({ id: id(), kind: "feel", at: t(12, 40), energy: clamp(7 - late / 12 + g() * 1.1), mood: clamp(6.8 - late / 18 + g() * 1.1), focus: clamp(6.8 - late / 15 + g()), stress: clamp(4 + g() * 1.2), anxiety: clamp(3.5 + g() * 1.2) });
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
