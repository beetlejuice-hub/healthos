/**
 * The morning read's pictures (PLAN 150; owner, 21 Oct: "it was just too long, too much info w no visual and just boring.
 * I like that its adding tips and advices"). Each item may name one of his measures; the app draws its last 14 days from
 * his own data — the AI never draws numbers. Pure.
 */

import type { DayFacts } from "../insights";
import type { Entry } from "../types";
import { addDays, localDay } from "../time";
import type { DigestMeasure } from "./tasks";

/** `amount`: a day's total, drawn as bars from zero; else a level (a rating, his weight), drawn as a line. */
export const MEASURES: Record<DigestMeasure, { name: string; unit: string; amount: boolean; of?: (d: DayFacts) => number | null }> = {
  sleep: { name: "Sleep rating", unit: "/10", amount: false, of: (d) => d.sleep },
  protein: { name: "Protein", unit: "g", amount: true, of: (d) => d.proteinG },
  kcal: { name: "Calories", unit: "kcal", amount: true, of: (d) => d.kcal },
  mood: { name: "Mood", unit: "/10", amount: false, of: (d) => d.mood },
  energy: { name: "Energy", unit: "/10", amount: false, of: (d) => d.energy },
  focus: { name: "Focus", unit: "/10", amount: false, of: (d) => d.focus },
  stress: { name: "Stress", unit: "/10", amount: false, of: (d) => d.stress },
  caffeine: { name: "Caffeine", unit: "mg", amount: true, of: (d) => (d.logged ? d.caffeineMg : null) },
  alcohol: { name: "Alcohol", unit: "g", amount: true, of: (d) => (d.logged ? d.alcoholG : null) },
  lifting: { name: "Kg lifted", unit: "kg", amount: true, of: (d) => (d.volumeKg > 0 ? d.volumeKg : null) },
  weight: { name: "Weight", unit: "kg", amount: false },
};

/** The last `days` days (oldest first, the last one today) of a measure: a value or null per day. */
export function measureDays(key: DigestMeasure, facts: DayFacts[], entries: Entry[], today: string, days = 14): (number | null)[] {
  const by = new Map(facts.map((f) => [f.day, f])), kg = new Map<string, number>();
  // a day's weight is its first weigh-in (the morning one)
  if (key === "weight") for (const e of [...entries].sort((a, b) => a.at - b.at)) if (e.kind === "weight" && !kg.has(localDay(e.at))) kg.set(localDay(e.at), e.kg);
  const out: (number | null)[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i), f = by.get(d);
    out.push(key === "weight" ? kg.get(d) ?? null : f ? MEASURES[key].of!(f) : null);
  }
  return out;
}

/** One value in its unit: "7.5/10", "158 g", "1,940 kcal", "82.4 kg". */
export function measureValue(key: DigestMeasure, v: number): string {
  const m = MEASURES[key], tenth = m.unit === "/10" || key === "weight";
  return `${tenth ? +v.toFixed(1) : Math.round(v).toLocaleString("en-GB")}${m.unit === "/10" ? "/10" : ` ${m.unit}`}`;
}

/** The words under the chart: "avg 142 g over 11 days · yesterday 158 g". Today is left out of the average (it isn't over). */
export function measureWords(key: DigestMeasure, vals: (number | null)[]): string {
  const f = (v: number) => measureValue(key, v), amount = MEASURES[key].amount;
  const past = vals.slice(0, -1), known = past.filter((v): v is number => v != null), yest = past[past.length - 1], now = vals[vals.length - 1];
  if (!known.length) return now != null ? `today ${f(now)}` : "nothing logged in the last 14 days";
  const avg = known.reduce((a, b) => a + b, 0) / known.length;
  // a level today is a reading (this morning's weight); an amount today is only so far
  return [`avg ${f(avg)} over ${known.length} day${known.length === 1 ? "" : "s"}`, yest != null ? `yesterday ${f(yest)}` : "", now != null ? `today ${f(now)}${amount ? " so far" : ""}` : ""].filter(Boolean).join(" · ");
}
