import { describe, expect, it } from "vitest";
import { checkSamples, compare, hrSamples, slotOf, slots, slotTime } from "./compare";
import { rng } from "./bench";

const PER_DAY = 144, LAGS = Array.from({ length: 19 }, (_, k) => k); // 0–180 min
const START = new Date(2026, 8, 1).getTime(); // a local midnight

/**
 * Days of caffeine and heart rate. Coffee mostly 07:30–09:30 (some afternoons); heart rate climbs after waking
 * whether or not there was coffee, wanders slowly, plus noise. `perMg`: bpm added per mg in the body `lagMin`
 * earlier — the planted effect (0 = none).
 */
function world(seed: number, days: number, perMg: number, lagMin = 40, busyBpm = 0) {
  const { r, g } = rng(seed), doses: number[] = [], busy: boolean[] = [];
  for (let d = 0; d < days; d++) {
    if (r() < 0.8) doses.push(d * PER_DAY + 45 + Math.floor(r() * 12)); if (r() < 0.5) doses.push(d * PER_DAY + 78 + Math.floor(r() * 15));
    // A busy day: two more coffees, and heart rate `busyBpm` higher all day — with no link between them.
    busy.push(r() < 0.4); if (busy[d] && busyBpm) doses.push(d * PER_DAY + 66 + Math.floor(r() * 6), d * PER_DAY + 96 + Math.floor(r() * 12));
  }
  const n = days * PER_DAY, caf: number[] = new Array(n).fill(0);
  for (const s of doses) for (let i = s; i < n && i < s + 6 * 36; i++) caf[i] += 95 * Math.pow(0.5, ((i - s) * 10) / 330);
  const samples: { i: number; y: number }[] = [];
  const knots: number[] = []; for (let k = 0; k <= n / 3 + 2; k++) knots.push(g() * 2.5);
  for (let i = 0; i < n; i += 2) {
    const md = (i % PER_DAY) * 10; if (md < 420 || md >= 1380) continue;
    const base = md < 510 ? 56 + ((md - 390) / 120) * 14 : 70 + 2 * Math.sin((md - 510) / 180);
    const slow = knots[Math.floor(i / 3)] + (knots[Math.floor(i / 3) + 1] - knots[Math.floor(i / 3)]) * ((i % 3) / 3);
    const lagged = caf[i - lagMin / 10] ?? 0;
    samples.push({ i, y: base + slow + g() * 3 + perMg * lagged + (busy[Math.floor(i / PER_DAY)] ? busyBpm : 0) });
  }
  return { caf, samples };
}

