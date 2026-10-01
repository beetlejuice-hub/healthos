/**
 * The scout: "these two move together — worth a look". Owner: "even if it's not proven, highlight
 * that this and this move each other … the app should notify me about interesting things".
 *
 * Looser than the effect engine (which only speaks when a finding is near-certain), and honest
 * about it: every pattern says how often it held ("4 of 5 times") and that it could be chance —
 * and once flagged, the scout keeps checking the *new* days ("held 5 of 6 days since"), so real
 * patterns firm up and flukes fade. That forward check is the confirmation the owner asked for.
 *
 * Method, per pair of daily signals from different families (food, caffeine, alcohol, gym, each
 * supplement, feelings, body; wearable signals plug in the same way):
 *   - same day, and "thing today → other thing tomorrow";
 *   - ranks, with weekends and weekdays centred separately (so "beer and good mood, both on
 *     Saturdays" doesn't count), then a correlation and its p-value;
 *   - shown when |r| ≥ 0.35, p < 0.005 and 14+ days; at most 5, strongest first.
 */

import type { DayFacts } from "./insights";
import type { Supplement } from "./types";
import { pTwoSided } from "./regress";
import { mean, median } from "./stats";

export type Signal = {
  id: string;
  /** Pairs within a family are left out: kcal vs biggest meal says nothing new. */
  family: string;
  /** "biggest meal", "energy". */
  name: string;
  /** Yes/no signals: how to say a "yes" day — "a gym day". */
  yes?: string;
  unit?: string;
  /** "calories tend", not "calories tends". */
  plural?: boolean;
  get: (d: DayFacts) => number | null;
  /** Master-graph lane to show it on. */
  lane?: string;
};

export function signals(supplements: Supplement[]): Signal[] {
  const logged = (f: (d: DayFacts) => number) => (d: DayFacts) => (d.logged ? f(d) : null);
  const s: Signal[] = [
    { id: "kcal", family: "food", name: "calories", plural: true, unit: "kcal", get: (d) => d.kcal, lane: "kcal" },
    { id: "bigMeal", family: "food", name: "biggest meal", unit: "kcal", get: (d) => d.bigMealKcal, lane: "meals" },
    { id: "protein", family: "food", name: "protein", unit: "g", get: (d) => d.proteinG, lane: "meals" },
    { id: "lateEat", family: "food", name: "late eating", yes: "late-eating", get: (d) => (d.kcal == null ? null : d.lateEat ? 1 : 0), lane: "meals" },
    { id: "caffeine", family: "caf", name: "caffeine", unit: "mg", get: logged((d) => d.caffeineMg), lane: "caf" },
    { id: "lateCaf", family: "caf", name: "caffeine after 14:00", unit: "mg", get: logged((d) => d.lateCaffeineMg), lane: "caf" },
    { id: "alcohol", family: "alc", name: "alcohol", unit: "g", get: logged((d) => d.alcoholG), lane: "alc" },
    { id: "gym", family: "gym", name: "gym", yes: "a gym day", get: (d) => (d.trained ? 1 : 0), lane: "gym" },
    { id: "volume", family: "gym", name: "training volume", unit: "kg", get: (d) => d.volumeKg, lane: "gym" },
    { id: "energy", family: "feel", name: "energy", get: (d) => d.energy, lane: "energy" },
    { id: "mood", family: "feel", name: "mood", get: (d) => d.mood, lane: "mood" },
    { id: "focus", family: "feel", name: "focus", get: (d) => d.focus, lane: "focus" },
    { id: "stress", family: "feel", name: "stress", get: (d) => d.stress, lane: "stress" },
  ];
  for (const x of supplements) {
    s.push({ id: `supp-${x.id}`, family: `supp-${x.id}`, name: x.name, yes: `a ${x.name} day`, get: (d) => (!d.stackAnswered ? null : d.taken.has(x.id) ? 1 : 0), lane: "supps" });
  }
  return s;
}

export const SCOUT = { minDays: 14, minR: 0.35, maxP: 0.005, show: 5 };

