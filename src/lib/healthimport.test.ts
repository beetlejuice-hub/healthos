// PLAN 184 — Apple Health in (owner, 29 Oct: "i use MovingLife"; "pls select all that are interesting or important").
// Known answers: what a Shortcut sends (text with a comma, lb, a fraction for body fat, m/s) comes out in kg / % / km/h;
// readings that can't be right, from the future or too old are dropped; weigh-ins are made once, with the body fat
// weighed with them, never doubling one you typed, never bringing back one you deleted.
import { describe, expect, it } from "vitest";
import { HEALTH, healthId, keepSamples, readPost, readPostWhy, toUnit, weighInsToAdd, type HealthSample } from "./healthimport";
import { bodyFat } from "./bodyfat";
import type { Entry } from "./types";

const NOW = new Date("2026-10-29T09:00:00+02:00").getTime(), MIN = 60_000, DAY = 86_400_000;
const at = (iso: string) => new Date(iso).getTime();

describe("what the Shortcut sends", () => {
  it("in the app's units: kg from lb, % from a fraction, km/h from m/s and mph; text with a comma", () => {
    expect(readPost({ weight: "82,4", weightUnit: "kg", weightAt: "2026-10-29T07:31:00+02:00", fat: 0.182, fatAt: "2026-10-29T07:31:00+02:00", walk: "1.4", walkUnit: "m/s", walkAt: "2026-10-28T20:00:00+02:00" }, NOW))
      .toEqual([{ type: "weight", at: at("2026-10-29T07:31:00+02:00"), value: 82.4 }, { type: "fat", at: at("2026-10-29T07:31:00+02:00"), value: 18.2 }, { type: "walk", at: at("2026-10-28T20:00:00+02:00"), value: 5.04 }]);
    expect([toUnit("weight", 181.7, "lb"), toUnit("fat", 18.2, "%"), toUnit("walk", 3.1, "mph"), toUnit("walk", 4.8, "km/hr")]).toEqual([82.42, 18.2, 4.99, 4.8]);
  });
  it("controls: an impossible reading, one from tomorrow, one older than 400 days, an empty post — nothing", () => {
    expect(readPost({ weight: 8.24, weightAt: "2026-10-29T07:31:00+02:00", fat: 85, fatAt: "2026-10-29T07:31:00+02:00", walk: 40, walkAt: "2026-10-29T07:00:00+02:00" }, NOW)).toEqual([]);
    expect(readPost({ weight: 82, weightAt: "2026-10-30T07:31:00+02:00" }, NOW)).toEqual([]);
    expect(readPost({ weight: 82, weightAt: new Date(NOW - 401 * DAY).toISOString() }, NOW)).toEqual([]);
    expect([readPost(null, NOW), readPost({}, NOW), readPost({ weight: 82 }, NOW)]).toEqual([[], [], []]);
  });
  it("a field that came but was left out says why (owner, 29 Oct: \"got weight walk ok true\" — body fat silently missing)", () => {
    const at = "2026-10-29T07:31:00+02:00";
    const why = (b: Record<string, unknown>) => readPostWhy({ weight: 82.4, weightAt: at, ...b }, NOW);
    const w = { walk: 4.9, walkAt: at };
    expect(why({ ...w, fat: 18.6, fatAt: "Oct 29, 2026 at 7:31 AM" }).skipped).toEqual({ fat: "fatAt “Oct 29, 2026 at 7:31 AM” isn't a date — set its Date Format to ISO 8601 with the time on" });
    expect(why({ ...w, fat: 18.6 }).skipped).toEqual({ fat: "fatAt is missing" });
    expect(why({ ...w, fat: "Body Fat Percentage", fatAt: at }).skipped).toEqual({ fat: "fat “Body Fat Percentage” isn't a number — pick its Value" });
    expect(why({ ...w, fat: 85, fatAt: at }).skipped).toEqual({ fat: "fat “85” isn't believable (3–60 %)" });
    expect(why({ fat: "", fatAt: at, walk: "4.9", walkAt: at }).skipped).toEqual({ fat: "fatAt came but fat was empty" });
    // owner, 29 Oct: "it doesnt mention fat" — both empty: Health gave the Shortcut none; not sent at all: which fields came
    expect(why({ fat: "", fatAt: "", walk: "4.9", walkAt: at }).skipped.fat).toMatch(/^fat came empty — the Shortcut got no Body Fat Percentage from Health: iPhone Settings → Health → Data Access & Devices → Shortcuts/);
    expect(why({ walk: "4.9", walkAt: at }).skipped).toEqual({ fat: "no “fat” field came (fields: weight, weightAt, walk, walkAt)" });
    expect(why({ fat: 18.6, fatAt: at, walk: "", walkAt: "" }).skipped).toEqual({ walk: "no walking speed from Health today yet" });
    // keys as typed: "Fat" / "FatAt " still count
    expect(readPost({ Fat: "18,6", "FatAt ": at }, NOW)).toEqual([{ type: "fat", at: Date.parse(at), value: 18.6 }]);
    // control: everything there → nothing left out
    expect(why({ fat: "18,6", fatAt: at, walk: 4.9, walkAt: at })).toEqual({ samples: [{ type: "weight", at: Date.parse(at), value: 82.4 }, { type: "fat", at: Date.parse(at), value: 18.6 }, { type: "walk", at: Date.parse(at), value: 4.9 }], skipped: {} });
  });
  it("owner, 29 Oct: \"sometimes i log manually my weight and it will send no new info … or it sends a prevoius one so make sure to catch that\"", () => {
    const old: HealthSample = { type: "weight", at: NOW - DAY, value: 82.4 };
    const first = weighInsToAdd([old], [], 0);
    expect(first.add).toHaveLength(1);
    // the next day the Shortcut sends the same reading again; you typed today's weight yourself
    const typed: Entry = { id: "t", kind: "weight", at: NOW - 60 * MIN, kg: 82.1 };
    const kept = keepSamples([old], [old], NOW);
    expect(kept).toEqual([old]);
    expect(weighInsToAdd(kept, [...first.add, typed], first.until)).toEqual({ add: [], fat: [], until: first.until });
  });
  it("kept: the same reading twice is one; the newest post wins; by time; older than kept → gone", () => {
    const a: HealthSample = { type: "weight", at: NOW - DAY, value: 82 }, b: HealthSample = { type: "weight", at: NOW - 2 * DAY, value: 82.6 };
    expect(keepSamples([a, b], [{ ...a, value: 81.9 }], NOW)).toEqual([b, { ...a, value: 81.9 }]);
    expect(keepSamples([{ type: "fat", at: NOW - (HEALTH.keepDays + 1) * DAY, value: 19 }], [], NOW)).toEqual([]);
  });
});

