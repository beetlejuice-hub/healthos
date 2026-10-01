import { describe, expect, it } from "vitest";
import { bodyDays, realBurn } from "../tdee";
import { addDays } from "../time";
import { balance, intakeFor, plan } from "./engine";
import { daysFor, LAST, race } from "./race";
import { world } from "./world";

const ninety = (seed: number, burn: (i: number) => number, extra: Partial<Parameters<typeof world>[0]> = {}) => {
  const { entries } = world({ seed, days: 90, lastDay: LAST, burn, eat: () => 2700, ...extra });
  const d = bodyDays(entries, addDays(LAST, -89), LAST);
  d[89] = { ...d[89], kcal: null };
  return d;
};

describe("Balance vs tdee.ts on the same fake people", () => {
  it("ties on tdee.ts's home turf (steady month): within 15 kcal of its error, honest range", () => {
    const { app, bal } = race("steady", 25);
    expect(bal.mae).toBeLessThan(app.mae + 15);
    expect(bal.covered).toBeGreaterThanOrEqual(0.85);
  });

  it("days you didn't log are measured, not assumed average (weekend gaps)", () => {
    const { app, bal } = race("weekends", 25);
    expect(app.covered).toBeLessThan(0.75); // the bug in assuming unlogged = average
    expect(bal.mae).toBeLessThan(app.mae * 0.75);
    expect(bal.covered).toBeGreaterThanOrEqual(0.85);
  });

  it("water that lingers for days isn't read as fat", () => {
    const { app, bal } = race("water", 25);
    expect(bal.mae).toBeLessThan(app.mae * 0.7);
    expect(bal.covered).toBeGreaterThanOrEqual(0.85);
  });

  it("a cut that starts mid-window doesn't bend the answer", () => {
    const { app, bal } = race("cut", 25);
    expect(bal.mae).toBeLessThan(app.mae);
  });

  it("answers from the first 10 days with a range that holds the truth, where tdee.ts has nothing", () => {
    const { app, bal } = race("early", 25);
    expect(app.answered).toBe(0);
    expect(bal.answered).toBe(25);
    expect(bal.covered).toBeGreaterThanOrEqual(0.85);
  });
});

describe("Balance: burn changes", () => {
  it("finds a planted step, at about the right day and size", () => {
    let found = 0, near = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const b = balance(ninety(seed, (i) => (i < 40 ? 2900 : 2550)))!;
      if (b.step && b.step.kcal < -150) { found++; if (Math.abs(Date.parse(b.step.day) - Date.parse(addDays(LAST, -49))) <= 7 * 864e5) near++; }
    }
    expect(found).toBeGreaterThanOrEqual(10);
    expect(near).toBeGreaterThanOrEqual(found - 2);
  });

  it("doesn't invent one when the burn is steady (the twin of the test above)", () => {
    let steps = 0, clear = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const b = balance(ninety(seed, () => 2700))!;
      if (b.step) steps++;
      if (b.change?.clear) clear++;
    }
    expect(steps).toBeLessThanOrEqual(1);
    expect(clear).toBe(0);
  });
});

describe("Balance: messy data", () => {
  it("a typo weigh-in (8.04 for 80.4) is set aside and doesn't move the burn", () => {
    const { days } = daysFor("steady", 3);
    const clean = balance(days)!;
    const i = days.findIndex((d, k) => k > 14 && d.kg != null);
    const typo = days.map((d, k) => (k === i ? { ...d, kg: d.kg! / 10 } : d));
    const b = balance(typo)!;
    expect(b.dropped).toBe(1);
    expect(b.days[i].outlier).toBe("typo");
    expect(Math.abs(b.burn - clean.burn)).toBeLessThan(30);
  });

  it("says what unlogged days really looked like", () => {
    // Weekend days eat 2,600 + 900; only a quarter are logged.
    const est = [1, 2, 3, 4, 5, 6].map((seed) => balance(daysFor("weekends", seed).days)!.unlogged);
    const shown = est.filter((u) => u != null);
    expect(shown.length).toBe(6);
    // Unlogged days are mostly weekends (≈3,400 true) against a usual logged ≈2,600: every estimate
    // points up, and the truth sits inside the 90% range.
    for (const u of shown) {
      expect(u!.kcal).toBeGreaterThan(2900);
      expect(u!.kcal + 1.645 * u!.sd).toBeGreaterThan(3200);
    }
  });

  it("waits for a week of weigh-ins and 3 logged days", () => {
    const { days } = daysFor("early", 1);
    expect(balance(days.slice(0, 5))).toBeNull();
    expect(balance(days.map((d) => ({ ...d, kcal: null })))).toBeNull();
  });

  it("an empty account is null, not a crash", () => {
    expect(balance([])).toBeNull();
    expect(balance(Array.from({ length: 30 }, (_, i) => ({ day: addDays(LAST, i - 29), kcal: null, kg: null })))).toBeNull();
  });

  it("gets tighter with more data, and says how many days until ±100", () => {
    const a = balance(daysFor("early", 2).days)!;
    const b = balance(daysFor("steady", 2).days)!;
    expect(b.burnSd).toBeLessThan(a.burnSd);
    for (const t of [a.daysToTight!, b.daysToTight!]) {
      expect(t.everyDay).toBeGreaterThan(0);
      expect(t.everyDay).toBeLessThan(120);
      expect(t.everyDay).toBeLessThanOrEqual(t.asNow);
    }
    expect(b.daysToTight!.everyDay).toBeLessThan(a.daysToTight!.everyDay);
  });

  it("skipped days cost real time: logging every day gets there sooner than 3 skips a fortnight", () => {
    const t = balance(daysFor("weekends", 2).days)!.daysToTight!;
    expect(t.everyDay).toBeLessThan(60);
    expect(t.asNow).toBeGreaterThan(t.everyDay + 20);
  });
});

describe("planning numbers (known answers)", () => {
  it("2,300 a day on a 2,800 burn is −0.45 kg a week", () => {
    expect(plan({ burn: 2800, burnSd: 0 }, 2300).kgPerWeek).toBeCloseTo(-0.4545, 3);
    expect(intakeFor({ burn: 2800 }, -0.5)).toBeCloseTo(2250, 0);
  });

  it("the range widens with the burn's uncertainty", () => {
    const p = plan({ burn: 2800, burnSd: 100 }, 2800);
    expect(p.hi - p.lo).toBeCloseTo((2 * 1.645 * 100 * 7) / 7700, 4);
  });
});

it("matches tdee.ts's sign and rough size on its own test bench", () => {
  const d = daysFor("steady", 9).days;
  const a = realBurn(d)!, b = balance(d)!;
  expect(Math.abs(a.kcal - b.burn)).toBeLessThan(150);
});
