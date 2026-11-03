/**
 * Your weather, for the engine (PLAN 188, the new signals; owner, 3 Nov: "do 1 and 2"): each day's rain, high and hours of
 * daylight where you live — from Open-Meteo (free, no key, no account) — so the engine can ask whether a rainy day, a
 * short one or a hot night goes with how you feel and sleep. Where you live: from your time zone's city (no location
 * asked). Pure: the place, the request, reading the answer, adding it to your days.
 */

import type { DayFacts } from "./insights";

/** Time zone → its city's latitude and longitude (the zones most likely here; one not listed gets no weather). */
const PLACES: Record<string, [number, number]> = {
  "Europe/Budapest": [47.5, 19.04], "Europe/Vienna": [48.21, 16.37], "Europe/Berlin": [52.52, 13.41], "Europe/London": [51.51, -0.13],
  "Europe/Paris": [48.86, 2.35], "Europe/Prague": [50.08, 14.44], "Europe/Bratislava": [48.15, 17.11], "Europe/Bucharest": [44.43, 26.1],
  "Europe/Warsaw": [52.23, 21.01], "Europe/Rome": [41.9, 12.5], "Europe/Madrid": [40.42, -3.7], "Europe/Amsterdam": [52.37, 4.9],
  "Europe/Zurich": [47.38, 8.54], "Europe/Belgrade": [44.79, 20.45], "Europe/Zagreb": [45.81, 15.98], "Europe/Ljubljana": [46.06, 14.51],
  "America/New_York": [40.71, -74.01], "America/Los_Angeles": [34.05, -118.24], "America/Chicago": [41.88, -87.63],
};
export const placeOf = (tz: string): { lat: number; lon: number } | null => (PLACES[tz] ? { lat: PLACES[tz][0], lon: PLACES[tz][1] } : null);

/** The last 92 days and today, by local day. */
export const weatherUrl = (p: { lat: number; lon: number }) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&daily=precipitation_sum,temperature_2m_max,daylight_duration&past_days=92&forecast_days=1&timezone=auto`;

export type Weather = Record<string, { rainMm: number | null; tMax: number | null; daylightH: number | null }>;

/** Open-Meteo's daily answer → by day; anything missing or odd left out. */
export function readWeather(j: unknown): Weather {
  const d = (j as { daily?: { time?: unknown[]; precipitation_sum?: unknown[]; temperature_2m_max?: unknown[]; daylight_duration?: unknown[] } })?.daily;
  const out: Weather = {};
  if (!d || !Array.isArray(d.time)) return out;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  d.time.forEach((t, i) => {
    if (typeof t !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return;
    const s = num(d.daylight_duration?.[i]);
    out[t] = { rainMm: num(d.precipitation_sum?.[i]), tMax: num(d.temperature_2m_max?.[i]), daylightH: s == null ? null : Math.round((s / 3600) * 100) / 100 };
  });
  return out;
}

/** Your days with their weather; days stay as they were without any. */
export function withWeather(days: DayFacts[], w: Weather | null): DayFacts[] {
  if (!w || !Object.keys(w).length) return days;
  return days.map((d) => (w[d.day] ? { ...d, ...w[d.day] } : d));
}
