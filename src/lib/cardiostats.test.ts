// PLAN 191 — owner, 3 Nov: "Can app ask for average pace and different phases of cardio? Like i do incline walk then normal
// running and just want the app to calculate some stats from my average pace average miles average hbpm etc.". Known
// answers: an 18-minute incline walk of 0.9 mi is 20:00 a mile at 3.0 mph; a 22-minute run of 2.0 mi is 11:00 a mile at
// 5.5 mph; band minutes planted at 128 and 163 bpm give each phase its own heart rate, and the run 163 × 22 ÷ 2 = 1,793
// beats a mile. Average pace is all the time over all the distance, not the average of paces.
import { describe, expect, it } from "vitest";
import { allPhases, beatsText, distText, fromKm, kindStats, MI_KM, newBests, nextPhase, paceText, phaseLine, phasesKcal, phasesOf, phaseWords, speedText, toKm } from "./cardiostats";
import type { HrMinute } from "./band";
import { cardioLine, cardioSpans, spanKcal } from "./cardio";
import type { Workout } from "./types";

const MIN = 60_000, T0 = new Date("2026-11-02T18:00:00").getTime();
const session = (t0: number, phases: { what: string; min: number; mi?: number; incline?: number }[], id = "w" + t0): Workout => {
  let t = t0;
  const ps = phases.map((p) => { const x = { what: p.what, start: t, ...(p.mi ? { km: p.mi * MI_KM } : {}), ...(p.incline != null ? { incline: p.incline } : {}) }; t += p.min * MIN; return x; });
  return { id, kind: "cardio", template: "Cardio", startedAt: t0, endedAt: t, cardio: { what: phaseWords(ps), startedAt: t0, done: true, at: t }, phases: ps } as Workout;
};
const band = (from: number, mins: number, bpm: number): HrMinute[] => Array.from({ length: mins }, (_, i) => [from + i * MIN, bpm, bpm - 3, bpm + 4] as HrMinute);

describe("cardio in phases (PLAN 191)", () => {
  const w = session(T0, [{ what: "Incline walk", min: 18, mi: 0.9, incline: 12 }, { what: "Run", min: 22, mi: 2.0 }]);
  const hr = [...band(T0, 18, 128), ...band(T0 + 18 * MIN, 22, 163)];
  it("each phase: its time, pace, speed, heart rate and beats a mile", () => {
    const [walk, run] = allPhases([w], hr, T0 + 3_600_000);
    expect([paceText(walk.pace!, "mi"), speedText(walk.kmh!, "mi"), walk.hr!.avg, walk.incline]).toEqual(["20:00", "3.0 mph", 128, 12]);
    expect([run.min, paceText(run.pace!, "mi"), speedText(run.kmh!, "mi"), run.hr!.avg, run.hr!.peak, beatsText(run.beats!, "mi")]).toEqual([22, "11:00", "5.5 mph", 163, 167, "1,793"]);
    // the same in km: 2.0 mi = 3.2 km, 6:50 a km
    expect([distText(run.km!, "km"), paceText(run.pace!, "km"), speedText(run.kmh!, "km")]).toEqual(["3.2 km", "6:50", "8.8 km/h"]);
  });
  it("a session with no phases is one phase, its whole time; 'Next' starts the first from the session's start", () => {
    const one = { ...w, phases: undefined, cardio: { what: "Stairmaster", startedAt: T0 } } as Workout;
    expect(phasesOf(one, 0).map((p) => [p.what, (p.end - p.start) / MIN])).toEqual([["Stairmaster", 40]]);
    const live = { ...one, endedAt: null } as Workout;
    expect(nextPhase(live, "Run", T0 + 10 * MIN)).toEqual([{ what: "Stairmaster", start: T0 }, { what: "Run", start: T0 + 10 * MIN }]);
    expect(phaseWords([{ what: "Incline walk" }, { what: "Run" }, { what: "Run" }])).toBe("Incline walk → Run");
  });
  it("per kind: average pace is all the time over all the distance; heart rate weighted by minutes; best; the first 3 vs the last 3", () => {
    // 30 min for 3 mi (10:00) and 10 min for 0.5 mi (20:00): 40 min ÷ 3.5 mi = 11:26, not the 15:00 an average of paces says
    const two = [session(T0, [{ what: "Run", min: 30, mi: 3 }]), session(T0 + 86_400_000, [{ what: "Run", min: 10, mi: 0.5 }])];
    const hr2 = [...band(T0, 30, 160), ...band(T0 + 86_400_000, 10, 170)];
    const [run] = kindStats(allPhases(two, hr2, T0 + 2 * 86_400_000));
    expect([run.kind, run.n, paceText(run.pace!, "mi"), paceText(run.best!, "mi"), run.hr, distText(run.avgKm!, "mi"), run.then]).toEqual(["Run", 2, "11:26", "10:00", 163, "1.8 mi", null]);
    // six runs, each 20 s a mile faster at the same distance and heart rate: then 12:00 → now 11:00, fewer beats a mile
    const six = Array.from({ length: 6 }, (_, i) => session(T0 + i * 86_400_000, [{ what: "Run", min: (12 * 60 - i * 20) * 2 / 60, mi: 2 }]));
    const hr6 = six.flatMap((s) => band(s.startedAt, Math.round((s.endedAt! - s.startedAt) / MIN), 165));
    const [r6] = kindStats(allPhases(six, hr6, T0 + 7 * 86_400_000));
    expect([paceText(r6.then!.pace, "mi"), paceText(r6.now!.pace, "mi")]).toEqual(["11:40", "10:40"]);
    expect(r6.now!.beats!).toBeLessThan(r6.then!.beats!);
    expect(r6.series).toHaveLength(6);
  });
  it("kinds apart, the most logged first; a phase with no distance keeps its time and heart rate, no pace", () => {
    const ws = [w, session(T0 + 86_400_000, [{ what: "Incline walk", min: 20 }])];
    const ks = kindStats(allPhases(ws, hr, T0 + 2 * 86_400_000));
    expect(ks.map((k) => [k.kind, k.n, k.withDist])).toEqual([["Incline walk", 2, 1], ["Run", 1, 1]]);
    expect(paceText(ks[0].pace!, "mi")).toBe("20:00");
  });
  it("typing: miles or km in, km kept; shown back the same", () => {
    expect(toKm("2", "mi")).toBeCloseTo(3.218688);
    expect(toKm("3,2", "km")).toBe(3.2);
    expect([toKm("", "mi"), toKm("abc", "mi"), toKm("0", "km")]).toEqual([null, null, null]);
    expect(fromKm(2 * MI_KM, "mi")).toBe("2");
  });
  it("for the AI: the phases in words, in the session's line", () => {
    expect(phaseLine(allPhases([w], hr, T0 + 3_600_000), "mi")).toBe("Incline walk 18 min 0.9 mi (20:00 /mi) at 12 % incline, avg 128 bpm; Run 22 min 2.0 mi (11:00 /mi), avg 163 bpm");
    const spans = cardioSpans([w], T0 + 3_600_000);
    expect(cardioLine(spans[0], spans, hr, 80)).toMatch(/^Incline walk → Run 18:00–18:40 \(40 min\): heart rate avg 147.*; phases: Incline walk 18 min 0\.9 mi \(20:00 \/mi\) at 12 % incline, avg 128 bpm; Run 22 min 2\.0 mi \(11:00 \/mi\), avg 163 bpm — the first of its kind$/);
  });
});

