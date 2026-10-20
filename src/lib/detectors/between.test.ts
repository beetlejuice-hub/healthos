import { describe, expect, it } from "vitest";
import { betweenWorld } from "../bench";
import { atMinute } from "../time";
import { between, gaps } from "./between";
import type { Entry } from "../types";

const NOW = atMinute("2026-10-01", 23 * 60 + 30);
const run = (w: Parameters<typeof betweenWorld>[0]) => { const { entries, workouts } = betweenWorld(w); return between(entries, workouts, new Map(), NOW); };
const gymMood = (rs: ReturnType<typeof between>) => rs.find((r) => r.activity === "gym" && r.metric === "mood");
const seeds = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("between check-ins (bench)", () => {
  it("finds a planted +2 mood lift after the gym in most fake months, at about the right size", () => {
    const hits = seeds(30).map((seed) => gymMood(run({ seed, gymMood: 2 })));
    const found = hits.filter((h) => h?.found);
    expect(found.length).toBeGreaterThanOrEqual(21); // ≥ 70%
    const avg = found.reduce((s, h) => s + h!.effect, 0) / found.length;
    expect(Math.abs(avg - 2)).toBeLessThan(0.7);
  });

  it("isn't fooled by the rebound: gym only after a low lunchtime, gym does nothing", () => {
    // Exactly the owner's "bad mood → gym → better" story, with no real effect behind it.
    const rs = seeds(30).map((seed) => gymMood(run({ seed, gymWhenLow: true }))).filter(Boolean);
    const naive = rs.reduce((s, r) => s + r!.naive, 0) / rs.length;
    expect(naive).toBeGreaterThan(0.6); // a plain before→after average says "the gym lifts you" (~+0.9)
    expect(rs.filter((r) => r!.found).length).toBeLessThanOrEqual(3); // the engine stays quiet (≤ 10%)
  });

  it("…and when the gym really lifts you after a low lunchtime, it still sees it (the twin)", () => {
    const found = seeds(30).map((seed) => gymMood(run({ seed, gymWhenLow: true, gymMood: 2.5, days: 42 }))).filter((r) => r?.found);
    expect(found.length).toBeGreaterThanOrEqual(15);
  });

  it("nothing planted: almost never finds anything at all", () => {
    const anyFound = seeds(30).filter((seed) => run({ seed }).some((r) => r.found)).length;
    expect(anyFound).toBeLessThanOrEqual(4); // ≤ ~13% of months, across every activity × feeling
  });

  it("says how often it held: most gym gaps beat what was expected", () => {
    const r = gymMood(run({ seed: 3, gymMood: 2.5 }))!;
    expect(r.agree / r.withN).toBeGreaterThan(0.7);
  });
});

describe("time of day (owner, 20 Oct: \"the most confident finding yet is one that even the app can't defend\")", () => {
  // Black cumin seed oil at 20:00 on 15 of 16 days, and mood a point and a half lower at 21:00 whatever you did. The
  // oil was in nearly every evening gap, so it took the blame for the evening.
  const OIL = new Map([["oil", "Black cumin seed oil"]]);
  const oil = (seed: number, eveningSupp: number, days = 28) => { const { entries, workouts } = betweenWorld({ seed, days, eveningDip: 1.5, eveningSupp }); return between(entries, workouts, OIL, NOW).filter((r) => r.activity === "supp:oil"); };
  it("an evening supplement taken nearly every day isn't blamed for the evening dip", () => {
    const blamed = seeds(30).filter((seed) => oil(seed, 0.94).some((r) => r.found)).length;
    expect(blamed).toBeLessThanOrEqual(1);
  });
  it("…nor one taken half the evenings", () => {
    const blamed = seeds(30).filter((seed) => oil(seed, 0.5, 42).some((r) => r.found)).length;
    expect(blamed).toBeLessThanOrEqual(3);
  });
  it("its 'without' is gaps at the same time of day, so 15 evenings with and 1 without isn't a comparison at all", () => {
    expect(seeds(10).filter((seed) => oil(seed, 0.94).length).length).toBeLessThanOrEqual(2);
  });
  it("the gym at 15:00 still shows its planted lift with the evening dip in the data", () => {
    const found = seeds(30).map((seed) => { const { entries, workouts } = betweenWorld({ seed, gymMood: 2, eveningDip: 1.5 }); return gymMood(between(entries, workouts, new Map(), NOW)); }).filter((h) => h?.found);
    expect(found.length).toBeGreaterThanOrEqual(21);
  });
});

describe("what you ticked at a check-in (bench)", () => {
  it("finds a planted lift from evening walks ticked 'outside', and never credits a 'phone' tick that does nothing", () => {
    let outside = 0, phone = 0;
    for (const seed of seeds(30)) {
      const rs = run({ seed, outsideMood: 2, phoneNoise: true, days: 42 });
      if (rs.find((r) => r.activity === "tag:outside" && r.metric === "mood")?.found) outside++;
      if (rs.some((r) => r.activity === "tag:phone" && r.found)) phone++;
    }
    expect(outside).toBeGreaterThanOrEqual(21);
    expect(phone).toBeLessThanOrEqual(3);
  });

  it("'gym' ticked counts as the gym even when no workout was logged", () => {
    const { entries } = betweenWorld({ seed: 2, gymMood: 2.5 });
    const ws = betweenWorld({ seed: 2, gymMood: 2.5 }).workouts;
    // Same month, but the gym is only ticked at the next check-in instead of logged as a workout.
    const ticked = entries.map((e) => (e.kind === "feel" && ws.some((w) => w.startedAt < e.at && e.at - w.startedAt < 3 * 3_600_000) ? { ...e, doing: ["gym"] } : e));
    expect(gymMood(between(ticked, [], new Map(), NOW))?.found).toBe(true);
  });
});

describe("gaps", () => {
  it("pairs check-ins on the same day only, 20 min to 10 h apart", () => {
    const f = (id: string, day: string, min: number, mood: number): Entry => ({ id, kind: "feel", at: atMinute(day, min), mood });
    const gs = gaps([f("a", "2026-10-01", 9 * 60, 4), f("b", "2026-10-01", 9 * 60 + 10, 5), f("c", "2026-10-01", 14 * 60, 7), f("d", "2026-10-02", 8 * 60, 6)]);
    expect(gs.map((g) => [g.before.mood, g.after.mood])).toEqual([[5, 7]]); // a→b too close, c→d crosses midnight
  });

  it("empty account: no results, no crash", () => {
    expect(between([], [], new Map(), NOW)).toEqual([]);
  });
});
