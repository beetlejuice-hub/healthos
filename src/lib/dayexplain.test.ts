// PLAN 208 — why today, what makes a day, ripples. One planted world of 120 days: 0–3 drinks most evenings; the morning
// after, 15 min less sleep and HRV 4 ms lower a drink; focus 0.6 lower a drink the day after and 0.8 higher an hour asleep;
// a training day lifts the next day's mood 0.5; protein does nothing. Known answers: drinks push today's focus down and
// lead the list; your best focus days had no drinks the evening before; a night out's HRV dips the next morning, clearly,
// and is back within days. Controls: focus at random — no big pushes, nothing strongly apart; random "events" — no clear ripple.
import { describe, expect, it } from "vitest";
import { bestDays } from "./bestdays";
import { dayTable } from "./daytable";
import type { DayFacts } from "./insights";
import { eventDays, ripple, seriesOf } from "./ripple";
import { addDays } from "./time";
import { whyToday } from "./whytoday";

const TODAY = "2026-11-11", N = 120;
function rng(seed: number) { let s = seed; return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r: () => number) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

function world(seed = 1, random = false, todayDrinksBefore?: number) {
  const r = rng(seed), days: DayFacts[] = [], hrv: Record<string, number> = {};
  let prevDrinks = 0, prevTrained = 0;
  for (let i = 0; i < N; i++) {
    const day = addDays(TODAY, -(N - 1 - i));
    const asleep = 7.3 - 0.25 * prevDrinks + gauss(r) * 0.35;
    hrv[day] = 62 - 4 * prevDrinks + gauss(r) * 3;
    const focus = random ? 6 + gauss(r) * 1.1 : 6 + 0.8 * (asleep - 7.3) - 0.6 * prevDrinks + gauss(r) * 0.6;
    const mood = random ? 6 + gauss(r) : 6 + 0.5 * prevTrained + gauss(r) * 0.6;
    let drinks = r() < 0.6 ? Math.floor(r() * 4) : 0;
    const trained = r() < 0.45 ? 1 : 0;
    if (i === N - 2 && todayDrinksBefore != null) drinks = todayDrinksBefore; // yesterday evening, for today
    days.push({ day, logged: true, alcoholG: drinks * 14, lateCaffeineMg: r() < 0.3 ? 120 : 0, proteinG: 100 + r() * 80, steps: 6000 + r() * 6000, trained: !!trained, volumeKg: trained ? 3000 + r() * 4000 : 0,
      bedLateH: drinks * 0.3 + gauss(r) * 0.4, asleepMin: asleep * 60, focus: Math.max(1, Math.min(10, focus)), mood: Math.max(1, Math.min(10, mood)), energy: 6 + gauss(r), sleep: null } as unknown as DayFacts);
    prevDrinks = drinks; prevTrained = trained;
  }
  return { days, band: { hrv, rhr: {} } };
}

describe("why today (PLAN 208)", () => {
  it("after 3 drinks: drinks pull today's focus down and lead the list; days like this run under your usual; what you rated beside it", () => {
    const w = world(1, false, 3), y = whyToday(dayTable(w.days, w.band), "focus", TODAY)!;
    expect(y.pushes[0].key).toBe("drinks");
    expect(y.pushes[0].pts).toBeLessThan(-0.8); // (3 − your usual ~0.9) × 0.6, a little shrunk; the short night it brought pushes too
    expect(y.expected).toBeLessThan(y.usual - 1);
    expect(y.rated).not.toBeNull();
    expect(y.week.length).toBe(7);
  });
  it("after a dry evening: drinks push it up a little (below your usual drinks)", () => {
    const w = world(1, false, 0), y = whyToday(dayTable(w.days, w.band), "focus", TODAY)!;
    expect(y.pushes.find((p) => p.key === "drinks")!.pts).toBeGreaterThan(0);
  });
  it("control: focus at random — nothing pushes much, expected near your usual", () => {
    const w = world(2, true, 3), y = whyToday(dayTable(w.days, w.band), "focus", TODAY)!;
    expect(Math.max(0, ...y.pushes.map((p) => Math.abs(p.pts)))).toBeLessThan(0.5);
    expect(Math.abs(y.expected - y.usual)).toBeLessThan(0.6);
  });
  it("too few rated days: nothing", () => {
    const w = world(1); expect(whyToday(dayTable(w.days.slice(-15), w.band), "focus", TODAY)).toBeNull();
  });
});

describe("what makes a day (PLAN 208)", () => {
  it("your best focus days had no drinks the evening before; drinks first, strongly; the sentence says it", () => {
    const w = world(3), b = bestDays(dayTable(w.days, w.band), "focus")!;
    expect(b.rows[0].key).toBe("drinks");
    expect(b.rows[0].says).toBe("strongly");
    expect(b.rows[0].best).toBeLessThan(0.5);
    expect(b.rows[0].worst).toBeGreaterThanOrEqual(2);
    expect(b.best).toMatch(/^Your best focus days: no drinks/);
    expect(b.rows.find((r) => r.key === "protein")!.says).not.toBe("strongly");
  });
  it("mood: training the day before is what sets the best days apart", () => {
    const w = world(4), b = bestDays(dayTable(w.days, w.band), "mood")!;
    expect(b.rows[0].key).toBe("trained");
    expect(b.rows[0].best).toBeGreaterThan(b.rows[0].worst);
  });
  it("control: focus at random — nothing strongly apart", () => {
    const w = world(5, true), b = bestDays(dayTable(w.days, w.band), "focus")!;
    expect(b.rows.some((r) => r.says === "strongly")).toBe(false);
  });
});

describe("ripples (PLAN 208)", () => {
  it("a night out (3+ drinks): HRV dips the next morning, clearly, and comes back", () => {
    const w = world(6), ev = eventDays(w.days, "out"), rp = ripple(ev, seriesOf(w.days, w.band, "hrv"), "hrv")!;
    expect(rp.n).toBeGreaterThanOrEqual(8);
    expect(rp.peak!.at).toBe(1);
    expect(rp.peak!.v).toBeLessThan(-6);
    expect(rp.clear).toBe(true);
    expect(rp.backAt).not.toBeNull(); expect(rp.backAt!).toBeLessThanOrEqual(3);
    expect(rp.each.length).toBe(rp.n);
  });
  it("…and focus the next day", () => {
    const w = world(6), rp = ripple(eventDays(w.days, "out"), seriesOf(w.days, w.band, "focus"), "focus")!;
    expect([rp.peak!.at, rp.clear]).toEqual([1, true]);
  });
  it("control: random days as events — no clear ripple", () => {
    const w = world(7), r = rng(70), random = w.days.filter(() => r() < 0.12).map((d) => d.day);
    expect(ripple(random, seriesOf(w.days, w.band, "hrv"), "hrv")!.clear).toBe(false);
  });
  it("hard sessions are your heaviest quarter; too few events, no ripple", () => {
    const w = world(8), hard = eventDays(w.days, "hard"), trained = w.days.filter((d) => d.trained).length;
    expect(hard.length).toBeGreaterThan(trained * 0.2); expect(hard.length).toBeLessThan(trained * 0.32);
    expect(ripple(hard.slice(0, 3), seriesOf(w.days, w.band, "hrv"), "hrv")).toBeNull();
  });
});