// PLAN 191 phase 2 (owner, 3 Nov: "1 and 2"): the cardio after lifting in phases too; each phase's calories at its own
// kind's MET (10 min Stairmaster 9 MET + 20 min Run 8 MET at 80 kg = 120 + 213 = 333, not 30 min of either); a best pace
// is one faster than every one before it of that kind, with 2 before it to beat.
describe("cardio phase 2", () => {
  const lift = (t0: number, cardio: { what: string; start: number; at?: number; done?: boolean }, phases?: { what: string; start: number; km?: number }[]) =>
    ({ id: "L" + t0, template: "Upper A", startedAt: t0, endedAt: (cardio.at ?? t0) + 5 * MIN, cardio: { what: cardio.what, startedAt: cardio.start, done: cardio.done, at: cardio.at }, ...(phases ? { phases } : {}) }) as Workout;
  it("the cardio after lifting: from its Start to its Done, in phases; skipped or never started, none", () => {
    const c0 = T0 + 50 * MIN, w = lift(T0, { what: "Stairmaster", start: c0, at: c0 + 30 * MIN, done: true }, [{ what: "Stairmaster", start: c0 }, { what: "Run", start: c0 + 10 * MIN, km: 2 * MI_KM }]);
    expect(phasesOf(w, T0 + 3 * 3_600_000).map((p) => [p.what, (p.end - p.start) / MIN])).toEqual([["Stairmaster", 10], ["Run", 20]]);
    expect(allPhases([w], [], T0 + 3 * 3_600_000).map((p) => [p.kind, p.km && paceText(p.pace!, "mi")])).toEqual([["Stairmaster", null], ["Run", "10:00"]]);
    expect(phasesOf(lift(T0, { what: "Run", start: c0, done: false }), T0)).toEqual([]);
    expect(phasesOf({ ...w, cardio: { what: "Run" } }, T0)).toEqual([]);
    // "Next" during it starts from its own Start, not the lifting's
    expect(nextPhase({ ...w, phases: undefined, cardio: { what: "Stairmaster", startedAt: c0 } }, "Run", c0 + 10 * MIN)).toEqual([{ what: "Stairmaster", start: c0 }, { what: "Run", start: c0 + 10 * MIN }]);
  });
  it("calories: each phase at its own kind's MET", () => {
    const ps = [{ what: "Stairmaster", start: T0, end: T0 + 10 * MIN }, { what: "Run", start: T0 + 10 * MIN, end: T0 + 30 * MIN }];
    expect(phasesKcal(ps, 80)).toEqual({ kcal: 333, parts: [{ what: "Stairmaster", met: 9, min: 10 }, { what: "Run", met: 8, min: 20 }] });
    expect(phasesKcal(ps, null)).toBeNull();
    const s = session(T0, [{ what: "Stairmaster", min: 10 }, { what: "Run", min: 20 }]);
    expect(spanKcal(cardioSpans([s], T0 + 3_600_000)[0], 80)).toBe(333);
  });
  it("a new best: faster than every one before it of that kind, with 2 to beat", () => {
    const runs = [24, 23, 22.5, 21].map((m, i) => session(T0 + i * 86_400_000, [{ what: "Run", min: m, mi: 2 }]));
    const ps = allPhases(runs, [], T0 + 5 * 86_400_000);
    expect(newBests(ps, 0).map((b) => [new Date(b.start).getDate(), paceText(b.pace, "mi"), Math.round(b.by * MI_KM)])).toEqual([[4, "11:15", 15], [5, "10:30", 45]]);
    expect(newBests(ps, T0 + 3 * 86_400_000).map((b) => paceText(b.pace, "mi"))).toEqual(["10:30"]);
    expect(newBests(ps.slice(0, 2), 0)).toEqual([]); // the second run: only 1 before it
  });
});
