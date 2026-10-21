import { describe, expect, it } from "vitest";
import { experimentStrip, verdictLines, verdictsDue } from "./experiment";
import { checkVerdict } from "./tasks";
import { feelWorld } from "../bench";
import { addDays } from "../time";
import type { Experiment } from "../store";

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
