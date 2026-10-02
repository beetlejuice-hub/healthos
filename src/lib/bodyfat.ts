/**
 * Body fat from a smart scale, read the only way it's worth reading: as a 2-week average.
 * A bathroom scale estimates fat from a weak current through the feet; one reading is off by
 * several points and swings 1–2 points with how much you've drunk. Averages of a few mornings, and
 * the change between two fortnights, are what can be trusted — and only when the change is bigger
 * than that swing. Owner, 2 Oct: yes to one optional box; weight stays the main number.
 */

import type { Entry } from "./types";
import { mean, median, difference } from "./stats";
import { DAY } from "./time";

export const FAT = { windowDays: 14, minReadings: 3, outlierPts: 5, lo: 3, hi: 60 };

type Reading = { at: number; kg: number; pct: number };

export type FatWindow = { pct: number; n: number; fatKg: number; leanKg: number };
export type FatSummary = {
  now: FatWindow | null;
  /** Readings in the last 2 weeks so far (for "2 of 3"). */
  have: number;
  /** Against the 2 weeks before: points, its 95% range, and kg of fat and lean. */
  change: { pts: number; lo: number; hi: number; clear: boolean; fatKg: number; leanKg: number } | null;
};

/** The readings in one window, with any that sit 5+ points from the window's median left out. */
function window(rs: Reading[], from: number, to: number): Reading[] {
  const xs = rs.filter((r) => r.at > from && r.at <= to);
  if (xs.length < 3) return xs;
  const mid = median(xs.map((r) => r.pct));
  return xs.filter((r) => Math.abs(r.pct - mid) < FAT.outlierPts);
}

const summarise = (xs: Reading[]): FatWindow => {
  const fat = mean(xs.map((r) => (r.kg * r.pct) / 100)), kg = mean(xs.map((r) => r.kg));
  return { pct: mean(xs.map((r) => r.pct)), n: xs.length, fatKg: fat, leanKg: kg - fat };
};

export function bodyFat(entries: Entry[], now: number): FatSummary {
  const rs: Reading[] = entries.flatMap((e) => (e.kind === "weight" && e.fatPct != null && e.fatPct >= FAT.lo && e.fatPct <= FAT.hi ? [{ at: e.at, kg: e.kg, pct: e.fatPct }] : []));
  const span = FAT.windowDays * DAY;
  const cur = window(rs, now - span, now), prev = window(rs, now - 2 * span, now - span);
  const ok = (xs: Reading[]) => xs.length >= FAT.minReadings;
  const nowW = ok(cur) ? summarise(cur) : null;
  let change: FatSummary["change"] = null;
  if (nowW && ok(prev)) {
    const d = difference(cur.map((r) => r.pct), prev.map((r) => r.pct));
    const before = summarise(prev);
    if (d) change = { pts: d.value, lo: d.lo, hi: d.hi, clear: d.clear, fatKg: nowW.fatKg - before.fatKg, leanKg: nowW.leanKg - before.leanKg };
  }
  return { now: nowW, have: cur.length, change };
}

/** "20.1" → 20.1; empty or out of range → null (the box is optional). */
export function parseFat(v: string): number | null {
  const n = Number(v.replace(",", ".").replace("%", "").trim());
  return v.trim() && Number.isFinite(n) && n >= FAT.lo && n <= FAT.hi ? Math.round(n * 10) / 10 : null;
}
