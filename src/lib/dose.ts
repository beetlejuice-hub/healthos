/**
 * Supplement doses over time (owner, 2 Oct: "should be able to change supplement mg-s and app should
 * look if theres a difference w higher lower dose"). A dose change is kept as history, so every past
 * day is credited with the dose you were on then; days on the higher dose are compared with days on
 * the lower one — "goes with", with a 95% range, never claimed below enough days.
 */

import { answerSlot, type Entry, type Supplement } from "./types";
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

/**
 * One capsule (scoop, drop…) of a supplement: "2 x 200 mg" → 200 mg; "200 mg" → the whole dose is one (owner, 9 Oct:
 * "i set up 1 capsule as 200mg … +1 to add +1 caps, so its 400mg taken"). Null without a number.
 */
export function perCapsule(s: Pick<Supplement, "dose" | "doseLog">, t: number): { n: number; unit: string } | null {
  const d = doseAt(s, t).toLowerCase().replace(",", ".");
  const times = d.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*([a-z]+)?/);
  if (times) return { n: Number(times[2]), unit: times[3] ?? "" };
  return doseAmount(d);
}

/** What was taken: the amount logged with it, else the plan's dose that day. */
export const takenAmount = (s: Pick<Supplement, "dose" | "doseLog">, e: { at: number; amount?: string }): string => e.amount ?? doseAt(s, e.at);

const fmtN = (n: number) => String(Math.round(n * 1000) / 1000);
/** One capsule more (+1) or less (−1) than `current`, never under one capsule. Null when the dose has no number. */
export function stepAmount(s: Pick<Supplement, "dose" | "doseLog">, t: number, current: string, by: 1 | -1): string | null {
  const per = perCapsule(s, t), cur = doseAmount(current);
  if (!per || !cur || cur.unit !== per.unit) return null;
  const n = Math.max(per.n, cur.n + by * per.n);
  return `${fmtN(n)} ${per.unit}`.trim();
}

/** "400 mg" as capsules of this supplement: 2 — or null when it isn't a whole number of them. */
export function capsulesIn(s: Pick<Supplement, "dose" | "doseLog">, t: number, amount: string): number | null {
  const per = perCapsule(s, t), a = doseAmount(amount);
  if (!per || !a || a.unit !== per.unit || per.n <= 0) return null;
  const k = a.n / per.n;
  return Math.abs(k - Math.round(k)) < 1e-6 ? Math.round(k) : null;
}

/** A typed amount ("300", "300mg", "0,5 g") in the dose's unit: "300 mg". A bare number takes the dose's unit. Null when unreadable. */
export function typedAmount(s: Pick<Supplement, "dose" | "doseLog">, t: number, text: string): string | null {
  const a = doseAmount(text), unit = perCapsule(s, t)?.unit ?? "";
  if (!a || a.n <= 0) return null;
  return `${fmtN(a.n)} ${a.unit || unit}`.trim();
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
 * ratings and that night's sleep rating, on days taken at the higher dose vs the lower. A day's dose is
 * everything taken that day — what was logged with each intake, else the plan's dose. Only doses in
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
    // A day's dose: each slot counted once (the same slot logged twice is one intake), the slots added up.
    const perSlot = new Map<string, number>(); // "day|slot" → amount
    let unit: string | null = null;
    for (const e of entries) {
      if (e.kind !== "supp" || e.suppId !== s.id || e.status !== "taken") continue;
      const a = doseAmount(takenAmount(s, e));
      if (!a) continue;
      unit ??= a.unit;
      if (a.unit !== unit) continue;
      const k = `${localDay(e.at)}|${answerSlot(e, s)}`;
      perSlot.set(k, Math.max(perSlot.get(k) ?? 0, a.n));
    }
    const days = new Map<string, number>(); // day → amount
    for (const [k, n] of perSlot) { const d = k.split("|")[0]; days.set(d, (days.get(d) ?? 0) + n); }
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