/** Ranks (ties averaged), then centred separately on weekend and weekday days. */
function rankCentred(v: number[], weekend: boolean[]): number[] {
  const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(v.length);
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  const mw = mean(r.filter((_, i) => weekend[i])), md = mean(r.filter((_, i) => !weekend[i]));
  return r.map((x, i) => x - (weekend[i] ? (Number.isFinite(mw) ? mw : 0) : (Number.isFinite(md) ? md : 0)));
}

const corr = (a: number[], b: number[]) => {
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) { sab += a[i] * b[i]; saa += a[i] * a[i]; sbb += b[i] * b[i]; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;
};

export type Pattern = {
  id: string;
  a: Signal; b: Signal; lag: 0 | 1;
  r: number; p: number; n: number;
  /** +1 move the same way, −1 opposite ways. */
  sign: 1 | -1;
  /** How often it held: on the "yes" (or highest-a) days, b was on the expected side of usual. */
  held: number; of: number;
  /** Yes/no a: average b on yes days vs other days. */
  onAvg?: number; offAvg?: number;
  /** Days that show it (yes days, or the highest-a days) — highlighted on the master graph. */
  days: string[];
  text: string;
};

const fmt = (v: number, unit?: string) => (unit === "kcal" || unit === "mg" || unit === "kg" ? `${Math.round(v).toLocaleString("en-GB")}${unit ? ` ${unit}` : ""}` : v.toFixed(1));

