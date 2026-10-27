/**
 * Insights → Body lab, dose-response (PLAN 177, body lab 3; owner, 27 Oct: "yes"). What a dose of something has gone
 * with in your own nights: each drink that evening against your sleeping heart rate and HRV; smoking days against the
 * days you didn't (drinking nights left out, so the cigarettes don't borrow the beer's effect); caffeine after 14:00
 * against deep sleep. Every number says how sure it is (the app's shuffle test, lib/sessionfacts) — "goes with", never
 * "causes". And the month of cigarette answers as a calendar. Pure.
 */

import { alcoholDoses, caffeineDoses } from "./insights";
import { slopeTest, type Slope } from "./sessionfacts";
import type { Night } from "./sleep";
import { SMOKE_BANDS, SMOKE_MID, smokeSaid, type SmokeBand } from "./smoke";
import { addDays, atMinute } from "./time";
import type { Entry } from "./types";

/**
 * minNights: nights before any line is drawn. capDrinks: 4 and more share the last column. outDrinks: a drinking night
 * (left out of the cigarettes card). lateFrom: "after 14:00". minSide: smoking days and days without, each.
 */
export const LAB = { minNights: 14, capDrinks: 4, outDrinks: 2, lateFrom: 14 * 60, minSide: 5, minDrinkNights: 3 } as const;

/** A night with what its evening held: drinks as logged (noon to bed), cigarettes as answered (null: not asked), caffeine after 14:00. */
export type LabNight = { night: Night; drinks: number; cigs: number | null; lateMg: number };

export function labNights(ns: Night[], entries: Entry[]): LabNight[] {
  const drinks = alcoholDoses(entries), cafs = caffeineDoses(entries), smoke = smokeSaid(entries);
  return ns.map((n) => {
    const b = smoke.get(n.eve), noon = atMinute(n.eve, 12 * 60), late = atMinute(n.eve, LAB.lateFrom);
    return { night: n, drinks: drinks.filter((d) => d.at >= noon && d.at < n.bed).length, cigs: b != null ? SMOKE_MID[b] : null,
      lateMg: cafs.filter((c) => c.at >= late && c.at < n.bed).reduce((a, c) => a + c.mg, 0) };
  });
}

const sorted = (v: number[]) => [...v].sort((a, b) => a - b);
const q = (s: number[], p: number) => { const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo); };

/** One column: nights with k drinks (the last: k or more), their middle half and middle, against your no-drink nights' middle. */
export type Bin = { k: number; n: number; lo: number; mid: number; hi: number };
export type DoseLine = { bins: Bin[]; fit: Slope; base: number };
export type DrinkDose = { hr: DoseLine | null; hrv: DoseLine | null; nights: number[]; smoked: number };

function doseLine(ls: LabNight[], of: (n: Night) => number | null | undefined): DoseLine | null {
  const pts = ls.flatMap((l) => { const v = of(l.night); return v == null ? [] : [[Math.min(LAB.capDrinks, l.drinks), v] as [number, number]]; });
  const zero = sorted(pts.filter((p) => p[0] === 0).map((p) => p[1]));
  if (pts.length < LAB.minNights || zero.length < LAB.minSide || pts.filter((p) => p[0] > 0).length < LAB.minDrinkNights) return null;
  const base = q(zero, 0.5);
  const bins = Array.from({ length: LAB.capDrinks + 1 }, (_, k) => {
    const v = sorted(pts.filter((p) => p[0] === k).map((p) => p[1] - base));
    return v.length ? { k, n: v.length, lo: q(v, 0.25), mid: q(v, 0.5), hi: q(v, 0.75) } : null;
  }).filter((b): b is Bin => b != null);
  return { bins, fit: slopeTest(pts, { min: LAB.minNights }), base };
}

/** Drinks that evening against sleeping heart rate and HRV: per drink (the fit) and per column. Null under the minimums. */
export function drinkDose(ls: LabNight[]): DrinkDose {
  const nights = Array.from({ length: LAB.capDrinks + 1 }, (_, k) => ls.filter((l) => Math.min(LAB.capDrinks, l.drinks) === k).length);
  return { hr: doseLine(ls, (n) => n.meanHr), hrv: doseLine(ls, (n) => n.hrv), nights, smoked: ls.filter((l) => l.drinks > 0 && (l.cigs ?? 0) > 0).length };
}

