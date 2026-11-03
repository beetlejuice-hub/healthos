/**
 * Your weather, fetched (PLAN 188, the new signals): Open-Meteo once a day for the last 92 days where your time zone's city
 * is, kept on this phone only (public data, nothing of yours sent but the city), and handed to the engine (lib/weather).
 * No time zone city, offline, or Open-Meteo down: no weather — the engine simply doesn't ask about it.
 */

import { useEffect, useSyncExternalStore } from "react";
import { placeOf, readWeather, weatherUrl, type Weather } from "./weather";
import { localDay } from "./time";

const KEY = "healthos.weather";
type Kept = { day: string; tz: string; w: Weather };
let weather: Weather | null = (() => { try { const k = JSON.parse(localStorage.getItem(KEY) ?? "null") as Kept | null; return k?.w ?? null; } catch { return null; } })();
const subs = new Set<() => void>();
let asked = "";

const tzNow = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "Europe/Budapest"; } };

/** Fetched at most once a day (and again if the time zone changed). */
export async function refreshWeather(now = Date.now()): Promise<void> {
  const day = localDay(now), tz = tzNow(), place = placeOf(tz);
  if (!place || asked === `${day}|${tz}`) return;
  asked = `${day}|${tz}`;
  try { const k = JSON.parse(localStorage.getItem(KEY) ?? "null") as Kept | null; if (k?.day === day && k.tz === tz) return; } catch { /* blocked storage */ }
  try {
    const r = await fetch(weatherUrl(place));
    if (!r.ok) return;
    const w = readWeather(await r.json());
    if (!Object.keys(w).length) return;
    weather = w; subs.forEach((f) => f());
    try { localStorage.setItem(KEY, JSON.stringify({ day, tz, w } satisfies Kept)); } catch { /* blocked storage */ }
  } catch { /* offline: no weather today */ }
}

export const weatherNow = () => weather;
/** The weather for the pages, fetched the first time it's asked for today. */
export function useWeather(): Weather | null {
  useEffect(() => { void refreshWeather(); }, []);
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => weather);
}