describe("compare: driver → later outcome, against the usual for the time of day", () => {
  it("finds a planted 2.8 bpm per 100 mg at 40 minutes, at about the right size and delay", () => {
    const w = world(1, 21, 0.028);
    const c = compare(w.caf, w.samples, { per: 3, lags: LAGS, perms: 250 });
    expect(c.sure).toBe("clear");
    // The planted 40 min sits inside the range of delays reported as about equally strong.
    expect(c.span![0] * 10).toBeLessThanOrEqual(40); expect(c.span![1] * 10).toBeGreaterThanOrEqual(40);
    expect(c.slope! * 100).toBeGreaterThan(1.8); expect(c.slope! * 100).toBeLessThan(3.8);
    expect(c.thirds!.high - c.thirds!.low).toBeGreaterThan(0.8);
    expect(c.lags).toHaveLength(19);
    // Bands of caffeine: the top one sits clearly above the bottom one, and they climb.
    expect(c.bins.length).toBeGreaterThanOrEqual(3);
    expect(c.bins[c.bins.length - 1].mean - c.bins[0].mean).toBeGreaterThan(0.8);
    expect(c.bins.every((b, k) => k === 0 || b.mean > c.bins[k - 1].mean - 0.2)).toBe(true);
    expect(c.bins.reduce((s, b) => s + b.n, 0)).toBe(c.points.length);
    expect(c.dev).toHaveLength(w.samples.length);
  });

  it("finds nothing when nothing was planted — though coffee comes during the morning climb", () => {
    let clear = 0, likely = 0;
    for (let seed = 100; seed < 120; seed++) {
      const w = world(seed, 21, 0);
      const c = compare(w.caf, w.samples, { per: 3, lags: LAGS, perms: 200, seed });
      if (c.sure === "clear") clear++; if (c.sure === "likely") likely++;
    }
    expect(clear).toBe(0); expect(likely).toBeLessThanOrEqual(2);
  }, 30_000);

  it("a naive version (raw values, best delay kept) is fooled by the morning climb — the reason for both guards", () => {
    const w = world(3, 21, 0);
    // Raw caffeine against raw heart rate at 40 min: strongly 'linked' with nothing planted.
    const xs: number[] = [], ys: number[] = [];
    w.samples.forEach((s) => { const v = w.caf[s.i - 4]; if (v != null) { xs.push(v); ys.push(s.y); } });
    const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
    let sxy = 0, sxx = 0, syy = 0; xs.forEach((x, k) => { sxy += (x - mx) * (ys[k] - my); sxx += (x - mx) ** 2; syy += (ys[k] - my) ** 2; });
    expect(Math.abs(sxy / Math.sqrt(sxx * syy))).toBeGreaterThan(0.15);
    expect(compare(w.caf, w.samples, { per: 3, lags: LAGS, perms: 200 }).sure).not.toBe("clear");
  });

  it("a busy day brings more coffee and a higher heart rate all day: not mistaken for coffee doing it", () => {
    let plainFooled = 0, fooled = 0;
    for (let seed = 200; seed < 210; seed++) {
      const w = world(seed, 21, 0, 40, 4);
      if (compare(w.caf, w.samples, { per: 3, lags: LAGS, perms: 200, seed, within: false }).sure !== "not clear") plainFooled++;
      if (compare(w.caf, w.samples, { per: 3, lags: LAGS, perms: 200, seed }).sure !== "not clear") fooled++;
    }
    expect(plainFooled).toBeGreaterThanOrEqual(5); // the trap is real: against the usual hour alone, it's fooled
    expect(fooled).toBeLessThanOrEqual(1);
  }, 30_000);

  it("days with one point say nothing within the day: not counted", () => {
    const w = world(5, 21, 0.028);
    const one = w.samples.filter((s) => Math.floor(s.i / PER_DAY) >= 15 || s.i % PER_DAY === 60);
    const c = compare(w.caf, one, { per: 3, lags: LAGS, perms: 50 });
    expect(c.days).toBe(6); expect(c.sure).toBe("too few");
  });

  it("too few days: says so, no verdict", () => {
    const w = world(4, 5, 0.03);
    const c = compare(w.caf, w.samples, { per: 3, lags: LAGS });
    expect(c.sure).toBe("too few"); expect(c.best).toBeNull();
  });
});

describe("samples", () => {
  it("heart rate: 10-minute means, every other slot, awake only, workouts and the hour after left out", () => {
    const hr: [number, number, number, number][] = [];
    for (let m = 0; m < 2 * 1440; m++) hr.push([START + m * 60_000, 60 + (m % 10), 0, 0]);
    const gym = [{ start: START + 10 * 3_600_000, end: START + 11 * 3_600_000 }];
    const s = hrSamples(START, hr, gym);
    expect(s.every((x) => x.i % 2 === 0)).toBe(true);
    expect(s.every((x) => { const h = (x.i % PER_DAY) / 6; return h >= 7 && h < 23; })).toBe(true);
    expect(s.some((x) => x.i >= 59 && x.i <= 72)).toBe(false); // 09:50–12:00 on day 1 left out
    expect(s.some((x) => x.i === 58)).toBe(true); // 09:40 kept
    expect(s[0].y).toBe(64.5);
  });
  it("check-ins: one per check-in that has the feeling", () => {
    expect(checkSamples(START, [{ at: START + 3_600_000, v: 7 }, { at: START + 7_200_000, v: null }])).toEqual([{ i: 6, y: 7 }]);
  });
  it("slots follow the local clock across the night the clocks go back", () => {
    const tz = process.env.TZ;
    process.env.TZ = "Europe/Budapest";
    try {
      const day0 = new Date(2026, 9, 20).getTime(); // Tue 20 Oct; clocks go back Sun 25 Oct 03:00 → 02:00
      expect(slotOf(new Date(2026, 9, 24, 9, 0).getTime(), day0)).toBe(4 * PER_DAY + 54);
      expect(slotOf(new Date(2026, 9, 26, 9, 0).getTime(), day0)).toBe(6 * PER_DAY + 54); // still 09:00, not 08:00
      // Counting by elapsed time instead lands an hour off after the change — what this guards against.
      expect(Math.floor((new Date(2026, 9, 26, 9, 0).getTime() - day0) / 600_000)).toBe(6 * PER_DAY + 60);
      const v = slots([[new Date(2026, 9, 26, 9, 5).getTime(), 80]], day0, 7);
      expect(v[6 * PER_DAY + 54]).toBe(80); expect(v.filter((x) => x != null)).toHaveLength(1);
      expect(slotTime(6 * PER_DAY + 54, day0)).toBe(new Date(2026, 9, 26, 9, 5).getTime());
    } finally { process.env.TZ = tz; if (tz === undefined) delete process.env.TZ; }
  });
});