describe("weigh-ins from Health", () => {
  const w = (iso: string, value: number): HealthSample => ({ type: "weight", at: at(iso), value });
  const f = (iso: string, value: number): HealthSample => ({ type: "fat", at: at(iso), value });
  const typed = (iso: string, kg: number): Entry => ({ id: `t${iso}`, kind: "weight", at: at(iso), kg });
  it("each weight once, with the body fat weighed with it; until moves on", () => {
    const r = weighInsToAdd([w("2026-10-28T07:30:00Z", 82.6), f("2026-10-28T07:31:00Z", 18.9), w("2026-10-29T07:30:00Z", 82.4)], [], 0);
    expect(r.add).toEqual([
      { id: healthId(at("2026-10-28T07:30:00Z")), kind: "weight", at: at("2026-10-28T07:30:00Z"), kg: 82.6, fatPct: 18.9 },
      { id: healthId(at("2026-10-29T07:30:00Z")), kind: "weight", at: at("2026-10-29T07:30:00Z"), kg: 82.4 },
    ]);
    expect(r.until).toBe(at("2026-10-29T07:30:00Z"));
  });
  it("controls: one you typed within 30 min isn't doubled; one already in isn't again; one you deleted (before until) doesn't come back", () => {
    const s = [w("2026-10-29T07:30:00Z", 82.4)];
    expect(weighInsToAdd(s, [typed("2026-10-29T07:50:00Z", 82.5)], 0).add).toEqual([]);
    expect(weighInsToAdd(s, [typed("2026-10-29T08:10:00Z", 82.5)], 0).add).toHaveLength(1); // 40 min on: another weigh-in
    expect(weighInsToAdd(s, [{ id: healthId(at("2026-10-29T07:30:00Z")), kind: "weight", at: at("2026-10-29T07:30:00Z") + 1, kg: 82.4 }], 0).add).toEqual([]);
    expect(weighInsToAdd(s, [], at("2026-10-29T07:30:00Z"))).toEqual({ add: [], fat: [], until: at("2026-10-29T07:30:00Z") });
  });
  it("a body fat that came a post later goes onto its weigh-in; a fat 15 min off isn't its", () => {
    const e: Entry = { id: healthId(at("2026-10-29T07:30:00Z")), kind: "weight", at: at("2026-10-29T07:30:00Z"), kg: 82.4 };
    expect(weighInsToAdd([f("2026-10-29T07:32:00Z", 18.6)], [e], at("2026-10-29T07:30:00Z")).fat).toEqual([{ id: e.id, fatPct: 18.6 }]);
    expect(weighInsToAdd([f("2026-10-29T07:45:00Z", 18.6)], [e], at("2026-10-29T07:30:00Z")).fat).toEqual([]);
  });
  it("planted: 4 weeks of scale mornings, fat down 1 point a fortnight → the body-fat summary reads it from the imports alone", () => {
    const samples: HealthSample[] = [];
    for (let k = 27; k >= 0; k--) {
      const t = NOW - k * DAY - 90 * MIN;
      samples.push({ type: "weight", at: t, value: 82 }, { type: "fat", at: t + MIN, value: (k >= 14 ? 20 : 19) + ((k % 3) - 1) * 0.3 });
    }
    const { add } = weighInsToAdd(samples, [], 0);
    const s = bodyFat(add, NOW);
    expect(add).toHaveLength(28);
    expect(s.change!.pts).toBeCloseTo(-1, 1);
    expect(s.change!.fatKg).toBeCloseTo(-0.82, 1);
  });
});
