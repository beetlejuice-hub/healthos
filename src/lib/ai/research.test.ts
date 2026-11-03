// PLAN 192 — owner, 3 Nov: "Ai should do researches on its own but do not let it soend way too much credits. Like researxh
// on what i take what i eat how i train how much i move my heartrate etc". The app picks the topics from the data (no call
// to choose), at most one a day and 4 a week, the area looked at longest ago first, a topic again after 45 days or a new
// dose; never past its own $2.50 a month, nor once the month's AI spend is past half the budget.
import { describe, expect, it } from "vitest";
import { keepResearch, nextResearch, RESEARCH, researchContext, researchLines, researchTopics, researchUsd, type Researched, type Topic } from "./research";
import type { Entry, Supplement, Workout } from "../types";
import { EMPTY_PROFILE } from "../store";

const NOW = new Date("2026-11-03T12:00:00").getTime(), D = 86_400_000;
const at = (k: number, h = 9) => new Date(new Date(NOW - k * D).setHours(h, 0, 0, 0)).getTime();
const cre: Supplement = { id: "cre", name: "Creatine", dose: "5 g", slot: "morning", at: 480, active: true };
const lth: Supplement = { id: "lth", name: "L-theanine", dose: "200 mg", slot: "morning", at: 480, active: true, schedule: { kind: "needed" } };
const mag: Supplement = { id: "mag", name: "Magnesium", dose: "400 mg", slot: "evening", at: 1290, active: true };
function world(): { entries: Entry[]; workouts: Workout[] } {
  const entries: Entry[] = [];
  for (let k = 1; k <= 30; k++) {
    if (k <= 14) entries.push({ id: `c${k}`, kind: "supp", at: at(k), suppId: "cre", status: "taken" });
    if (k <= 2) entries.push({ id: `m${k}`, kind: "supp", at: at(k, 21), suppId: "mag", status: "taken" }); // 2 days: not enough
    if (k === 3 || k === 9) entries.push({ id: `l${k}`, kind: "supp", at: at(k, 15), suppId: "lth", status: "taken" }); // when needed: twice is enough
    if (k % 2) entries.push({ id: `f${k}`, kind: "food", at: at(k, 8), name: "Túró Rudi", grams: 30, macros: { kcal: 125, p: 4, c: 11, f: 7 } });
    if (k % 6 === 0) entries.push({ id: `s${k}`, kind: "food", at: at(k, 13), name: "Pizza", grams: 400, macros: { kcal: 1000, p: 40, c: 110, f: 40 } });
    if (k <= 28 && k % 4 === 0) for (let j = 0; j < 3; j++) entries.push({ id: `b${k}${j}`, kind: "set", at: at(k, 18) + j * 60_000, workoutId: `w${k}`, exercise: "Bench press", kg: 70 + (k % 8), reps: 8 });
  }
  return { entries, workouts: [] };
}
const rhr = Object.fromEntries(Array.from({ length: 60 }, (_, k) => [new Date(NOW - (k + 1) * D).toISOString().slice(0, 10), k < 30 ? 56 : 59]));
const band = { rhr, hrv: {}, steps: [], hr: [] };
const R = (key: string, area: Researched["area"], daysAgo: number, usd = 0.07): Researched => ({ key, area, name: key, title: `t ${key}`, known: "k.", forYou: "", tip: "Keep it.", found: [], sure: "moderate", at: NOW - daysAgo * D, day: new Date(NOW - daysAgo * D).toISOString().slice(0, 10), usd });
const SPEND = { monthUsd: 3, budget: 20 };

