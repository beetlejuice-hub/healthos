// The engines audit (owner, 3 Nov: "make a thorough investigation of how findings, and compare engines work and come up
// w a better fixd solution"). Every engine that says "these two go together", run through its own data path on the same
// worlds: 60 days from lib/sample with nothing planted (the control — any claim is a false alarm), and with its planted
// effects (late caffeine → that night's rating −1.6; alcohol → rating and next-day energy; protein → next-day energy;
// no supplement does anything). Run with AUDIT=1; prints the table the investigation quotes.
import { describe, expect, it } from "vitest";
import { makeSample } from "./sample";
import { dailyFacts, suppEffects } from "./insights";
import { glanceDays } from "./glance";
import { DEFAULT_SETTINGS } from "./store";
import { scout } from "./scout";
import { leadGrade } from "./ai/lead";
import { effectFindings } from "./detectors/effects";
import { comparisons } from "./connections";
import { patterns } from "./patterns";
import { between } from "./detectors/between";
import { goesWith, type Evening, type Night } from "./sleep";
import { rng } from "./bench";
import { addDays, localDay } from "./time";
import type { Supplement } from "./types";

const NOW = new Date("2026-10-31T21:00:00").getTime();
const SUPPS = [["creatine", "Creatine"], ["vitd", "Vitamin D3"], ["cumin", "Black cumin oil"], ["mag", "Magnesium"], ["saffron", "Saffron"]].map(([id, name]) => ({ id, name, dose: "1", slot: "morning", at: 480, active: true }) as unknown as Supplement);
const names = new Map(SUPPS.map((s) => [s.id, s.name]));

function engines(seed: number, effects: boolean) {
  const { entries, workouts } = makeSample(NOW, 60, { effects, seed });
  const to = addDays(localDay(NOW), -1), from = addDays(to, -59);
  const facts = dailyFacts(entries, workouts, DEFAULT_SETTINGS, from, to), days = glanceDays(entries, workouts, DEFAULT_SETTINGS, from, to);
  const leads = scout(facts, SUPPS);
  const eff = effectFindings(facts, SUPPS).found;
  const cmp = comparisons(days, SUPPS).filter((c) => c.diff?.clear);
  const pat = patterns(days, entries), patClear = "worst" in pat ? [...pat.worst.rows, ...pat.best.rows].filter((r) => r.diff?.clear) : [];
  const sup = suppEffects(facts, SUPPS).filter((s) => s.diff?.clear);
  const btw = between(entries, workouts, names, NOW).filter((r) => r.found);
  return {
    leads: leads.length, strong: leads.filter((p) => leadGrade(p) === "strong").length, leadText: leads.map((p) => p.text),
    // each yes/no lead's days with and without (held/of counts the "with" days)
    yesSides: leads.filter((p) => p.a.yes).map((p) => [p.of, p.n - p.of] as const),
    noticed: eff.length, noticedText: eff.map((f) => f.title),
    connections: cmp.length, connText: cmp.map((c) => `${c.what} → ${c.outcome}`),
    patterns: patClear.length, supps: sup.length, between: btw.length,
  };
}

/** A night grid of pure chance: every factor and outcome drawn on its own. */
function nullGrid(seed: number) {
  const { r, g } = rng(seed), ns: Night[] = [], evs: Evening[] = [];
  for (let i = 0; i < 60; i++) {
    const eve = addDays("2026-08-01", i), bed = new Date(`${eve}T23:00:00`).getTime() + g() * 40 * 60_000;
    ns.push({ id: `n${i}`, day: addDays(eve, 1), eve, bed, up: bed + 8 * 3_600_000, onset: bed, wake: bed + 8 * 3_600_000, asleep: 420 + g() * 40, deep: 80 + g() * 10, rem: 90 + g() * 12, light: 250, awake: 20 + Math.abs(g()) * 10, wakes: Math.round(2 + Math.abs(g()) * 2), latency: 12 + Math.abs(g()) * 6, stages: [], low: 52 + g(), lowAt: bed + (3 + g()) * 3_600_000, hrv: 50 + g() * 5, nap: r() < 0.1 ? { min: 20 } : null } as unknown as Night);
    evs.push({ drinks: r() < 0.3 ? [bed - 3_600_000] : [], caffeineAtBed: r() < 0.3 ? 40 : 5, trained: r() < 0.4, ateLate: r() < 0.25, rating: Math.round(6 + g() * 1.5), moreSteps: r() < 0.5, lastMealMin: r() < 0.3 ? 60 : 200, moreEveKcal: r() < 0.5, moreEveCarbs: r() < 0.5, lateTrain: r() < 0.15, phoneMin: r() < 0.4 ? 45 : 0, eveStress: r() < 0.2 ? 8 : 4, tags: [] } as unknown as Evening);
  }
  const cells = goesWith(ns, evs, { perms: 2000, seed });
  return { tried: cells.filter((c) => c.sure !== "too few").length, clear: cells.filter((c) => c.sure === "clear").length, likely: cells.filter((c) => c.sure === "likely").length };
}

