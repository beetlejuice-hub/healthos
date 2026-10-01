import { describe, expect, it } from "vitest";
import { caffeineAt, latestDoseFor } from "../caffeine";
import { MIN } from "../time";
import { day, HALF_LIFE, inBlood, inGut, KA, lastCall, level, likeA, type Drink } from "./engine";

const shot = (at: number, mg = 63, extra: Partial<Drink> = {}): Drink => ({ id: `s${at}`, name: "Espresso", at, mg, form: "shot", ...extra });
const k = Math.LN2 / HALF_LIFE.mid;

describe("absorption (known answers)", () => {
  it("peaks where the Bateman formula says: ln(ka/ke)/(ka−ke)", () => {
    for (const form of ["shot", "cup", "can"] as const) {
      const d: Drink = { id: "x", name: "x", at: 0, mg: 100, form };
      const want = Math.log(KA[form] / k) / (KA[form] - k);
      let best = 0, at = 0;
      for (let t = 0; t < 300; t += 0.25) { const v = inBlood(d, t); if (v > best) { best = v; at = t; } }
      expect(at).toBeCloseTo(want, 0);
    }
  });

  it("shot ~30 min, mug ~45, can ~50 to peak", () => {
    const peakAt = (form: Drink["form"]) => { let b = 0, a = 0; for (let t = 0; t < 200; t++) { const v = inBlood({ id: "", name: "", at: 0, mg: 100, form }, t); if (v > b) { b = v; a = t; } } return a; };
    expect(peakAt("shot")).toBeGreaterThanOrEqual(28); expect(peakAt("shot")).toBeLessThanOrEqual(34);
    expect(peakAt("cup")).toBeGreaterThanOrEqual(42); expect(peakAt("cup")).toBeLessThanOrEqual(48);
    expect(peakAt("can")).toBeGreaterThanOrEqual(47); expect(peakAt("can")).toBeLessThanOrEqual(53);
  });

  it("area under the curve is dose / ke (everything absorbed, then cleared)", () => {
    let auc = 0;
    for (let t = 0; t < 6000; t += 0.5) auc += inBlood(shot(0, 100), t) * 0.5;
    expect(auc).toBeCloseTo(100 / k, -1);
  });

  it("long after drinking it matches the app's instant model (absorption only shifts the start)", () => {
    const appMg = caffeineAt([{ at: 0, mg: 100 }], 600 * MIN);
    const ours = inBlood(shot(0, 100), 600);
    expect(ours / appMg).toBeGreaterThan(1.0);
    expect(ours / appMg).toBeLessThan(1.15); // ≈ ka/(ka−ke): the time spent in the gut
  });

  it("nothing is lost: blood + gut + cleared = dose", () => {
    const d = shot(0, 100);
    // cleared = ∫ ke·blood
    let cleared = 0;
    for (let t = 0; t < 120; t += 0.01) cleared += k * inBlood(d, t) * 0.01;
    expect(inBlood(d, 120) + inGut(d, 120) + cleared).toBeCloseTo(100, 0);
  });
});

describe("sipping", () => {
  const can = (sipMin?: number): Drink => ({ id: "m", name: "Monster", at: 0, mg: 160, form: "can", sipMin });

  it("a can sipped over an hour peaks lower and later than downed at once", () => {
    const peak = (d: Drink) => { let b = 0, a = 0; for (let t = 0; t < 400; t++) { const v = inBlood(d, t); if (v > b) { b = v; a = t; } } return { b, a }; };
    const fast = peak(can()), slow = peak(can(60));
    expect(slow.b).toBeLessThan(fast.b);
    expect(slow.a).toBeGreaterThan(fast.a + 20);
  });

  it("matches summing 60 one-minute sips (the closed form is right)", () => {
    const sips: Drink[] = Array.from({ length: 60 }, (_, i) => ({ id: `${i}`, name: "", at: i + 0.5, mg: 160 / 60, form: "can" }));
    for (const t of [10, 45, 90, 240]) expect(inBlood(can(60), t)).toBeCloseTo(level(sips, t), 0);
  });

  it("the gut only holds what's been drunk so far", () => {
    expect(inGut(can(60), 30)).toBeLessThan(80);
    expect(inGut(can(60), 30)).toBeGreaterThan(0);
  });
});

