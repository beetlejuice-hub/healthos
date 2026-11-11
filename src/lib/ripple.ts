/**
 * Ripples (PLAN 208; owner, 11 Nov: "yea lets do this 4"; from Bearable's factor effect — the same day to a week after —
 * and peri-event averaging in physiology). Every night out, hard session, short night or late-caffeine day lined up on
 * one day and laid on top of each other: each measure from the day before to three days on, against your usual for that
 * stretch (the middle of the days ±14 around it that weren't events or the two days after one). The average, where 8 in
 * 10 fell, and each one. Day 0 is the evening of it (for a short night: the morning it ended), so the morning after a
 * night out is day +1. Pure.
 */

import type { DayFacts } from "./insights";
import { addDays } from "./time";

export type EventKey = "out" | "hard" | "short" | "lateCaf";
export type RippleMeasure = "hrv" | "rhr" | "asleep" | "focus" | "mood" | "energy";
export const EVENTS: Record<EventKey, { name: string; the: string; plural: string }> = {
  out: { name: "A night out", the: "a night out", plural: "nights out (3+ drinks)" },
  hard: { name: "A hard session", the: "a hard session", plural: "your heaviest quarter of sessions" },
  short: { name: "A short night", the: "a short night", plural: "nights under 6 h" },
  lateCaf: { name: "Late caffeine", the: "late caffeine", plural: "days with 100+ mg after 14:00" },
};
export const MEASURES: Record<RippleMeasure, { name: string; unit: string; better: 1 | -1 }> = {
  hrv: { name: "HRV in the morning", unit: "ms", better: 1 }, rhr: { name: "Resting heart rate", unit: "bpm", better: -1 }, asleep: { name: "Asleep", unit: "h", better: 1 },
  focus: { name: "Focus", unit: "", better: 1 }, mood: { name: "Mood", unit: "", better: 1 }, energy: { name: "Energy", unit: "", better: 1 },
};
export const RIPPLE = { offsets: [-1, 0, 1, 2, 3] as const, minEvents: 4, around: 14 } as const;

export type Ripple = { measure: RippleMeasure; n: number; mean: (number | null)[]; lo: (number | null)[]; hi: (number | null)[]; each: (number | null)[][];
  peak: { at: number; v: number } | null; clear: boolean; backAt: number | null };

/** The event days in `days`. */
export function eventDays(days: DayFacts[], e: EventKey): string[] {
  if (e === "out") return days.filter((d) => d.logged && d.alcoholG >= 42).map((d) => d.day);
  if (e === "lateCaf") return days.filter((d) => d.logged && d.lateCaffeineMg >= 100).map((d) => d.day);
  if (e === "short") return days.filter((d) => d.asleepMin != null && d.asleepMin < 360).map((d) => d.day);
  const vols = days.filter((d) => d.trained && d.volumeKg > 0).map((d) => d.volumeKg).sort((a, b) => a - b);
  if (vols.length < 8) return [];
  const q3 = vols[Math.floor(vols.length * 0.75)];
  return days.filter((d) => d.trained && d.volumeKg >= q3).map((d) => d.day);
}

export function seriesOf(days: DayFacts[], band: { rhr?: Record<string, number>; hrv?: Record<string, number> } | null, m: RippleMeasure): Record<string, number> {
  if (m === "hrv") return { ...(band?.hrv ?? {}) };
  if (m === "rhr") return { ...(band?.rhr ?? {}) };
  const o: Record<string, number> = {};
  for (const d of days) { const v = m === "asleep" ? (d.asleepMin != null ? d.asleepMin / 60 : null) : d[m]; if (v != null) o[d.day] = v; }
  return o;
}

const med = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

export function ripple(events: string[], s: Record<string, number>, measure: RippleMeasure): Ripple | null {
  const touched = new Set(events.flatMap((e) => [0, 1, 2].map((k) => addDays(e, k))));
  const each: (number | null)[][] = [];
  for (const e of events) {
    const base: number[] = [];
    for (let k = -RIPPLE.around; k <= RIPPLE.around; k++) { const d = addDays(e, k); if (!touched.has(d) && s[d] != null) base.push(s[d]); }
    const usual = med(base);
    if (usual == null || base.length < 5) continue;
    each.push(RIPPLE.offsets.map((o) => { const v = s[addDays(e, o)]; return v == null ? null : v - usual; }));
  }
  if (each.length < RIPPLE.minEvents) return null;
  const col = (i: number) => each.map((r) => r[i]).filter((v): v is number => v != null).sort((a, b) => a - b);
  const mean = RIPPLE.offsets.map((_, i) => { const c = col(i); return c.length >= 3 ? c.reduce((a, b) => a + b, 0) / c.length : null; });
  const lo = RIPPLE.offsets.map((_, i) => { const c = col(i); return c.length >= 3 ? c[Math.floor(c.length * 0.1)] : null; });
  const hi = RIPPLE.offsets.map((_, i) => { const c = col(i); return c.length >= 3 ? c[Math.ceil(c.length * 0.9) - 1] : null; });
  // the peak: the biggest move from day 0 on; clear when its mean is 2 standard errors from 0
  let peak: Ripple["peak"] = null, clear = false;
  for (let i = 1; i < RIPPLE.offsets.length; i++) { const v = mean[i]; if (v != null && (!peak || Math.abs(v) > Math.abs(peak.v))) peak = { at: RIPPLE.offsets[i], v }; }
  if (peak) { const c = col(RIPPLE.offsets.indexOf(peak.at as never)), m = peak.v, sd = Math.sqrt(c.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, c.length - 1)); clear = Math.abs(m) > 2 * (sd / Math.sqrt(c.length)); }
  const pi = peak ? RIPPLE.offsets.indexOf(peak.at as never) : -1;
  const back = peak && clear ? RIPPLE.offsets.findIndex((_, i) => i > pi && mean[i] != null && Math.abs(mean[i]!) < Math.abs(peak!.v) * 0.3) : -1;
  return { measure, n: each.length, mean, lo, hi, each, peak, clear, backAt: back >= 0 ? RIPPLE.offsets[back] : null };
}