// PLAN 188 phase 1: every engine held to one bar, checked every run. Before it (3 Nov), with nothing planted:
// Connections "clear" in 23 of 30 worlds, best/worst days 18 of 30, supplement effects 18 of 30, Sleep grid "likely" 4 of 10.
describe("one bar for every engine (PLAN 188)", () => {
  const N = 20;
  const ctl = Array.from({ length: N }, (_, s) => engines(2000 + s, false)), fx = Array.from({ length: N }, (_, s) => engines(2000 + s, true));
  const worlds = (rows: ReturnType<typeof engines>[], k: "strong" | "noticed" | "connections" | "patterns" | "supps") => rows.filter((x) => x[k] > 0).length;
  it("nothing planted: each engine says something in at most 5 of 20 worlds (about 1 in 10 is the bar)", () => {
    for (const k of ["strong", "noticed", "connections", "patterns", "supps"] as const) expect(worlds(ctl, k), k).toBeLessThanOrEqual(5);
  });
  it("planted: the same engines still find what's there", () => {
    expect(worlds(fx, "noticed")).toBeGreaterThanOrEqual(18);
    expect(worlds(fx, "strong")).toBeGreaterThanOrEqual(16);
    expect(worlds(fx, "connections")).toBeGreaterThanOrEqual(18);
    // best/worst days compare small groups (the top and bottom fifth): the honest small-sample range costs it some power
    expect(worlds(fx, "patterns")).toBeGreaterThanOrEqual(12);
  });
  it("supplements do nothing in the sample: a supplement 'works' in at most 5 of 20 worlds with the effects on too", () => {
    expect(worlds(fx, "supps")).toBeLessThanOrEqual(5);
  });
  it("the night grids: nothing clear on pure chance, and a chance 'likely' in at most 2 of 10 grids", () => {
    const g = Array.from({ length: 10 }, (_, s) => nullGrid(700 + s));
    // "clear" is p under 0.1 ÷ cells: by design about one grid in ten gets one by chance
    expect(g.filter((x) => x.clear > 0).length).toBeLessThanOrEqual(2);
    expect(g.filter((x) => x.likely > 0).length).toBeLessThanOrEqual(2);
  });
  it("Leads: a yes/no needs 8 days each way", () => {
    const sides = [...ctl, ...fx].flatMap((x) => x.yesSides);
    expect(sides.length).toBeGreaterThan(0);
    for (const [on, off] of sides) expect(Math.min(on, off)).toBeGreaterThanOrEqual(8);
  });
});

describe.skipIf(!process.env.AUDIT)("engines audit", () => {
  it("each engine on the same worlds: false alarms with nothing planted, finds with effects", () => {
    const N = Number(process.env.AUDIT_N ?? 30);
    const sum = (rows: ReturnType<typeof engines>[], k: keyof ReturnType<typeof engines>) => rows.filter((x) => (x[k] as number) > 0).length;
    const ctl = Array.from({ length: N }, (_, s) => engines(1000 + s, false)), fx = Array.from({ length: N }, (_, s) => engines(1000 + s, true));
    const table = (["leads", "strong", "noticed", "connections", "patterns", "supps", "between"] as const).map((k) => ({ engine: k, "worlds with a claim, nothing planted": `${sum(ctl, k)} of ${N}`, "claims per null world": (ctl.reduce((a, x) => a + (x[k] as number), 0) / N).toFixed(2), "worlds with a claim, planted": `${sum(fx, k)} of ${N}` }));
    console.table(table);
    const grids = Array.from({ length: 10 }, (_, s) => nullGrid(500 + s));
    console.table(grids.map((g, i) => ({ grid: i, ...g })));
    // what each said on the planted world, the first seed: do they agree?
    const one = fx[0];
    console.log("planted, seed 1000 — Leads:", one.leadText, "\nNoticed:", one.noticedText, "\nConnections:", one.connText);
    const nullFalse = ctl.flatMap((x) => [...x.leadText, ...x.noticedText, ...x.connText]);
    console.log("a sample of claims made on null worlds:", nullFalse.slice(0, 12));
    expect(ctl.length).toBe(N);
  }, 600_000);
});
