// Watching (owner, 28 Oct: "make sure if i note like i feel creatine makes my muscles fuller … make ai look out for
// these things … give me followup questions"). Known answers: which day of it, when its question is due (from 18:00,
// once a day, not after its last day, not once stopped), what the AI is told.
import { describe, expect, it } from "vitest";
import { watchDay, watchDue, watchLines, watchProgress, watchSteps, type Watch } from "./watch";
import type { Entry } from "./types";

const at = (d: string, hm: string) => new Date(`${d}T${hm}:00`).getTime();
const W: Watch = { id: "cr", at: at("2026-10-23", "20:12"), start: "2026-10-23", what: "Creatine → fuller muscles", note: "creatine makes my muscles fuller",
  question: "Muscles feel full today?", options: ["Not really", "A bit", "Very"], days: 14, found: [{ text: "Creatine pulls water into muscle, 1–2 kg in the first weeks", sure: "strong", source: { title: "Kreider 2017", url: "https://example.org/k" } }] };
const ans = (d: string, a: string): Entry => ({ id: `a${d}`, kind: "answer", at: at(d, "20:30"), key: "watch:cr", question: W.question, answer: a });
const A = [ans("2026-10-23", "A bit"), ans("2026-10-24", "A bit"), ans("2026-10-26", "Very"), ans("2026-10-27", "Very")];

describe("a watch's days", () => {
  it("day 1 is the day it started; day 6 five days on", () => {
    expect(watchDay(W, at("2026-10-23", "21:00"))).toBe(1);
    expect(watchDay(W, at("2026-10-28", "09:00"))).toBe(6);
  });
  it("its question: from 18:00, once a day, through day 14, never once stopped", () => {
    expect(watchDue(W, A, at("2026-10-28", "17:59"))).toBe(false);
    expect(watchDue(W, A, at("2026-10-28", "18:00"))).toBe(true);
    expect(watchDue(W, [...A, ans("2026-10-28", "Very")], at("2026-10-28", "21:00"))).toBe(false); // answered tonight
    expect(watchDue(W, A, at("2026-11-05", "20:00"))).toBe(true); // day 14
    expect(watchDue(W, A, at("2026-11-06", "20:00"))).toBe(false); // day 15: over
    expect(watchDue({ ...W, stopped: at("2026-10-27", "10:00") }, A, at("2026-10-28", "20:00"))).toBe(false);
  });
  it("progress and the answers as steps", () => {
    expect(watchProgress(W, A, at("2026-10-28", "20:00"))).toBe("Day 6 of 14 · 4 answers so far");
    expect(watchProgress(W, [], at("2026-10-23", "20:00"))).toBe("Day 1 of 14");
    expect(watchSteps(W, A)).toEqual([1, 1, 2, 2]);
  });
});

describe("what the AI is told", () => {
  it("your note, the day, the question, the answers by day, what was found", () => {
    expect(watchLines([W], { entries: A, workouts: [] }, at("2026-10-28", "20:00"))).toEqual([
      'Creatine → fuller muscles — my note: "creatine makes my muscles fuller"; day 6 of 14, asks "Muscles feel full today?" (Not really / A bit / Very) each evening; answers: Fri 23 A bit, Sat 24 A bit, Mon 26 Very, Tue 27 Very; found before: Creatine pulls water into muscle, 1–2 kg in the first weeks (strong)',
    ]);
  });
  it("a week after it ends it's still there (for the verdict); stopped ones aren't", () => {
    expect(watchLines([W], { entries: A, workouts: [] }, at("2026-11-08", "09:00"))[0]).toMatch(/ended Thu 5 Nov/);
    expect(watchLines([W], { entries: A, workouts: [] }, at("2026-11-13", "09:00"))).toEqual([]);
    expect(watchLines([{ ...W, stopped: 1 }], { entries: A, workouts: [] }, at("2026-10-28", "09:00"))).toEqual([]);
  });
});

// Phase 2 (owner: "phase2"): your data on a watch. Planted effects and controls, each with a known answer.
import { causeTimes, watchAfterOf, watchFindings } from "./watch";
import { paired, t95 } from "./stats";
import type { Workout } from "./types";

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const days = (n: number) => Array.from({ length: n }, (_, k) => `2026-10-${String(1 + k).padStart(2, "0")}`);

describe("paired differences on few pairs: the t distribution, not 1.96", () => {
  it("known answers", () => {
    expect(t95(2)).toBe(4.30);
    const r = paired([1, 2, 3])!; // mean 2, sd 1, se 0.577 × 4.30 = 2.48 → −0.48 … 4.48: not clear
    expect([r.value, +r.lo.toFixed(2), r.clear]).toEqual([2, -0.48, false]);
    expect(paired([1.4, 1.5, 1.6, 1.5, 1.5])!.clear).toBe(true);
    expect(paired([1, 2])).toBeNull();
  });
});

