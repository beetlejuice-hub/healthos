// PLAN 177 — owner, 27 Oct: the recovery clock after a night out ("YES").
import { describe, expect, it } from "vitest";
import type { Night } from "./sleep";
import { addDays, atMinute } from "./time";
import { isNightOut, recoveryInputs, recoveryNow, usualNights, type DayAfter, type EveningOut } from "./recovery";
import type { Entry } from "./types";
import type { HrMinute, StepBucket } from "./band";

const H = 3_600_000;
/**
 * 63 nights to `last`. A night out every Saturday (bed 02:00, 4 drinks): HRV 32, resting HR 61 that night. With a walk the
 * next morning (every other one) the following night is back to usual; without, that night is still off (HRV 40, resting
 * HR 58) and the one after is back.
 */
function world(opts: { lastOut?: boolean; lastShrug?: boolean; drinksG?: number } = {}) {
  const last = "2026-10-26"; // a Sunday morning — Saturday the 25th was the night out
  const ns: Night[] = [], evenings = new Map<string, EveningOut>(), after = new Map<string, DayAfter>(), sessions: { day: string; pct: number | null }[] = [];
  const wob = [0.6, -1.1, 0.3, 1.4, -0.7, 0.9, -0.2];
  let prev: "normal" | "out-walk" | "out" = "normal", k = 0;
  for (let i = 62; i >= 0; i--) {
    const day = addDays(last, -i), eve = addDays(day, -1), isLast = i === 0;
    const out = isLast ? opts.lastOut !== false : new Date(`${eve}T12:00:00`).getDay() === 6;
    let hrv = 50 + wob[i % 7] * 2, rhr = 55 + wob[(i + 3) % 7] * 0.6, meanHr = 58 + wob[(i + 1) % 7] * 0.6, deep = 80 + wob[(i + 2) % 7] * 4;
    let bed = atMinute(eve, 23 * 60 + 30), wake = atMinute(day, 7 * 60 + 30);
    if (out) {
      bed = atMinute(day, 2 * 60); wake = atMinute(day, 9 * 60 + 30);
      if (isLast && opts.lastShrug) { hrv = 50; rhr = 55; } else { hrv = 32; rhr = 61; meanHr = 66; deep = 50; }
      const walk = k++ % 2 === 0;
      after.set(day, { stepsBeforeNoon: walk ? 3500 : 400, proteinBefore11: 20, lastCoffeeMin: 15 * 60 });
      prev = walk ? "out-walk" : "out";
    } else if (prev === "out") { hrv = 40; rhr = 58; prev = "normal"; }
    else if (prev === "out-walk") { hrv = 50; rhr = 55; prev = "normal"; } // back to usual: a middle night
    else prev = "normal";
    ns.push({ id: `n${i}`, day, eve, bed, up: wake, onset: bed + 10 * 60_000, wake, asleep: 420, deep, rem: 90, light: 240, awake: 10, wakes: 1, latency: 10, stages: [], low: 50, lowAt: null, meanHr, hrv, rhr, nap: null });
    evenings.set(eve, { alcoholG: out ? opts.drinksG ?? 56 : 0, drinks: out ? 4 : 0, cigs: null });
    if (i % 3 === 0 || out) sessions.push({ day, pct: out ? -6 : 0 });
  }
  return { ns, evenings, after, sessions, last };
}

