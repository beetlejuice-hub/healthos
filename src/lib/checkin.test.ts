import { describe, expect, it } from "vitest";
import { checkIn, liftsDropping } from "./checkin";

const DAY = 864e5;
const NOW = new Date("2026-10-20T09:00:00").getTime();
// Seeded noise, so a planted rate is found through day-to-day bounce (±0.4 kg) like a real scale.
const rnd = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
/** Weigh-ins most mornings for 4 weeks, trending at `perWeek` kg (negative = losing). */
function weighIns(perWeek: number, { skip = [] as number[], seed = 7 } = {}) {
  const r = rnd(seed), out: { at: number; kg: number }[] = [];
  for (let d = 27; d >= 0; d--) if (!skip.includes(d) && d % 7 !== 3) out.push({ at: NOW - d * DAY - 2 * 3600e3, kg: 80 + (perWeek * (27 - d)) / 7 + r() * 0.8 });
  return out;
}
/** 3 lifts every 3–4 days for 4 weeks; the last two weeks at `recent` × the earlier strength. */
function lifting(recent: number) {
  const out: { at: number; exercise: string; kg: number; reps: number }[] = [];
  for (let d = 27; d >= 0; d -= 3) for (const [ex, kg] of [["Squat", 100], ["DB bench press", 32], ["Lat pulldown", 60]] as const)
    out.push({ at: NOW - d * DAY, exercise: ex, kg: d < 14 ? kg * recent : kg, reps: 8 });
  return out;
}

describe("two-week check-in (his rule)", () => {
  it("losing 0.5 kg a week with lifts holding → keep", () => {
    const c = checkIn(weighIns(-0.5), lifting(1), NOW, 2600);
    if (!("delta" in c)) throw new Error("no answer");
    expect(c.lossPerWeek).toBeGreaterThan(0.35); expect(c.lossPerWeek).toBeLessThan(0.65);
    expect(c.delta).toBe(0); expect(c.newKcal).toBe(2600);
    expect(c.why).toMatch(/inside 0\.3–0\.7 kg, and lifts are holding/);
  });
  it("losing 0.1 a week (or gaining) → 150 kcal less", () => {
    for (const r of [-0.1, 0.2]) { const c = checkIn(weighIns(r), lifting(1), NOW, 2600); expect("delta" in c && c.delta).toBe(-150); expect("newKcal" in c && c.newKcal).toBe(2450); }
  });
  it("losing 1 kg a week → 150 kcal more", () => {
    const c = checkIn(weighIns(-1), lifting(1), NOW, 2450);
    expect("delta" in c && [c.delta, c.newKcal]).toEqual([150, 2600]);
  });
  it("lifts dropping → 150 more even at a good rate; with a slow rate the two rules cancel", () => {
    const good = checkIn(weighIns(-0.5), lifting(0.93), NOW, 2600);
    expect("delta" in good && [good.delta, good.lifts.dropping]).toEqual([150, true]);
    const slow = checkIn(weighIns(-0.1), lifting(0.93), NOW, 2600);
    expect("delta" in slow && slow.delta).toBe(0);
    expect("why" in slow && slow.why).toMatch(/cancel out/);
  });
  it("a day with two weigh-ins counts once", () => {
    const w = weighIns(-0.5);
    const today = w[w.length - 1], twice = [...w, { at: today.at + 3600e3, kg: today.kg + 2 }]; // a second, heavier reading today only
    const a = checkIn(w, [], NOW, 2600), b = checkIn(twice, [], NOW, 2600);
    if (!("from" in a) || !("from" in b)) throw new Error("no answer");
    expect(b.from).toBe(a.from);
    expect(b.to - a.to).toBeCloseTo(1 / 6, 5); // today's average moves +1, one of 6 days — not 2/7 as one more reading would
  });
  it("too few weigh-ins says how many it has; too soon after the last one isn't due", () => {
    const c = checkIn(weighIns(-0.5).filter((x) => x.at > NOW - 7 * DAY || x.at < NOW - 21 * DAY), [], NOW, 2600);
    expect("need" in c && c.need).toMatch(/\(6 and 0 so far\)/);
    expect(checkIn(weighIns(-0.5), [], NOW, 2600, NOW - 5 * DAY)).toEqual({ due: false, nextAt: NOW + 9 * DAY });
    expect(checkIn(weighIns(-0.5), [], NOW, 2600, NOW - 14 * DAY).due).toBe(true);
  });
});

describe("lifts dropping", () => {
  it("finds a planted 7% drop, and not ±1% noise", () => {
    expect(liftsDropping(lifting(0.93), NOW)).toMatchObject({ compared: 3, dropping: true });
    expect(liftsDropping(lifting(0.99), NOW)).toMatchObject({ compared: 3, dropped: [], dropping: false });
  });
  it("one lift down isn't 'lifts dropping'; neither is one lift compared", () => {
    const one = lifting(1).map((s) => (s.exercise === "Squat" && s.at > NOW - 14 * DAY ? { ...s, kg: 90 } : s));
    expect(liftsDropping(one, NOW)).toMatchObject({ dropped: ["Squat"], dropping: false });
    expect(liftsDropping(lifting(0.9).filter((s) => s.exercise === "Squat"), NOW)).toMatchObject({ compared: 1, dropping: false });
  });
});
