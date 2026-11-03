// The new signals in the engine (PLAN 188; owner, 3 Nov: "do 1 and 2"). Planted: mood 1.5 lower on rainy days; energy 1.2
// lower the day after going to bed an hour or more past the usual. The engine finds each where planted and calls neither
// clear where nothing is; Open-Meteo's answer read by day; the band's nights give each evening's hours past the usual.
import { describe, expect, it } from "vitest";
import { feelWorld, rng } from "./bench";
import { evidence } from "./evidence";
import { placeOf, readWeather, weatherUrl, withWeather, type Weather } from "./weather";
import { withBand } from "./daysband";
import { addDays } from "./time";
import type { DayFacts } from "./insights";
import type { BandData } from "./band";

const days = (seed: number) => feelWorld({ seed, days: 90, rateRate: 1 }).map((d, i) => ({ ...d, day: addDays("2026-08-01", i) }));
const clamp = (v: number) => Math.max(1, Math.min(10, v));

describe("the new signals (PLAN 188)", () => {
  it("weather: rainy days, planted mood −1.5 — found; nothing planted — not clear", () => {
    let found = 0, chance = 0;
    for (let s = 1; s <= 10; s++) {
      const { r } = rng(500 + s), base = days(s), w: Weather = {};
      for (const d of base) w[d.day] = { rainMm: r() < 0.35 ? 6 : 0, tMax: 18, daylightH: 12 };
      const planted = withWeather(base, w).map((d) => (d.rainMm! >= 2 && d.mood != null ? { ...d, mood: clamp(d.mood - 1.5) } : d));
      if (evidence(planted, []).get("rain:mood")?.word === "clear") found++;
      if (evidence(withWeather(base, w), []).get("rain:mood")?.word === "clear") chance++;
    }
    expect(found).toBeGreaterThanOrEqual(8);
    expect(chance).toBeLessThanOrEqual(1);
  });
  it("a late night: energy −1.2 the day after — found; nothing planted — not clear", () => {
    let found = 0, chance = 0;
    for (let s = 1; s <= 10; s++) {
      const { r } = rng(900 + s), late = new Set<number>();
      const base = days(s).map((d, i): DayFacts => { const l = r() < 0.3; if (l) late.add(i); return { ...d, bedLateH: l ? 1.5 : 0 }; });
      const planted = base.map((d, i) => (late.has(i - 1) && d.energy != null ? { ...d, energy: clamp(d.energy - 1.2) } : d));
      if (evidence(planted, []).get("bed-late:energy")?.word === "clear") found++;
      if (evidence(base, []).get("bed-late:energy")?.word === "clear") chance++;
    }
    expect(found).toBeGreaterThanOrEqual(7);
    expect(chance).toBeLessThanOrEqual(1);
  });
  it("Open-Meteo: read by day, daylight in hours, odd values left out; the city from the time zone", () => {
    const w = readWeather({ daily: { time: ["2026-11-01", "2026-11-02", "bad"], precipitation_sum: [3.2, null, 1], temperature_2m_max: [12.5, 9, 1], daylight_duration: [34200, 33900, 1] } });
    expect(w).toEqual({ "2026-11-01": { rainMm: 3.2, tMax: 12.5, daylightH: 9.5 }, "2026-11-02": { rainMm: null, tMax: 9, daylightH: 9.42 } });
    expect(readWeather(null)).toEqual({});
    expect(placeOf("Europe/Budapest")).toEqual({ lat: 47.5, lon: 19.04 });
    expect(placeOf("Mars/Olympus")).toBeNull();
    expect(weatherUrl({ lat: 47.5, lon: 19.04 })).toBe("https://api.open-meteo.com/v1/forecast?latitude=47.5&longitude=19.04&daily=precipitation_sum,temperature_2m_max,daylight_duration&past_days=92&forecast_days=1&timezone=auto");
    expect(withWeather([{ day: "2026-11-01" } as DayFacts, { day: "2026-11-03" } as DayFacts], w)).toEqual([{ day: "2026-11-01", rainMm: 3.2, tMax: 12.5, daylightH: 9.5 }, { day: "2026-11-03" }]);
  });
  it("the band's nights: each evening's hours past the usual bedtime", () => {
    const H = 3_600_000, sleep = Array.from({ length: 20 }, (_, k) => {
      const eve = new Date(2026, 9, 1 + k).getTime(), bed = eve + (k === 5 ? 25.5 : 23) * H, end = bed + 8 * H;
      return { id: `s${k}`, start: bed, end, asleepMin: 450, awakeMin: 0, toFallAsleepMin: 10, nap: false, stageMin: {}, stages: [{ type: "light", start: bed + 10 * 60_000, end }] };
    });
    const band = { hr: [], sleep, rhr: {}, hrv: {}, steps: [] } as unknown as BandData;
    const out = withBand(Array.from({ length: 20 }, (_, k) => ({ day: addDays("2026-10-01", k) }) as DayFacts), band, "2026-10-25");
    expect(out[5].bedLateH).toBeCloseTo(2.5, 1);
    expect(out[3].bedLateH).toBeCloseTo(0, 1);
  });
});