describe("the recovery clock (PLAN 177)", () => {
  it("a night out is 2+ drinks — or a smoking day with bed 2 h past your usual; one beer isn't", () => {
    const n = { bed: atMinute("2026-10-26", 2 * 60) } as Night;
    expect([isNightOut(n, { alcoholG: 28, drinks: 2, cigs: null }, 23.5), isNightOut(n, { alcoholG: 14, drinks: 1, cigs: null }, 23.5), isNightOut(n, { alcoholG: 0, drinks: 0, cigs: 4 }, 23.5), isNightOut({ bed: atMinute("2026-10-25", 23 * 60 + 40) } as Night, { alcoholG: 0, drinks: 0, cigs: 4 }, 23.5)]).toEqual([true, false, true, false]);
  });
  it("planted: last night's hit against your usual, and back by your typical time — from your past nights out", () => {
    const w = world(), now = atMinute(w.last, 10 * 60);
    const r = recoveryNow(w.ns, w.evenings, w.after, w.sessions, w.last, now)!;
    expect(r.drinks).toBe(4);
    expect(r.hit).toMatchObject({ hrv: 32, deep: 50 });
    expect(Math.abs(r.hit.hrvUsual! - 50)).toBeLessThanOrEqual(2); expect(Math.abs(r.hit.deepUsual! - 80)).toBeLessThanOrEqual(4);
    expect(r.hit.meanHr).toBeGreaterThanOrEqual(7);
    expect(r.past).toBeGreaterThanOrEqual(7);
    // walk mornings back the next night (29.5 h from bed), the others a night later (53.5 h): one of the two, a wake time
    expect([29.5, 53.5]).toContain(r.typicalH);
    expect(r.backAt).toBe(r.night.bed + r.typicalH! * H);
    expect(r.done).toBeCloseTo((now - r.night.bed) / (r.backAt! - r.night.bed), 6);
    expect(r.shrugged).toBe(false);
  });
  it("planted: a walk before noon got you back a day sooner — named, with how many nights each side; protein and coffee weren't different, not named", () => {
    const w = world();
    const r = recoveryNow(w.ns, w.evenings, w.after, w.sessions, w.last, atMinute(w.last, 10 * 60))!;
    expect(r.factors.map((f) => f.id)).toEqual(["walk"]);
    expect(r.factors[0].gainH).toBe(24);
    expect(r.factors[0].with).toBeGreaterThanOrEqual(2); expect(r.factors[0].without).toBeGreaterThanOrEqual(2);
  });
  it("your lifts the day after a night out, against your other sessions", () => {
    const w = world();
    expect(recoveryNow(w.ns, w.evenings, w.after, w.sessions, w.last, atMinute(w.last, 10 * 60))!.lifts).toMatchObject({ pct: -6 });
  });
  it("controls: no night out last night — nothing; one beer — nothing; a night out that didn't knock you off your usual — 'shrugged it off'", () => {
    const quiet = world({ lastOut: false });
    expect(recoveryNow(quiet.ns, quiet.evenings, quiet.after, quiet.sessions, quiet.last, atMinute(quiet.last, 10 * 60))).toBeNull();
    const one = world({ drinksG: 14 });
    expect(recoveryNow(one.ns, one.evenings, one.after, one.sessions, one.last, atMinute(one.last, 10 * 60))).toBeNull();
    const shrug = world({ lastShrug: true });
    const r = recoveryNow(shrug.ns, shrug.evenings, shrug.after, shrug.sessions, shrug.last, atMinute(shrug.last, 10 * 60))!;
    expect([r.shrugged, r.backAt, r.done]).toEqual([true, null, null]);
  });
  it("the first nights out: the hit, but no 'back by' until 2 past ones to go by", () => {
    const w = world();
    const few = w.ns.slice(-9); // one past Saturday
    const r = recoveryNow(few, w.evenings, w.after, [], w.last, atMinute(w.last, 10 * 60))!;
    expect([r.typicalH, r.backAt, r.factors.length, r.lifts]).toEqual([null, null, 0, null]);
    expect(r.hit.hrv).toBe(32);
  });
  it("your usual leaves the nights out out", () => {
    const w = world(), out = new Set(w.ns.filter((n) => n.hrv === 32).map((n) => n.id));
    expect(usualNights(w.ns, out).hrv!.mid).toBeGreaterThanOrEqual(46);
    expect(usualNights(w.ns, new Set()).hrv!.lo).toBeLessThan(usualNights(w.ns, out).hrv!.lo);
  });
  it("inputs: drinks from noon to bed (not after), cigarettes as answered, a morning's steps only when worn, protein before 11, the last coffee", () => {
    const day = "2026-10-26", eve = "2026-10-25", bed = atMinute(day, 2 * 60);
    const n = { id: "n", day, eve, bed, wake: atMinute(day, 9 * 60) } as Night;
    const drink = (at: number, alcoholG: number, caffeineMg = 0) => ({ id: `d${at}`, kind: "drink", at, name: "x", ml: 500, kcal: 200, alcoholG, caffeineMg }) as unknown as Entry;
    const food = (at: number, p: number) => ({ id: `f${at}`, kind: "food", at, name: "eggs", grams: 100, macros: { kcal: 300, p, c: 0, f: 20 } }) as unknown as Entry;
    const entries = [drink(atMinute(eve, 11 * 60), 20), drink(atMinute(eve, 21 * 60), 20), drink(atMinute(eve, 23 * 60), 20), drink(atMinute(day, 3 * 60), 20),
      { id: "s", kind: "answer", at: atMinute(eve, 21 * 60), key: `smoke:${eve}`, question: "", answer: "3-5" } as Entry,
      food(atMinute(day, 10 * 60), 25), food(atMinute(day, 10 * 60 + 30), 10), food(atMinute(day, 13 * 60), 40),
      drink(atMinute(day, 15 * 60), 0, 80), drink(atMinute(day, 10 * 60), 0, 80)];
    const hr: HrMinute[] = Array.from({ length: 200 }, (_, i) => [atMinute(day, 9 * 60) + i * 60_000, 70, 68, 72]);
    const steps: StepBucket[] = [[atMinute(day, 10 * 60), 15, 1500], [atMinute(day, 11 * 60), 15, 1000], [atMinute(day, 13 * 60), 15, 5000]];
    const r = recoveryInputs([n], entries, steps, hr);
    expect(r.evenings.get(eve)).toEqual({ alcoholG: 40, drinks: 2, cigs: 4 });
    expect(r.after.get(day)).toEqual({ stepsBeforeNoon: 2500, proteinBefore11: 35, lastCoffeeMin: 15 * 60 });
    // band off that morning, no food, nothing logged: unknown, not zero
    const bare = recoveryInputs([n], [], steps, []);
    expect(bare.after.get(day)).toEqual({ stepsBeforeNoon: null, proteinBefore11: null, lastCoffeeMin: null });
    expect(bare.evenings.get(eve)).toEqual({ alcoholG: 0, drinks: 0, cigs: null });
  });
});
