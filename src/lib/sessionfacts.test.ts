import { describe, expect, it } from "vitest";
import { sessionFacts, sessionFactors, SESSION_OUTCOMES, slopeTest } from "./sessionfacts";
import { sessions, type Session } from "./liftstrength";
import { goesWith, type Night } from "./sleep";
import { rng } from "./bench";
import { localDay } from "./time";
import type { Entry } from "./types";
import type { LoggedSet } from "./training";

const D = 86_400_000, H = 3_600_000;
/**
 * 12 weeks, Mon/Wed/Fri + some Saturdays, Push/Pull/Legs rotating; lunch every day, and on about half the session days a
 * carb meal (70–115 g) 1–3 h before; the band's night before each; coffee before about 60 %; creatine most days, answered.
 * Planted when `plant`: carbs ≥ 60 g in the 4 h before → +3.5 % against each lift's line; under 6 h 30 asleep → −4 %.
 * Nothing for coffee, creatine, evening.
 */
function world(seed: number, plant: boolean) {
  const { r, g } = rng(seed), entries: Entry[] = [], sets: LoggedSet[] = [], ns: Night[] = [];
  const workouts: { id: string; template: string; startedAt: number; endedAt: number }[] = [];
  const LIFTS: Record<string, [string, number][]> = { Push: [["Bench press", 100], ["Overhead press", 60]], Pull: [["Deadlift", 160], ["Barbell row", 85]], Legs: [["Squat", 130], ["Romanian deadlift", 110]] };
  const t0 = new Date(2026, 6, 20).getTime(); let n = 0;
  for (let k = 0; k < 84; k++) {
    const day0 = t0 + k * D, dow = new Date(day0).getDay(), wk = Math.floor(k / 7);
    entries.push({ id: `l${k}`, kind: "food", at: day0 + 12.5 * H, name: "Lunch", grams: 400, macros: { kcal: 700, p: 40, c: 70, f: 20 } });
    if (r() < 0.85) entries.push({ id: `c${k}`, kind: "supp", at: day0 + 8 * H, suppId: "crea", status: r() < 0.8 ? "taken" : "skipped" });
    const asleep = Math.max(320, Math.min(520, 415 + g() * 45)), short = asleep < 390;
    ns.push({ id: `n${k}`, day: localDay(day0), eve: localDay(day0 - D), bed: day0 - 1.5 * H, up: day0 + 7 * H, onset: day0 - H, wake: day0 + 6.9 * H, asleep, deep: 75, rem: 90, light: 200, awake: 20, wakes: 2, latency: 12, stages: [], low: 50, lowAt: null, hrv: 45 + g() * 4, rhr: 55, nap: null });
    const trains = dow === 1 || dow === 3 || dow === 5 || (dow === 6 && r() < 0.35);
    if (!trains) continue;
    const tpl = ["Push", "Pull", "Legs"][n++ % 3], evening = r() < 0.6, start = day0 + (evening ? 17.5 + r() * 2 : 7.5 + r() * 1.5) * H, id = `w${k}`;
    const carbs = r() < 0.5, coffee = r() < 0.6;
    if (carbs) entries.push({ id: `m${k}`, kind: "food", at: start - (1 + r() * 2) * H, name: "Rice", grams: 300, macros: { kcal: 500, p: 20, c: Math.round(70 + r() * 45), f: 8 } });
    else entries.push({ id: `m${k}`, kind: "food", at: start - (1 + r() * 2) * H, name: "Eggs", grams: 200, macros: { kcal: 300, p: 25, c: Math.round(5 + r() * 25), f: 20 } });
    if (coffee) entries.push({ id: `cf${k}`, kind: "drink", at: start - (0.3 + r()) * H, name: "Coffee", ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 });
    const eff = plant ? (carbs ? 3.5 : 0) - (short ? 4 : 0) : 0;
    workouts.push({ id, template: tpl, startedAt: start, endedAt: start + H });
    for (const [ex, b] of LIFTS[tpl]) {
      const e1 = b * (1 + 0.006 * wk) * (1 + (eff + g() * 1.2) / 100), kg = e1 / (1 + 5 / 30);
      for (let q = 0; q < 3; q++) sets.push({ at: start + (q + 1) * 60_000, workoutId: id, exercise: ex, kg: q ? kg * 0.95 : kg, reps: 5 });
    }
    entries.push({ id: `fa${k}`, kind: "feel", at: start + 1.5 * H, energy: Math.round(6.5 + g() * 0.8) });
  }
  const ss = sessions(workouts, sets), fs = sessionFacts(ss, entries, ns);
  return { ss, fs, entries, ns, factors: sessionFactors([{ id: "crea", name: "Creatine" }], fs) };
}
const cellOf = (w: ReturnType<typeof world>, f: string, o = "pct") => goesWith<Session, typeof w.fs[number]>(w.ss, w.fs, { factors: w.factors, outcomes: SESSION_OUTCOMES }).find((c) => c.factor === f && c.outcome === o)!;

describe("Training B · what goes with a strong session (PLAN 64)", () => {
  it("finds the planted carbs before (+3.5 %) and short night (−4 %), at about their sizes", () => {
    const w = world(41, true), carbs = cellOf(w, "carbs"), short = cellOf(w, "short");
    expect(["clear", "likely"]).toContain(carbs.sure); expect(carbs.toward).toBe("better"); expect(carbs.diff!).toBeGreaterThan(2); expect(carbs.diff!).toBeLessThan(5.5);
    expect(["clear", "likely"]).toContain(short.sure); expect(short.toward).toBe("worse"); expect(short.diff!).toBeLessThan(-2);
  });
  it("nothing planted for coffee, evening or creatine: not clear", () => {
    const w = world(41, true);
    for (const f of ["coffee", "evening", "supp:crea"]) expect(cellOf(w, f).sure).not.toBe("clear");
  });
  it("nothing planted at all: the strength column stays quiet across 10 worlds", () => {
    let clear = 0;
    for (let s = 700; s < 710; s++) { const w = world(s, false); clear += goesWith<Session, typeof w.fs[number]>(w.ss, w.fs, { factors: w.factors, outcomes: SESSION_OUTCOMES, seed: s }).filter((c) => c.outcome === "pct" && c.sure === "clear").length; }
    expect(clear).toBeLessThanOrEqual(1);
  }, 30_000);
  it("unknown is left out: no food before it that day → carbs unknown; no night → sleep unknown; 3 days need food", () => {
    const w = world(41, true), s = w.ss[3];
    const noFood = sessionFacts([s], w.entries.filter((e) => !(e.kind === "food" && localDay(e.at) === localDay(s.startedAt))), w.ns)[0];
    expect(noFood.carbs4h).toBeNull();
    expect(sessionFacts([s], w.entries, [])[0].asleep).toBeNull();
    expect(sessionFacts([s], w.entries.filter((e) => e.kind !== "food"), w.ns)[0].under3).toBeNull();
    expect(w.fs.filter((f) => f.feltAfter != null).length).toBe(w.ss.length);
  });
  it("carbs as a number: the planted step shows as a positive slope", () => {
    const w = world(41, true), pts = w.ss.flatMap((s, i) => (w.fs[i].carbs4h != null && s.pct != null ? [[w.fs[i].carbs4h!, s.pct] as [number, number]] : []));
    const sl = slopeTest(pts);
    expect(sl.slope!).toBeGreaterThan(0); expect(["clear", "likely"]).toContain(sl.sure);
  });
});