describe("the app's own research (PLAN 192)", () => {
  const topics = researchTopics({ ...world(), supplements: [cre, lth, mag], settings: {}, goals: { kcal: 2300, p: 160 } }, band, NOW);
  it("topics from the data: what you take (enough days), what you eat often, how you train, your heart; not what there's too little of", () => {
    expect(topics.map((t) => t.key)).toEqual(["supp:cre:5g", "supp:lth:200mg", "food:túró rudi", "training", "heart"]);
    expect(topics[0].lines[0]).toBe("- What: a supplement I take — Creatine, 5 g, every day, in the morning; taken on 14 of the last 14 days.");
    expect(topics[2].lines[0]).toBe("- What: a food I eat often — Túró Rudi, on 15 of the last 30 days; a usual serving 30 g, 125 kcal, 4 g protein.");
    expect(topics[3].lines[0]).toMatch(/^- What: how I train — 7 lifting sessions in the last 4 weeks/);
    expect(topics[4].lines[0]).toBe("- What: my heart — resting heart rate 56 bpm over the last 30 days (59 the 30 before), from a wrist band.");
  });
  it("one a day, 4 a week; the area looked at longest ago first; a topic again after 45 days", () => {
    expect(nextResearch(topics, [], NOW, SPEND)).toEqual({ topic: topics[0] });
    expect(nextResearch(topics, [R("supp:cre:5g", "supp", 0)], NOW, SPEND)).toEqual({ wait: "one a day" });
    const week = [1, 2, 3, 4].map((k) => R(`x${k}`, "steps", k));
    expect(nextResearch(topics, week, NOW, SPEND)).toEqual({ wait: "4 a week" });
    // supplements done 2 days ago: food next (never done), not the other supplement
    expect("topic" in nextResearch(topics, [R("supp:cre:5g", "supp", 2)], NOW, SPEND) && (nextResearch(topics, [R("supp:cre:5g", "supp", 2)], NOW, SPEND) as { topic: Topic }).topic.key).toBe("food:túró rudi");
    // every area done, the oldest the supplements 10 days ago: the supplement not done yet
    const all = [R("supp:cre:5g", "supp", 10), R("food:túró rudi", "food", 9), R("training", "training", 8), R("heart", "heart", 7)];
    expect((nextResearch(topics, all, NOW, SPEND) as { topic: Topic }).topic.key).toBe("supp:lth:200mg");
    // all done in the last 45 days: nothing new; 46 days on, they come back
    const done = topics.map((t) => R(t.key, t.area, 20));
    expect(nextResearch(topics, done, NOW, SPEND)).toEqual({ wait: "nothing new to look into" });
    expect("topic" in nextResearch(topics, topics.map((t) => R(t.key, t.area, RESEARCH.againDays + 1)), NOW, SPEND)).toBe(true);
  });
  it("a new dose is a new topic", () => {
    const t2 = researchTopics({ ...world(), supplements: [{ ...cre, dose: "10 g" }], settings: {} }, null, NOW);
    expect(t2[0].key).toBe("supp:cre:10g");
    // the old dose was looked at 5 days ago; with the supplements' turn next, the new dose is what's picked
    expect((nextResearch(t2, [R("supp:cre:5g", "supp", 5), R("food:túró rudi", "food", 3), R("training", "training", 2)], NOW, SPEND) as { topic: Topic }).topic.key).toBe("supp:cre:10g");
  });
  it("the budget: never past $2.50 of research a month, none past half the month's budget, none while the spend isn't known; off is off", () => {
    const spent = Array.from({ length: 3 }, (_, k) => R(`y${k}`, "steps", 8 + k, 0.9));
    expect(researchUsd(spent, "2026-11-03")).toBeCloseTo(0); // those were in October
    const nov = [R("a", "steps", 1, 1.3), R("b", "steps", 2, 1.3)];
    expect(nextResearch(topics, nov, NOW + D, SPEND)).toEqual({ wait: "this month's $2.50 for research is spent" });
    expect(nextResearch(topics, [], NOW, { monthUsd: 10, budget: 20 })).toEqual({ wait: "the month's AI spend is past half the $20 budget" });
    expect(nextResearch(topics, [], NOW, { monthUsd: null, budget: 20 })).toEqual({ wait: "the month's AI spend isn't known yet" });
    expect(nextResearch(topics, [], NOW, SPEND, true)).toEqual({ wait: "off in Settings → AI" });
    expect(nextResearch(topics, [], new Date("2026-11-03T08:00:00").getTime(), SPEND)).toEqual({ wait: "from 10:00" });
  });
  it("the call is small: About me, the topic, what's been researched — and the reads are told", () => {
    const c = researchContext(topics[0], { ...EMPTY_PROFILE, aims: ["lose fat, keep muscle"], meds: [] }, [R("food:túró rudi", "food", 3)]);
    expect(c).toMatch(/^## About me\nMy goals \(in my words\): lose fat, keep muscle\.\nConditions: none listed\. Medications: none listed\. Allergies: none listed\.\n## The topic \(the app's pick, from my data\)\n- What: a supplement I take — Creatine/);
    expect(c).toMatch(/## Already researched \(never repeat a title\)\n- t food:túró rudi$/);
    expect(c.length).toBeLessThan(2000);
    const kept = keepResearch([], topics[0], { title: "Creatine timing", known: "Timing matters little.", forYou: "", tip: "Keep 5 g daily.", found: [], sure: "moderate" }, 0.06, NOW);
    expect(researchLines(kept, "2026-11-03")).toEqual(["## What the app researched for me lately (its own look-ups — build on them, don't repeat them)", "- 2026-11-03: Creatine timing — Keep 5 g daily."]);
  });
});

describe("cheap to ask (PLAN 192)", () => {
  it("the topics are only worked out once every other check has passed", () => {
    let built = 0;
    const lazy = () => { built++; return [{ key: "steps", area: "steps" as const, name: "your steps", lines: [] }]; };
    nextResearch(lazy, [], new Date("2026-11-03T08:00:00").getTime(), { monthUsd: 3, budget: 20 });
    nextResearch(lazy, [], new Date("2026-11-03T12:00:00").getTime(), { monthUsd: null, budget: 20 });
    nextResearch(lazy, [], new Date("2026-11-03T12:00:00").getTime(), { monthUsd: 3, budget: 20 }, true);
    expect(built).toBe(0);
    expect(nextResearch(lazy, [], new Date("2026-11-03T12:00:00").getTime(), { monthUsd: 3, budget: 20 })).toMatchObject({ topic: { key: "steps" } });
    expect(built).toBe(1);
  });
});