export type SmokeRow = { id: "rhr" | "hrv" | "meanHr"; name: string; unit: string; smoked: number; not: number; fit: Slope };
export type SmokeCompare = { rows: SmokeRow[]; smoked: number; not: number; drinkNights: number } | null;
const SMOKE_ROWS: { id: SmokeRow["id"]; name: string; unit: string; of: (n: Night) => number | null | undefined }[] = [
  { id: "rhr", name: "Resting heart rate next morning", unit: "bpm", of: (n) => n.rhr },
  { id: "hrv", name: "HRV that night", unit: "ms", of: (n) => n.hrv },
  { id: "meanHr", name: "Heart rate asleep", unit: "bpm", of: (n) => n.meanHr },
];

/**
 * Smoking days against days you said none — only days answered (a day not asked is neither), and nights with 2+ drinks
 * left out of both sides: smoking and drinking often share a night, and drinks alone move all three.
 */
export function smokeCompare(ls: LabNight[]): SmokeCompare {
  const known = ls.filter((l) => l.cigs != null), dry = known.filter((l) => l.drinks < LAB.outDrinks);
  const yes = dry.filter((l) => l.cigs! > 0), no = dry.filter((l) => l.cigs === 0);
  if (yes.length < LAB.minSide || no.length < LAB.minSide) return null;
  const rows = SMOKE_ROWS.flatMap((r) => {
    const a = yes.flatMap((l) => { const v = r.of(l.night); return v == null ? [] : [v]; }), b = no.flatMap((l) => { const v = r.of(l.night); return v == null ? [] : [v]; });
    if (a.length < LAB.minSide || b.length < LAB.minSide) return [];
    // the slope on a 0/1 x is the difference of the two means; the shuffle says how often chance does as well
    const fit = slopeTest([...a.map((v) => [1, v] as [number, number]), ...b.map((v) => [0, v] as [number, number])], { min: 2 * LAB.minSide });
    return [{ id: r.id, name: r.name, unit: r.unit, smoked: q(sorted(a), 0.5), not: q(sorted(b), 0.5), fit }];
  });
  return rows.length ? { rows, smoked: yes.length, not: no.length, drinkNights: known.length - dry.length } : null;
}

/** Caffeine after 14:00 that evening against deep sleep: minutes per 100 mg. Null under the minimums or without a few late-coffee nights. */
export function lateCaffeine(ls: LabNight[]): { fit: Slope; per100: number | null; late: number } | null {
  const pts = ls.flatMap((l) => (l.night.deep == null ? [] : [[l.lateMg, l.night.deep] as [number, number]]));
  const late = pts.filter((p) => p[0] > 0).length;
  if (pts.length < LAB.minNights || late < LAB.minSide || pts.length - late < LAB.minSide) return null;
  const fit = slopeTest(pts, { min: LAB.minNights });
  return { fit, per100: fit.slope != null ? fit.slope * 100 : null, late };
}

/** A month of cigarette answers: each day's band (null: not answered; future days left out), the smoke-free count, and the weekdays it falls on. */
export type SmokeDay = { day: string; band: SmokeBand | null; future: boolean };
export function smokeMonth(entries: Entry[], today: string): { days: SmokeDay[]; lead: number; free: number; smoking: number; answered: number; weekdays: { names: string; n: number } | null } {
  const said = smokeSaid(entries), first = `${today.slice(0, 8)}01`;
  const days: SmokeDay[] = [];
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) days.push({ day: d, band: d <= today ? said.get(d) ?? null : null, future: d > today });
  // Monday-first: blanks before the 1st
  const lead = (new Date(`${first}T12:00:00`).getDay() + 6) % 7;
  const smoke = days.filter((d) => d.band != null && d.band !== "0");
  // the two weekdays most smoking days fall on, said only when they hold most of them (4+ smoking days)
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], by = new Array(7).fill(0) as number[];
  for (const d of smoke) by[new Date(`${d.day}T12:00:00`).getDay()]++;
  const top = by.map((n, i) => [n, i]).sort((a, b) => b[0] - a[0]).slice(0, 2).filter(([n]) => n > 0).sort((a, b) => ((a[1] + 6) % 7) - ((b[1] + 6) % 7));
  const inTop = top.reduce((a, [n]) => a + n, 0), mon = top.map(([, i]) => (i + 6) % 7);
  const names = top.map(([, i]) => WD[i]).join(mon.length === 2 && mon[1] - mon[0] === 1 ? "–" : " and ");
  return { days, lead, free: days.filter((d) => d.band === "0").length, smoking: smoke.length, answered: days.filter((d) => d.band != null).length,
    weekdays: smoke.length >= 4 && inTop / smoke.length >= 0.6 ? { names, n: inTop } : null };
}

/** For the calendar's colours: 0 none, 1–3 the bands. */
export const bandLevel = (b: SmokeBand) => SMOKE_BANDS.indexOf(b);
