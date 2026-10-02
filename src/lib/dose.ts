/**
 * Supplement doses over time (owner, 2 Oct: "should be able to change supplement mg-s and app should
 * look if theres a difference w higher lower dose"). A dose change is kept as history, so every past
 * day is credited with the dose you were on then; days on the higher dose are compared with days on
 * the lower one — "goes with", with a 95% range, never claimed below enough days.
 */

import type { Entry, Supplement } from "./types";
import { addDays, localDay } from "./time";
import { difference, mean, type Range } from "./stats";

export type DoseLog = { at: number; dose: string }[];

/** "400 mg" → 400 mg; "2 x 200mg" → 400 mg; "5 g" → 5 g; "1 tsp" → 1 tsp. Null when there's no number. */
export function doseAmount(text: string): { n: number; unit: string } | null {
  const t = text.toLowerCase().replace(",", ".").replace(/µg|μg/g, "mcg");
  const times = t.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*([a-z]+)?/);
  if (times) return { n: Number(times[1]) * Number(times[2]), unit: times[3] ?? "" };
  const m = t.match(/(\d+(?:\.\d+)?)\s*([a-z]+)?/);
  return m ? { n: Number(m[1]), unit: m[2] ?? "" } : null;
}

/** The dose you were on at `t`. Before the first recorded change, the dose you started with. */
export function doseAt(s: Pick<Supplement, "dose" | "doseLog">, t: number): string {
  const log = [...(s.doseLog ?? [])].sort((a, b) => a.at - b.at);
  if (!log.length) return s.dose;
  let cur = log[0].dose;
  for (const x of log) if (x.at <= t) cur = x.dose;
  return cur;
}

/** The patch for changing a dose at `now`: history keeps the old one. Nothing when it didn't change. */
export function changeDose(s: Pick<Supplement, "dose" | "doseLog">, next: string, now: number): Partial<Supplement> | null {
  const was = doseAt(s, now).trim(), to = next.trim();
  if (to === was) return null;
  if (!was && !s.doseLog?.length) return { dose: to }; // a new supplement's first dose isn't a change
  const log = s.doseLog?.length ? s.doseLog : [{ at: 0, dose: was }];
  return { dose: to, doseLog: [...log, { at: now, dose: to }] };
}

export const DOSE_MIN_DAYS = 5;
export type DoseMetric = "energy" | "mood" | "focus" | "stress" | "sleep";
export type DoseCompare = {
  suppId: string; name: string;
  hi: { dose: string; days: number }; lo: { dose: string; days: number };
  rows: { metric: DoseMetric; hi: number | null; lo: number | null; diff: Range | null }[];
  need: number;
};

/**
 * Higher vs lower dose, for each supplement taken at two or more doses: the next day's average
 * ratings and that night's sleep rating, on days taken at the higher dose vs the lower. Only doses in
 * the same unit are compared; with three or more, the two you took on the most days.
 */
export function doseCompare(entries: Entry[], supplements: Supplement[]): DoseCompare[] {
  const feelByDay = new Map<string, Extract<Entry, { kind: "feel" }>[]>();
  const sleepByDay = new Map<string, number>(); // rating given on that morning
  for (const e of entries) {
    if (e.kind === "feel") feelByDay.set(localDay(e.at), [...(feelByDay.get(localDay(e.at)) ?? []), e]);
    if (e.kind === "sleep" && e.rating != null && !sleepByDay.has(localDay(e.at))) sleepByDay.set(localDay(e.at), e.rating);
  }
  const out: DoseCompare[] = [];
  for (const s of supplements) {
    const days = new Map<string, number>(); // day → amount
    let unit: string | null = null;
    for (const e of entries) {
      if (e.kind !== "supp" || e.suppId !== s.id || e.status !== "taken") continue;
      const a = doseAmount(doseAt(s, e.at));
      if (!a) continue;
      unit ??= a.unit;
      if (a.unit === unit) days.set(localDay(e.at), Math.max(days.get(localDay(e.at)) ?? 0, a.n));
    }
    const counts = new Map<number, number>();
    for (const n of days.values()) counts.set(n, (counts.get(n) ?? 0) + 1);
    if (counts.size < 2) continue;
    const [x, y] = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n]) => n);
    const hiN = Math.max(x, y), loN = Math.min(x, y);
    const fmt = (n: number) => `${n} ${unit}`.trim();
    const group = (n: number) => [...days.entries()].filter(([, v]) => v === n).map(([d]) => d);
    const val = (d: string, k: DoseMetric): number | null => {
      const next = addDays(d, 1);
      if (k === "sleep") return sleepByDay.get(next) ?? null;
      const xs = (feelByDay.get(next) ?? []).flatMap((f) => (f[k] != null ? [f[k]!] : []));
      return xs.length ? mean(xs) : null;
    };
    const hiDays = group(hiN), loDays = group(loN);
    const rows = (["energy", "mood", "focus", "stress", "sleep"] as DoseMetric[]).map((metric) => {
      const a = hiDays.map((d) => val(d, metric)).filter((v): v is number => v != null);
      const b = loDays.map((d) => val(d, metric)).filter((v): v is number => v != null);
      const enough = a.length >= DOSE_MIN_DAYS && b.length >= DOSE_MIN_DAYS;
      return { metric, hi: a.length ? mean(a) : null, lo: b.length ? mean(b) : null, diff: enough ? difference(a, b) : null };
    });
    out.push({ suppId: s.id, name: s.name, hi: { dose: fmt(hiN), days: hiDays.length }, lo: { dose: fmt(loN), days: loDays.length }, rows, need: Math.max(0, DOSE_MIN_DAYS - Math.min(hiDays.length, loDays.length)) });
  }
  return out;
}
