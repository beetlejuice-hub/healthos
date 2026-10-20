import { describe, expect, it } from "vitest";
import { checkIn, creatineFrom, liftsDropping } from "./checkin";
import type { LoggedSet } from "./training";

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
/**
 * 3 lifts every 3 days for 4 weeks (or `weeks`), each set ±1.5 % like real days; the last two weeks at `recent` × the earlier strength.
 * `great`: one session 3½ weeks ago 6 % above the rest on every lift.
 */
function lifting(recent: number, { great = false, seed = 3, weeks = 4 } = {}) {
  const r = rnd(seed), out: LoggedSet[] = [];
  for (let d = weeks * 7 - 1; d >= 0; d -= 3) for (const [ex, kg] of [["Squat", 100], ["DB bench press", 32], ["Lat pulldown", 60]] as const)
    out.push({ at: NOW - d * DAY, workoutId: `w${d}`, exercise: ex, kg: (d < 14 ? kg * recent : kg) * (1 + r() * 0.03) * (great && d === 24 ? 1.06 : 1), reps: 8 });
  return out;
}

describe("two-week check-in (his rule)", () => {
  it("losing 0.5 kg a week with lifts holding → keep", () => {
    const c = checkIn(weighIns(-0.5), lifting(1, { weeks: 8 }), NOW, 2600);
    if (!("delta" in c)) throw new Error("no answer");
    expect(c.lossPerWeek).toBeGreaterThan(0.35); expect(c.lossPerWeek).toBeLessThan(0.65);
    expect(c.delta).toBe(0); expect(c.newKcal).toBe(2600);
    expect(c.why).toMatch(/inside 0\.3–0\.7 kg, and lifts are holding/);
    // 4 weeks of sessions can't say "holding" yet — it says nothing about lifts rather than claim it
    const short = checkIn(weighIns(-0.5), lifting(1), NOW, 2600);
    expect("why" in short && short.why).toMatch(/inside 0\.3–0\.7 kg$/);
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

describe("lifts dropping, per muscle (owner, 15 Oct: \"ok to 2\")", () => {
  it("finds a planted 7% drop on every lift — quads, chest and back all clearly weaker", () => {
    expect(liftsDropping(lifting(0.93), NOW)).toMatchObject({ dropped: ["Chest", "Back", "Quads"], dropping: true });
  });
  it("not flat lifts with ±1.5 % bounce, not a 1 % dip, not one great day early on (the old best-set rule read that as all three dropping)", () => {
    expect(liftsDropping(lifting(1), NOW)).toMatchObject({ dropped: [], dropping: false });
    expect(liftsDropping(lifting(0.99), NOW).dropping).toBe(false); // a 1 % dip may show on one muscle — not enough to call it
    expect(liftsDropping(lifting(1, { great: true }), NOW)).toMatchObject({ dropped: [], dropping: false });
  });
  it("one muscle down isn't 'lifts dropping'; neither is one muscle measured", () => {
    const one = lifting(1).map((s) => (s.exercise === "Squat" && s.at > NOW - 14 * DAY ? { ...s, kg: s.kg * 0.88 } : s));
    expect(liftsDropping(one, NOW)).toMatchObject({ dropped: ["Quads"], dropping: false });
    expect(liftsDropping(lifting(0.88).filter((s) => s.exercise === "Squat"), NOW)).toMatchObject({ dropped: ["Quads"], dropping: false });
  });
  it("the card says which muscles", () => {
    const c = checkIn(weighIns(-0.5), lifting(0.93), NOW, 2600);
    expect("why" in c && c.why).toMatch(/but chest and back and quads are getting weaker \(8-week trend\)/);
  });
});

// PLAN 134 (owner, 20 Oct: "My weight going up could be muscle too, the creatin hitting plus im back at gym")
describe("when the scale isn't fat: creatine water, or muscle the body fat can see", () => {
  const cut = (c: ReturnType<typeof checkIn>) => ("delta" in c ? c.delta : null);
  it("gaining 0.2 a week, creatine started 10 days ago → hold the cut, and say why", () => {
    const c = checkIn(weighIns(0.2), lifting(1), NOW, 2600, undefined, { creatineFrom: NOW - 10 * DAY });
    expect(cut(c)).toBe(0);
    expect("held" in c && c.held).toBe(-150); // still offered: he may have been on it long before he logged it
    expect("why" in c && c.why).toMatch(/but creatine started Sat 10 Oct, and it holds 1–2 kg of water in the muscles over the first weeks/);
  });
  it("creatine started 6 weeks ago: past the water, the rule cuts as written", () => {
    expect(cut(checkIn(weighIns(0.2), lifting(1), NOW, 2600, undefined, { creatineFrom: NOW - 42 * DAY }))).toBe(-150);
  });
  it("the scale's body fat clearly down while weight holds → keep; a fat change inside the swing doesn't count", () => {
    const c = checkIn(weighIns(-0.1), lifting(1), NOW, 2600, undefined, { fat: { clear: true, fatKg: -0.6, leanKg: 0.5 } });
    expect(cut(c)).toBe(0);
    expect("why" in c && c.why).toMatch(/fat went down 0\.6 kg in 2 weeks while lean went up 0\.5 kg, so the weight isn't fat — keep it$/);
    expect(cut(checkIn(weighIns(-0.1), lifting(1), NOW, 2600, undefined, { fat: { clear: false, fatKg: -0.6, leanKg: 0.5 } }))).toBe(-150);
    expect(cut(checkIn(weighIns(-0.1), lifting(1), NOW, 2600, undefined, { fat: { clear: true, fatKg: 0.4, leanKg: -0.2 } }))).toBe(-150);
  });
  it("only the cut is held: losing too fast still adds", () => {
    expect(cut(checkIn(weighIns(-1), lifting(1), NOW, 2450, undefined, { creatineFrom: NOW - 5 * DAY }))).toBe(150);
  });
  it("creatine's first dose: by its name, taken, not \"didn't\"", () => {
    const supps = [{ id: "creatine", name: "Creatine" }, { id: "mag", name: "Magnesium" }];
    const es = [{ kind: "supp", at: 30, suppId: "creatine", status: "skipped" }, { kind: "supp", at: 50, suppId: "creatine", status: "taken" }, { kind: "supp", at: 10, suppId: "mag", status: "taken" }, { kind: "supp", at: 90, suppId: "creatine", status: "taken" }];
    expect(creatineFrom(es, supps)).toBe(50);
    expect(creatineFrom(es.slice(2, 3), supps)).toBeNull();
  });
});
