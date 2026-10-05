import { describe, expect, it } from "vitest";
import { patterns, rolling7, weeklyTrend } from "./patterns";
import type { GlanceDay } from "./glance";
import type { Entry } from "./types";
import { addDays, atMinute } from "./time";

const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

/** 70 days. Planted: drinks the night before → mood −2; a "deadline" note on days with mood −1.5. Calories: pure noise. */
function world(seed = 3) {
  const r = rng(seed), days: GlanceDay[] = [], entries: Entry[] = [];
  for (let i = 0; i < 70; i++) {
    const day = addDays("2026-07-01", i), drinks = r() < 0.2 ? 2 : 0, deadline = r() < 0.15, prevDrinks = (days[i - 1]?.drinks ?? 0) > 0;
    const mood = 6.5 + gauss(r) * 0.7 - (prevDrinks ? 2 : 0) - (deadline ? 1.5 : 0);
    days.push({ day, mood, energy: 6, focus: null, stress: 4, sleep: 7, kcal: 2300 + gauss(r) * 300, protein: 140, cafBed: 20, drinks, weight: null, trained: r() < 0.4, lateCaffeine: false, note: deadline, checkins: 2 });
    if (deadline) entries.push({ id: `n${i}`, kind: "feel", at: atMinute(day, 15 * 60), mood: Math.round(mood), note: i % 2 ? "Deadline at work, long meeting" : "deadline again" });
    else if (i % 5 === 0) entries.push({ id: `m${i}`, kind: "feel", at: atMinute(day, 20 * 60), mood: Math.round(mood), note: "good chat with friends" });
  }
  return { days, entries };
}

describe("patterns: before your best and worst days", () => {
  const { days, entries } = world();
  const p = patterns(days, entries);
  if (!("worst" in p)) throw new Error("expected patterns");
  const row = (side: typeof p.worst, k: string) => side.rows.find((r) => r.f.k === k)!;
  it("finds the planted one: worst days follow drinks far more often", () => {
    const d = row(p.worst, "drinks");
    expect(d.diff!.clear).toBe(true);
    expect(d.group).toBeGreaterThan(d.rest + 0.3);
    expect(p.worst.rows[0].f.k).toBe("drinks"); // the clearest comes first
  });
  it("doesn't find what isn't there: calories the day before stay unclear", () => {
    let clear = 0;
    for (let s = 1; s <= 40; s++) { const q = patterns(world(s).days, world(s).entries); if ("worst" in q && q.worst.rows.find((r) => r.f.k === "kcalBefore")!.diff?.clear) clear++; }
    expect(clear / 40).toBeLessThan(0.15);
  });
  it("names the words that keep showing up on the worst days, not the everyday ones", () => {
    expect(p.worst.words.map((w) => w.word)).toContain("deadline");
    expect(p.worst.words.map((w) => w.word)).not.toContain("friends");
    expect(p.best.words.map((w) => w.word)).not.toContain("deadline");
  });
  it("waits for 20 rated days", () => {
    expect(patterns(days.slice(0, 12), entries)).toEqual({ need: 8 });
  });
});

describe("weeklyTrend", () => {
  it("finds a planted rise of 0.5 a week and calls a flat line not clear", () => {
    const r = rng(9), up = Array.from({ length: 28 }, (_, i) => ({ mood: 5 + (i / 7) * 0.5 + gauss(r) * 0.3 })) as GlanceDay[];
    const t = weeklyTrend(up, "mood")!;
    expect(t.perWeek).toBeGreaterThan(0.3); expect(t.perWeek).toBeLessThan(0.7); expect(t.clear).toBe(true);
    const flat = Array.from({ length: 28 }, () => ({ mood: 5 + gauss(r) * 0.3 })) as GlanceDay[];
    expect(weeklyTrend(flat, "mood")!.clear).toBe(false);
  });
  it("rolls a 7-day average once 3 days are in", () => {
    expect(rolling7([4, null, 6, 8, null])).toEqual([null, null, null, 6, 6]); // day 3 has only 2 values in its window
  });
});
