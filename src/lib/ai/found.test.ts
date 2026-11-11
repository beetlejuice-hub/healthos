// PLAN 214 — what the app's own maths found, as the AI is told it. Known inputs: a band with today's body watch alert,
// a stand-out and a weak spot (with its fix), a finished experiment the person guessed right. Control: a quiet band,
// nothing standing out, no experiments — nothing said.
import { describe, expect, it } from "vitest";
import type { BandData } from "../band";
import type { Experiment } from "../store";
import { addDays } from "../time";
import type { VsNow } from "../vsnow";
import { feelWorld } from "../bench";
import { foundLines } from "./found";

const TODAY = "2026-11-11";
function band(alert: boolean): BandData {
  const b = { rhr: {}, hrv: {}, skin: {}, breath: {}, spo2: {}, sleep: [], hr: [], steps: [] } as unknown as BandData & Record<string, Record<string, number>>;
  let x = 3; const r = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  for (let i = 60; i >= 0; i--) {
    const d = addDays(TODAY, -i), ill = alert && i <= 1;
    b.rhr[d] = Math.round(55 + (r() - 0.5) * 2 + (ill ? 7 : 0)); b.hrv[d] = Math.round(60 * (1 + (r() - 0.5) * 0.1) * (ill ? 0.75 : 1));
    b.skin![d] = 33.8 + (r() - 0.5) * 0.2 + (ill ? 0.7 : 0); b.breath![d] = 14 + (r() - 0.5) * 0.4; b.spo2![d] = 96 + (r() - 0.5) * 0.6;
  }
  return b;
}
const vs: VsNow = { stats: [], vs: null, stand: { good: [{ key: "HRT", title: "Resting heart 54 bpm", vs: "lower than about 90 % of 92,457 Fitbit wearers (average 65)", score: 0.8 }],
  bad: [{ key: "alc", title: "Drinks 10 a week (140 g)", vs: "1.3× the UK's low-risk line of 14 units (112 g) a week", score: -0.5, fix: "Under 112 g a week (UK Chief Medical Officers 2016)." }] } };
const days = feelWorld({ seed: 7, days: 60, rateRate: 1 }).map((d, i) => ({ ...d, day: addDays("2026-08-01", i) }));
const x: Experiment = { id: "x", name: "No caffeine after 14:00", how: "", days: 21, measure: "energy", start: addDays("2026-08-01", 30), guess: "helps" };
const lifted = days.map((d) => (d.day >= x.start && d.energy != null ? { ...d, energy: d.energy + 1.5 } : d));

describe("what the app found, for the AI (PLAN 214)", () => {
  it("body watch, you vs everyone with the fix, an experiment with how sure and the guess, the gut's record", () => {
    const l = foundLines({ band: band(true), entries: [], days: lifted, experiments: [x], vs, today: addDays(x.start, 25) }).join("\n");
    const today = foundLines({ band: band(true), entries: [], days: [], experiments: [], vs: null, today: TODAY }).join("\n");
    expect(today).toMatch(/^Body watch \(on Today this morning\): resting heart rate \+\d bpm, hrv −\d+ %, skin temperature \+0\.\d °C against their usual, 2 mornings running/);
    expect(l).toContain("Stands out against everyone: Resting heart 54 bpm — lower than about 90 % of 92,457 Fitbit wearers (average 65).");
    expect(l).toContain("Behind against everyone: Drinks 10 a week (140 g) — 1.3× the UK's low-risk line of 14 units (112 g) a week. The app's fix: Under 112 g a week (UK Chief Medical Officers 2016).");
    expect(l).toMatch(/Experiment "No caffeine after 14:00" \(energy\): worked for you — 99 % sure it helped; they guessed "helps" — right\./);
    expect(l).toContain("Your gut so far: right 1 of 1.");
  });
  it("control: a quiet band, nothing standing out, no experiments — nothing said", () => {
    expect(foundLines({ band: band(false), entries: [], days: [], experiments: [], vs: { stats: [], vs: null, stand: { good: [], bad: [] } }, today: TODAY })).toEqual([]);
  });
});
