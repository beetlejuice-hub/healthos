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
    expect(watchLines([W], A, at("2026-10-28", "20:00"))).toEqual([
      'Creatine → fuller muscles — my note: "creatine makes my muscles fuller"; day 6 of 14, asks "Muscles feel full today?" (Not really / A bit / Very) each evening; answers: Fri 23 A bit, Sat 24 A bit, Mon 26 Very, Tue 27 Very; found before: Creatine pulls water into muscle, 1–2 kg in the first weeks (strong)',
    ]);
  });
  it("a week after it ends it's still there (for the verdict); stopped ones aren't", () => {
    expect(watchLines([W], A, at("2026-11-08", "09:00"))[0]).toMatch(/ended Thu 5 Nov/);
    expect(watchLines([W], A, at("2026-11-13", "09:00"))).toEqual([]);
    expect(watchLines([{ ...W, stopped: 1 }], A, at("2026-10-28", "09:00"))).toEqual([]);
  });
});