describe("the evening answers on its days against the rest", () => {
  const CR: Watch = { ...W, start: "2026-10-01", at: at("2026-10-01", "08:00"), days: 28, cause: { kind: "supplement", name: "Creatine", suppId: "cr5" } };
  const world = (planted: boolean, seed = 7) => {
    const r = rng(seed), entries: Entry[] = [];
    days(20).forEach((d, i) => {
      const took = i % 3 !== 0; // 13 of 20 days
      if (took) entries.push({ id: `s${i}`, kind: "supp", at: at(d, "08:00"), suppId: "cr5", status: "taken" });
      const v = planted ? (took ? (r() < 0.8 ? 2 : 1) : (r() < 0.8 ? 0 : 1)) : Math.floor(r() * 3);
      entries.push({ id: `a${i}`, kind: "answer", at: at(d, "20:30"), key: "watch:cr", question: W.question, answer: W.options[v] });
    });
    return { entries, workouts: [] as Workout[] };
  };
  it("planted: fuller on creatine days → clear, with the words of the answers", () => {
    const f = watchFindings(CR, world(true), at("2026-10-20", "21:00"));
    expect(f).toHaveLength(1);
    expect(f[0].label).toBe("clear");
    expect(f[0].text).toMatch(/^on creatine days you answered “Very” \([\d.]+ of 2\), without “Not really” \([\d.]+\)$/);
  });
  it("control: answers that don't depend on it → not clear, over 5 different worlds", () => {
    for (const seed of [1, 2, 3, 4, 5]) expect(watchFindings(CR, world(false, seed), at("2026-10-20", "21:00"))[0].label).not.toBe("clear");
  });
  it("taken every day → nothing to compare yet; two days → early", () => {
    const every = { entries: [...days(5).map((d, i): Entry => ({ id: `s${i}`, kind: "supp", at: at(d, "08:00"), suppId: "cr5", status: "taken" })), ...days(5).map((d, i): Entry => ({ id: `a${i}`, kind: "answer", at: at(d, "20:30"), key: "watch:cr", question: W.question, answer: "Very" }))], workouts: [] };
    expect(watchFindings(CR, every, at("2026-10-05", "21:00"))).toEqual([{ label: "early", text: "5 answers, all on creatine days — nothing to compare yet" }]);
    const two = { entries: every.entries.filter((e) => e.kind === "supp" || e.at < at("2026-10-03", "00:00")), workouts: [] };
    expect(watchFindings(CR, two, at("2026-10-05", "21:00"))[0]).toEqual({ label: "early", text: "2 answers: 2 on creatine days, 0 without — 3 of each before it can say" });
  });
});

describe("check-ins around each time", () => {
  const WALK: Watch = { ...W, id: "wk", what: "Walks → more energy", note: "i feel better after a walk", question: "Better than before the walk?", options: ["Worse", "Same", "Better"], start: "2026-10-01", at: at("2026-10-01", "08:00"), days: 28,
    cause: { kind: "cardio", name: "Walk" }, feel: "energy", afterMin: 30 };
  const world = (lift: number, n = 6, seed = 3) => {
    const r = rng(seed), entries: Entry[] = [], workouts: Workout[] = [];
    days(n).forEach((d, i) => {
      workouts.push({ id: `w${i}`, template: "Walk", kind: "cardio", startedAt: at(d, "17:00"), endedAt: at(d, "17:30"), cardio: { what: "Walk" } });
      entries.push({ id: `b${i}`, kind: "feel", at: at(d, "16:00"), energy: 5 });
      entries.push({ id: `c${i}`, kind: "feel", at: at(d, "18:15"), energy: Math.round(5 + lift + (r() - 0.5) * 1.2) });
      entries.push({ id: `x${i}`, kind: "feel", at: at(d, "12:00"), energy: 9 }); // too early to count as "before"
    });
    return { entries, workouts };
  };
  it("planted: energy +1.5 after a walk → clear; the walks are found by what they were", () => {
    const d = world(1.5);
    expect(causeTimes(WALK.cause!, d)).toHaveLength(6);
    const f = watchFindings(WALK, d, at("2026-10-07", "09:00"));
    expect(f).toEqual([{ label: "clear", text: expect.stringMatching(/^after 6 walks, energy at your next check-in was \+1\.[3-7] against the one before$/) }]);
  });
  it("control: no lift → not clear; two walks → early", () => {
    expect(watchFindings(WALK, world(0), at("2026-10-07", "09:00"))[0].label).not.toBe("clear");
    expect(watchFindings(WALK, world(1.5, 2), at("2026-10-07", "09:00"))).toEqual([{ label: "early", text: "2 times with a check-in before and after walk so far — 3 before it can say" }]);
  });
  it("a check-in tag: the check-in that says 'outside' against the one before it", () => {
    const OUT: Watch = { ...WALK, cause: { kind: "doing", name: "outside" }, afterMin: undefined };
    const entries: Entry[] = days(4).flatMap((d, i): Entry[] => [{ id: `p${i}`, kind: "feel", at: at(d, "13:00"), mood: 5 }, { id: `o${i}`, kind: "feel", at: at(d, "17:00"), mood: 7, doing: ["outside"] }]);
    // every pair +2 exactly: no spread, so the range is a point — clear
    expect(watchFindings({ ...OUT, feel: "mood" }, { entries, workouts: [] }, at("2026-10-05", "09:00"))).toEqual([{ label: "clear", text: "on 4 check-ins that said “outside”, mood was +2 against the check-in before" }]);
  });
  it("asked 30 minutes after each walk: not at 17:50, at 18:05, once — and again after the next", () => {
    const d = world(1.5, 1), as = (h: string) => watchDue(WALK, d.entries, at("2026-10-01", h), d.workouts);
    expect([as("17:50"), as("18:05"), as("20:31")]).toEqual([false, true, false]); // 17:30 + 30 min; gone 3 h on
    const answered = [...d.entries, { id: "ans", kind: "answer" as const, at: at("2026-10-01", "18:10"), key: "watch:wk", question: WALK.question, answer: "Better" }];
    expect(watchDue(WALK, answered, at("2026-10-01", "18:20"), d.workouts)).toBe(false);
    const again = [...d.workouts, { id: "w9", template: "Walk", kind: "cardio" as const, startedAt: at("2026-10-01", "19:00"), endedAt: at("2026-10-01", "19:20"), cardio: { what: "Walk" } }];
    expect(watchDue(WALK, answered, at("2026-10-01", "19:55"), again)).toBe(true);
    expect(new Date(watchAfterOf(WALK, { entries: answered, workouts: again }, at("2026-10-01", "19:55"))!).getHours()).toBe(19);
  });
});