/** Evaluate one pair; null when there isn't enough data. */
export function pair(a: Signal, b: Signal, lag: 0 | 1, facts: DayFacts[]): Pattern | null {
  // Same day, a yes/no thing leads the sentence: "On a gym day, calories…", not "Calories and gym…".
  if (lag === 0 && b.yes && !a.yes) return pair(b, a, 0, facts);
  const xs: number[] = [], ys: number[] = [], we: boolean[] = [], dayOf: string[] = [];
  facts.forEach((d, i) => {
    const e = facts[i + lag]; if (!e) return;
    const x = a.get(d), y = b.get(e);
    if (x == null || y == null) return;
    xs.push(x); ys.push(y); we.push(e.weekend); dayOf.push(d.day);
  });
  const n = xs.length;
  if (n < SCOUT.minDays || new Set(xs).size < 2 || new Set(ys).size < 2) return null;
  const r = corr(rankCentred(xs, we), rankCentred(ys, we));
  if (!Number.isFinite(r) || Math.abs(r) >= 1) return null;
  const t = r * Math.sqrt((n - 2) / (1 - r * r));
  const p = pTwoSided(t, n - 2);
  const sign: 1 | -1 = r >= 0 ? 1 : -1;
  // "How often it held", in plain counts.
  let held = 0, of = 0, onAvg: number | undefined, offAvg: number | undefined, days: string[];
  if (a.yes) {
    const on = ys.filter((_, i) => xs[i] > 0), off = ys.filter((_, i) => xs[i] === 0);
    // Against your average on other days (a median is 0 when most days are 0, and then nothing can be "lower").
    const usual = mean(off);
    onAvg = mean(on); offAvg = mean(off);
    on.forEach((y) => { of++; if ((y - usual) * sign > 0) held++; });
    days = dayOf.filter((_, i) => xs[i] > 0);
  } else {
    // Your highest third of days vs the rest: "on your 8 biggest-meal days, mood was below your other days 6 times".
    const cut = [...xs].sort((u, v) => u - v)[Math.floor(n * 2 / 3)];
    const isTop = (x: number) => x >= cut && x > 0;
    // "Usual" = your other days (when most days are 0 — no late coffee — that's the 0 days).
    const usual = mean(ys.filter((_, i) => !isTop(xs[i])));
    const top = xs.map((x, i) => [x, i] as const).filter(([x]) => isTop(x));
    top.forEach(([, i]) => { of++; if ((ys[i] - usual) * sign > 0) held++; });
    days = top.map(([, i]) => dayOf[i]);
  }
  const next = lag ? "the next day" : "that day";
  const bName = b.family === "feel" ? `your ${b.name}` : b.name;
  const text = a.yes
    ? `On ${next === "that day" ? "" : "the day after "}${a.yes}${a.yes.startsWith("a ") ? "" : " days"}, ${bName} ${b.plural ? "tend" : "tends"} to be ${sign > 0 ? "higher" : "lower"} (${fmt(onAvg!, b.unit)} vs ${fmt(offAvg!, b.unit)})`
    : b.yes
      ? `When ${a.name} is higher, the next day is ${sign > 0 ? "more" : "less"} often ${b.yes}`
      : `${cap(a.name)} and ${lag ? `next-day ${b.name}` : b.name} move ${sign > 0 ? "the same way" : "opposite ways"}`;
  return { id: `${a.id}>${b.id}@${lag}`, a, b, lag, r, p, n, sign, held, of, onAvg, offAvg, days, text };
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Every cross-family pair, same day and next day; the strongest few that clear the bar. */
export function scout(facts: DayFacts[], supplements: Supplement[], skip: (id: string) => boolean = () => false): Pattern[] {
  const sig = signals(supplements);
  const all: Pattern[] = [];
  for (let i = 0; i < sig.length; i++) for (let j = 0; j < sig.length; j++) {
    if (i === j || sig[i].family === sig[j].family) continue;
    if (j > i) { const p0 = pair(sig[i], sig[j], 0, facts); if (p0) all.push(p0); }
    const p1 = pair(sig[i], sig[j], 1, facts); if (p1) all.push(p1);
  }
  // The strongest per pair (same-day or next-day, either direction).
  const best = new Map<string, Pattern>();
  for (const p of all) {
    if (Math.abs(p.r) < SCOUT.minR || p.p >= SCOUT.maxP) continue;
    // One per pair of *families*: "caffeine" and "late caffeine" vs mood are the same story —
    // so the family pair is also the pattern's id (what you dismiss, and what's remembered).
    const key = [p.a.family, p.b.family].sort().join("~");
    if (skip(key)) continue;
    if (!best.has(key) || Math.abs(p.r) > Math.abs(best.get(key)!.r)) best.set(key, p);
  }
  return [...best.entries()].map(([key, p]) => ({ ...p, id: key })).sort((x, y) => Math.abs(y.r) * Math.sqrt(y.n) - Math.abs(x.r) * Math.sqrt(x.n)).slice(0, SCOUT.show);
}

/** What the scout remembers about a pattern once you've been shown it. */
export type ScoutMemo = { first: string; sign: 1 | -1; seen?: boolean; dismissed?: boolean };

/**
 * The forward check: since the pattern was first flagged, on how many of the *new* days did it
 * hold? Null until there are 3 new days that count. This is the confirmation — data the pattern
 * was never fitted on.
 */
export function since(p: Pattern, memo: ScoutMemo, facts: DayFacts[]): { held: number; of: number } | null {
  const after = facts.filter((d) => d.day > memo.first);
  if (!after.length) return null;
  const before = facts.filter((d) => d.day <= memo.first);
  const pairs = (fs: DayFacts[]) => fs.flatMap((d) => {
    const i = facts.indexOf(d), e = facts[i + p.lag];
    const x = e ? p.a.get(d) : null, y = e ? p.b.get(e) : null;
    return x == null || y == null ? [] : [[x, y] as const];
  });
  const old = pairs(before), now = pairs(after);
  if (!old.length) return null;
  const usualY = median(old.map((q) => q[1]));
  const cut = p.a.yes ? 0.5 : median(old.map((q) => q[0]));
  // A new day counts when the thing happened (yes, or above your usual amount).
  const counted = now.filter(([x]) => x > cut);
  if (counted.length < 3) return null;
  return { held: counted.filter(([, y]) => (y - usualY) * memo.sign > 0).length, of: counted.length };
}

/**
 * What happens to a pattern as new days arrive: "confirmed" once it held on 4+ of 5+ new days,
 * "faded" (dropped from view) if it held on fewer than half of 5+ new days, else "watching".
 */
export function verdict(s: { held: number; of: number } | null): "watching" | "confirmed" | "faded" {
  if (!s || s.of < 5) return "watching";
  if (s.held / s.of >= 0.75) return "confirmed";
  if (s.held / s.of < 0.5) return "faded";
  return "watching";
}
