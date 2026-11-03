import { describe, expect, it } from "vitest";
import { experimentStrip, verdictLines, verdictsDue } from "./experiment";
import { checkVerdict } from "./tasks";
import { feelWorld } from "../bench";
import { addDays } from "../time";
import type { Experiment } from "../store";
import { judge } from "./apply";
import { xpCounted, xpEnd, xpToAsk } from "./xpdays";

// PLAN 160 — owner, 21 Oct: "do 2, 1, 3, 4" (4: experiments end with a verdict). The app's own test decides whether it
// worked; the AI only explains it. Planted: energy +1.5 during, against the same days with nothing planted.
const base = feelWorld({ seed: 7, days: 60, rateRate: 1 }).map((d, i) => ({ ...d, day: addDays("2026-08-01", i) }));
const x: Experiment = { id: "x", name: "No caffeine after 14:00", how: "Last coffee by 14:00", days: 21, measure: "energy", start: addDays("2026-08-01", 30) };
const lifted = base.map((d) => (d.day >= x.start && d.energy != null ? { ...d, energy: d.energy + 1.5 } : d));

describe("an experiment's verdict", () => {
  it("due once it has run its days, with the app's result: worked for the planted one, no clear change without", () => {
    const today = addDays(x.start, 25);
    const [d] = verdictsDue([x], lifted, today);
    expect(d.v.state).toBe("better");
    expect(verdictsDue([x], base, today)[0].v.state).toBe("no-clear-change");
  });
  it("not before its days are up, not when stopped early with too few days, not twice", () => {
    expect(verdictsDue([x], lifted, addDays(x.start, 10))).toEqual([]);
    expect(verdictsDue([{ ...x, ended: addDays(x.start, 6) }], lifted, addDays(x.start, 25))).toEqual([]);
    expect(verdictsDue([{ ...x, verdict: { at: 1, state: "better", text: "…", next: "", found: [] } }], lifted, addDays(x.start, 25))).toEqual([]);
  });
  it("the AI is told the app's result with its numbers — the result is the app's", () => {
    const [d] = verdictsDue([x], lifted, addDays(x.start, 25));
    const l = verdictLines(d.x, d.v).join("\n");
    expect(l).toMatch(/^## The experiment\n- No caffeine after 14:00: Last coffee by 14:00\n- 21 days from 2026-08-31, measured on energy \(1–10\)\n- The app's result: worked for you — energy \d\.\d in the 14 days before vs \d\.\d during \(\d+ \+ \d+ rated days\); difference \+1\.\d, 95% range \+\d\.\d to \+\d\.\d, weekends accounted for$/);
  });
  it("its answer: words required, at most 2 studies with real links", () => {
    expect(() => checkVerdict({ text: "", next: "", found: [] })).toThrow(SyntaxError);
    const f = (url: string) => ({ title: "t", text: "x", source: { title: "s", url } });
    expect(checkVerdict({ text: "Worked: +1.5.", next: "Keep it", found: [f("https://a.org"), f("http://b.org"), f("https://c.org"), f("https://d.org")] }).found.map((s) => s.source.url)).toEqual(["https://a.org", "https://c.org"]);
  });
});

describe("Today's experiments strip", () => {
  const T = "2026-10-21", ok = () => "running" as const;
  const run: Experiment = { id: "a", name: "No caffeine after 14:00", how: "Last coffee by 14:00", days: 21, measure: "energy", start: "2026-10-13" };
  it("running: its day and what to do today — no numbers mid-way", () => {
    expect(experimentStrip([run], T, ok)).toEqual([{ id: "a", done: false, text: "No caffeine after 14:00", sub: "day 9 of 21 — today: last coffee by 14:00" }]);
    expect(experimentStrip([{ ...run, start: T }], T, ok)[0].sub).toMatch(/^day 1 of 21/);
  });
  it("done with a verdict: the result until seen, for a week", () => {
    const at = Date.parse("2026-10-20T19:00:00");
    const done = { ...run, start: "2026-09-25", verdict: { at, state: "better" as const, text: "…", next: "", found: [] } };
    expect(experimentStrip([done], T, ok)).toEqual([{ id: "a", done: true, text: "No caffeine after 14:00", sub: "worked for you · see why" }]);
    expect(experimentStrip([{ ...done, verdict: { ...done.verdict, seen: at + 1 } }], T, ok)).toEqual([]);
    expect(experimentStrip([done], "2026-10-30", ok)).toEqual([]);
  });
  it("done without a verdict yet: the app's own result; stopped early: says so; a week on: gone", () => {
    const done = { ...run, start: "2026-09-25" };
    expect(experimentStrip([done], T, () => "no-clear-change")[0].sub).toBe("no clear change · the AI's read on it is coming");
    expect(experimentStrip([done], T, () => "too-few")[0].sub).toBe("done — not enough ratings to tell");
    expect(experimentStrip([{ ...run, ended: "2026-10-18" }], T, ok)[0].sub).toBe("ended early — too few days to tell");
    expect(experimentStrip([{ ...run, ended: "2026-10-18" }], "2026-10-26", ok)).toEqual([]);
    expect(experimentStrip([{ ...run, ended: "2026-10-18", seen: 1 }], T, ok)).toEqual([]);
  });
});

// PLAN 189 — owner, 3 Nov: "It should follow up every morning on last days experiment- if i did it or not. If not it should
// skip that day from experiment. Like i cant guarantee I'll do 14 days w no phone at night". Planted: energy +1.5 only on
// the days it was done; one day in three it wasn't (and said so). Left out, the test sees the effect at its size; counted,
// it's watered down. The end moves a day for each one left out, at most to twice its days.
describe("did you do it yesterday? (PLAN 189)", () => {
  const start = addDays("2026-08-01", 30), skip = (k: number) => k % 3 === 2;
  const did = Object.fromEntries(Array.from({ length: 21 }, (_, k) => [addDays(start, k), !skip(k)]));
  const y: Experiment = { id: "y", name: "No phone at night", how: "Phone out of the bedroom from 22:00", days: 14, measure: "energy", start, did };
  const doneOnly = base.map((d) => { const k = Math.round((Date.parse(d.day) - Date.parse(start)) / 86_400_000); return k >= 0 && k < 21 && !skip(k) && d.energy != null ? { ...d, energy: d.energy + 1.5 } : d; });
  it("a day you didn't is left out: 14 done days in 21, and the effect found at its size; counted, it's watered down", () => {
    expect(xpEnd(y)).toBe(addDays(start, 21));
    expect(xpCounted(y, addDays(start, 30))).toBe(14);
    const today = addDays(start, 22), [d] = verdictsDue([y], doneOnly, today);
    expect(d.v.state).toBe("better");
    expect(d.v.n[1]).toBe(14);
    expect(Math.abs(d.v.diff! - 1.5)).toBeLessThan(0.7);
    const all = judge({ ...y, did: undefined, days: 21 }, doneOnly, today);
    expect(all.diff!).toBeLessThan(d.v.diff! - 0.2);
    // control: nothing planted, the same days left out
    expect(verdictsDue([y], base, today)[0].v.state).toBe("no-clear-change");
  });
  it("the morning asks about the last 3 days not answered, newest first; none before the start, none once ended", () => {
    const x0: Experiment = { ...y, did: { [addDays(start, 1)]: true } };
    expect(xpToAsk(x0, addDays(start, 3))).toEqual([addDays(start, 2), addDays(start, 0)]);
    expect(xpToAsk(x0, start)).toEqual([]);
    expect(xpToAsk({ ...x0, ended: addDays(start, 2) }, addDays(start, 3))).toEqual([]);
  });
  it("the end waits for the last day's answer; a 'didn't' on it adds a day; at most twice its days", () => {
    const x0: Experiment = { ...y, did: {} }, end = addDays(start, 14);
    expect(verdictsDue([x0], doneOnly, end)).toEqual([]); // the 14th day not answered yet
    expect(verdictsDue([{ ...x0, did: { [addDays(end, -1)]: true } }], doneOnly, end)).toEqual([]); // nor the 2 before
    expect(verdictsDue([{ ...x0, did: { [addDays(end, -1)]: true, [addDays(end, -2)]: true, [addDays(end, -3)]: true } }], doneOnly, end)).toHaveLength(1);
    const no = { ...x0, did: { [addDays(end, -1)]: false } };
    expect(xpEnd(no)).toBe(addDays(end, 1));
    expect(verdictsDue([no], doneOnly, end)).toEqual([]);
    expect(xpToAsk(no, addDays(end, 1))).toEqual([end, addDays(end, -2)]); // the extra day, and one still unanswered
    expect(xpEnd({ ...x0, did: Object.fromEntries(Array.from({ length: 20 }, (_, k) => [addDays(start, k), false])) })).toBe(addDays(start, 28));
    // no answers at all: the days count, as before
    expect(verdictsDue([x0], doneOnly, addDays(end, 3))).toHaveLength(1);
  });
  it("the strip: the day it's on, how many left out; the last day waiting on its answer", () => {
    const x0: Experiment = { ...y, start: "2026-10-13", did: { "2026-10-15": false, "2026-10-16": true } };
    expect(experimentStrip([x0], "2026-10-18", () => "running")[0].sub).toBe("day 5 of 14 · 1 left out — today: phone out of the bedroom from 22:00");
    expect(experimentStrip([{ ...x0, did: {} }], "2026-10-27", () => "running")[0].sub).toBe("14 of 14 days — did you do it yesterday?");
  });
  it("the AI is told the days left out", () => {
    const [d] = verdictsDue([y], doneOnly, addDays(start, 22));
    expect(verdictLines(d.x, d.v).join("\n")).toMatch(/14 days from 2026-08-31, measured on energy \(1–10\); 7 days they said they didn't do it left out \(2026-09-02, /);
  });
});