describe("last call", () => {
  const bed = 23 * 60;

  it("adding the drink at last call lands right on the target in the first 3 h of sleep", () => {
    const morning = [shot(8 * 60, 126)];
    const t = lastCall(morning, { name: "Espresso", mg: 63, form: "shot" }, bed, 50, 12 * 60);
    expect(typeof t).toBe("number");
    const ds = [...morning, shot(t as number)];
    let m = 0; for (let x = bed; x <= bed + 180; x++) m = Math.max(m, level(ds, x));
    expect(m).toBeLessThanOrEqual(50);
    expect(m).toBeGreaterThan(49);
  });

  it("a coffee right before bed is refused even though little is absorbed by bedtime", () => {
    // A latte with dessert 15 min before bed: half of it is still in the gut at lights-out.
    const late: Drink = { id: "l", name: "Latte", at: bed - 15, mg: 63, form: "cup", withFood: true };
    expect(level([late], bed)).toBeLessThan(50); // barely absorbed at lights-out…
    let m = 0; for (let x = bed; x <= bed + 180; x++) m = Math.max(m, level([late], x));
    expect(m).toBeGreaterThan(50); // …but peaks while you sleep
    expect(lastCall([], { name: "Espresso", mg: 63, form: "shot" }, bed, 50, 12 * 60)).not.toBe("any");
  });

  it("is a bit earlier than the app's instant-absorption answer for a big drink", () => {
    const app = latestDoseFor([], 23 * 60 * MIN, 160, 50) as number;
    const ours = lastCall([], { name: "Monster", mg: 160, form: "can" }, bed, 50, 6 * 60) as number;
    expect(ours).toBeLessThan(app / MIN);
  });

  it("'never' when you're already over for the night, 'any' for a trace", () => {
    expect(lastCall([shot(22 * 60, 200)], { name: "x", mg: 63, form: "shot" }, bed, 50, 22 * 60 + 10)).toBe("never");
    expect(lastCall([], { name: "decaf", mg: 3, form: "cup" }, bed, 50, 12 * 60)).toBe("any");
  });
});

describe("the day", () => {
  it("empty day: flat zero, no clear time, no crash", () => {
    const d = day([], 23 * 60, 12 * 60);
    expect(d.peak.mg).toBe(0);
    expect(d.clear.at).toBeNull();
    expect(d.curve.every((p) => p.mg === 0)).toBe(true);
  });

  it("the band brackets the middle and is wider at bedtime than at the peak (half-life matters late)", () => {
    const d = day([shot(8 * 60, 126), { id: "l", name: "Latte", at: 11 * 60, mg: 63, form: "cup", withFood: true }], 23 * 60, 16 * 60);
    for (const p of d.curve) { expect(p.lo).toBeLessThanOrEqual(p.mg + 1e-9); expect(p.hi).toBeGreaterThanOrEqual(p.mg - 1e-9); }
    const pk = d.curve.find((p) => p.t === Math.round(d.peak.at / 5) * 5)!;
    expect((d.bed.hi - d.bed.lo) / d.bed.mg).toBeGreaterThan((pk.hi - pk.lo) / pk.mg);
    expect(d.clear.slowAt!).toBeGreaterThan(d.clear.at!);
  });

  it("parts add up to the total", () => {
    const d = day([shot(8 * 60), shot(14 * 60)], 23 * 60, 15 * 60);
    for (const p of d.curve) expect(p.parts.reduce((a, b) => a + b, 0)).toBeCloseTo(p.mg, 9);
  });

  it("words for levels", () => {
    expect(likeA(4)).toBe("a trace");
    expect(likeA(60)).toBe("about an espresso");
    expect(likeA(190)).toBe("about 3 espressos");
  });
});
