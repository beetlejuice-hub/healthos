/**
 * Coin-flip experiments (PLAN 177, body lab 1; owner, 27 Oct: "like this" — and "some supps work when taken all day, for
 * longer"). Phase 1: daily coins, only for what acts the same night — a coffee cutoff, screens off, an evening supplement.
 * The coin picks each day (heads and tails balanced over the run), so how the day went can't decide it; the result stays
 * sealed until the end; then the app re-deals the coins thousands of times to see how often chance alone does as well.
 * What you did is read from the log where it can be (coffee times, the supplement ticks), else from your answer. Pure.
 */

import { addDays, atMinute, localDay, minuteOfDay } from "./time";
import type { Night } from "./sleep";
import type { Entry, Supplement } from "./types";

export type Side = "heads" | "tails";
export type CoinOutcome = "deep" | "asleep" | "latency" | "hrv" | "energy";
export type CoinKind = "caffeine" | "screens" | "supp";
export type Coin = {
  id: string; kind: CoinKind; suppId?: string;
  name: string; question: string; heads: string; tails: string;
  /** The first decides the result; the rest are a look. */ outcomes: CoinOutcome[];
  start: string; days: number; seed: number;
  /** Your answers: what you did that day. */ did?: Record<string, Side>;
  ended?: string;
  /** You opened the result. */ seen?: number;
};

/** days: a run; perms: re-deals for the test; minSide: counted days each side before it says anything; cut: 13:00, and tails' coffee by 16:00. */
export const COIN = { days: 21, perms: 5000, minSide: 5, cut: 13 * 60, lateTo: 16 * 60 } as const;

export const OUTCOME: Record<CoinOutcome, { name: string; unit: string; better: 1 | -1 }> = {
  deep: { name: "Deep sleep", unit: "min", better: 1 },
  asleep: { name: "Time asleep", unit: "min", better: 1 },
  latency: { name: "Falling asleep", unit: "min", better: -1 },
  hrv: { name: "HRV", unit: "ms", better: 1 },
  energy: { name: "Energy next day", unit: "/10", better: 1 },
};

/** What can be flipped daily: things that act the same night. Supplements: your evening ones (you know if yours acts that night). */
export function presets(supps: Supplement[]): Omit<Coin, "id" | "start" | "seed" | "days">[] {
  return [
    { kind: "caffeine", name: "Coffee cutoff", question: "Does stopping coffee at 13:00 help your sleep?", heads: "No coffee after 13:00", tails: "One coffee between 13:00 and 16:00", outcomes: ["deep", "latency", "hrv", "energy"] },
    { kind: "screens", name: "Screens off at 22:30", question: "Does screens off at 22:30 help you fall asleep?", heads: "Screens off at 22:30", tails: "Screens as usual", outcomes: ["latency", "asleep", "deep", "energy"] },
    ...supps.filter((s) => s.active && (s.slots ?? [s.slot]).includes("evening")).map((s) => ({
      kind: "supp" as const, suppId: s.id, name: `${s.name} at night`, question: `Does ${s.name} help your sleep?`, heads: `Take ${s.name} tonight`, tails: `Skip ${s.name} tonight`, outcomes: ["deep", "asleep", "hrv", "energy"] as CoinOutcome[],
    })),
  ];
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = <T>(a: T[], r: () => number) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** The run's coins: half heads, half tails (the odd one to either side), in an order no one can guess day to day. */
export function coinDays(c: Pick<Coin, "start" | "days" | "seed">): { day: string; side: Side }[] {
  const r = rng(c.seed), h = r() < 0.5 ? Math.floor(c.days / 2) : Math.ceil(c.days / 2);
  const sides = shuffle([...Array<Side>(h).fill("heads"), ...Array<Side>(c.days - h).fill("tails")], r);
  return sides.map((side, i) => ({ day: addDays(c.start, i), side }));
}
export const coinOn = (c: Coin, day: string): Side | null => coinDays(c).find((d) => d.day === day)?.side ?? null;
export const endOf = (c: Coin) => addDays(c.start, c.days);
/** The coin's day: until 04:00 it's still the evening before's (a supplement at 00:30 is last night's; lib/smoke does the same). */
export const coinToday = (t: number) => localDay(t - 4 * 3_600_000);
export const running = (c: Coin, today: string) => !c.ended && c.start <= today && today < endOf(c);

/**
 * What you did that day, and how it's known. Coffee: from the log — any after 13:00 means tails' coffee (by 16:00) or
 * heads broken. A supplement: ticked taken is heads, else tails (not logged = not taken, owner 20 Oct). Screens: your
 * answer; not answered counts as following the coin, and is said.
 */
export function didOn(c: Coin, day: string, entries: Entry[]): { side: Side | "other"; how: "log" | "said" | "assumed" } {
  const said = c.did?.[day];
  if (c.kind === "caffeine") {
    const late = entries.filter((e) => e.kind === "drink" && e.caffeineMg > 0 && localDay(e.at) === day && minuteOfDay(e.at) >= COIN.cut);
    // coffee after 16:00 is neither side
    if (late.some((e) => minuteOfDay(e.at) >= COIN.lateTo)) return { side: "other", how: "log" };
    return { side: late.length ? "tails" : "heads", how: "log" };
  }
  if (c.kind === "supp") {
    const took = entries.some((e) => e.kind === "supp" && e.suppId === c.suppId && e.status === "taken" && coinToday(e.at) === day);
    return { side: took ? "heads" : "tails", how: "log" };
  }
  return said ? { side: said, how: "said" } : { side: coinOn(c, day) ?? "heads", how: "assumed" };
}

const mean = (v: number[]) => v.reduce((a, x) => a + x, 0) / v.length;
export type Sure = "clear" | "likely" | "not clear" | "too few";
export type CoinRow = { id: CoinOutcome; heads: number | null; tails: number | null; diff: number | null; p: number | null; sure: Sure; n: [number, number] };
export type CoinResult = {
  /** Days the coin was followed and the night measured; days it wasn't (left out); days counted on trust (not answered). */
  counted: number; broken: number; assumed: number; done: boolean;
  rows: CoinRow[];
  /** The first outcome's verdict: better (the way that's good for you), worse, or no clear change; null while sealed or too few. */
  verdict: "better" | "worse" | "no-clear-change" | null;
};

/**
 * The result: for each outcome, heads days against tails days (only days you did what the coin said, with the night or the
 * next day measured), and how often re-dealing the same coins at random gives a gap as big (5,000 re-deals). Sealed —
 * no rows — until the run is over (`done`), so it can't nudge you mid-way.
 */
export function coinResult(c: Coin, ns: Night[], entries: Entry[], today: string, opts: { peek?: boolean } = {}): CoinResult {
  const end = c.ended && c.ended < endOf(c) ? c.ended : endOf(c), done = today >= end;
  const byEve = new Map(ns.map((n) => [n.eve, n]));
  const energy = new Map<string, number[]>();
  for (const e of entries) if (e.kind === "feel" && e.energy != null) (energy.get(localDay(e.at)) ?? energy.set(localDay(e.at), []).get(localDay(e.at))!).push(e.energy);
  const value = (o: CoinOutcome, day: string): number | null => {
    if (o === "energy") { const v = energy.get(addDays(day, 1)); return v?.length ? mean(v) : null; }
    const n = byEve.get(day); if (!n) return null;
    return o === "deep" ? n.deep : o === "asleep" ? n.asleep : o === "latency" ? n.latency : n.hrv;
  };
  let broken = 0, assumed = 0;
  const kept: { day: string; side: Side }[] = [];
  for (const d of coinDays(c)) {
    if (d.day >= end || d.day >= today) continue;
    const did = didOn(c, d.day, entries);
    if (did.side !== d.side) { broken++; continue; }
    if (did.how === "assumed") assumed++;
    kept.push(d);
  }
  const counted = kept.filter((d) => c.outcomes.some((o) => value(o, d.day) != null)).length;
  if (!done && !opts.peek) return { counted, broken, assumed, done, rows: [], verdict: null };
  const rows = c.outcomes.map((o, oi): CoinRow => {
    const pts = kept.flatMap((d) => { const v = value(o, d.day); return v == null ? [] : [{ h: d.side === "heads", v }]; });
    const hv = pts.filter((p) => p.h).map((p) => p.v), tv = pts.filter((p) => !p.h).map((p) => p.v);
    if (hv.length < COIN.minSide || tv.length < COIN.minSide) return { id: o, heads: hv.length ? mean(hv) : null, tails: tv.length ? mean(tv) : null, diff: null, p: null, sure: "too few", n: [hv.length, tv.length] };
    const diff = mean(hv) - mean(tv), vals = pts.map((p) => p.v), labels = pts.map((p) => p.h), r = rng(c.seed + 7919 * (oi + 1));
    let hits = 0;
    for (let k = 0; k < COIN.perms; k++) {
      shuffle(labels, r);
      let hs = 0, hn = 0, ts = 0;
      for (let i = 0; i < vals.length; i++) if (labels[i]) { hs += vals[i]; hn++; } else ts += vals[i];
      if (Math.abs(hs / hn - ts / (vals.length - hn)) >= Math.abs(diff) - 1e-9) hits++;
    }
    const p = (hits + 1) / (COIN.perms + 1);
    return { id: o, heads: mean(hv), tails: mean(tv), diff, p, sure: p < 0.002 ? "clear" : p < 0.02 ? "likely" : "not clear", n: [hv.length, tv.length] };
  });
  const first = rows[0];
  const verdict = !done || first.sure === "too few" ? null : first.sure === "not clear" ? "no-clear-change" : Math.sign(first.diff!) === OUTCOME[first.id].better ? "better" : "worse";
  return { counted, broken, assumed, done, rows, verdict };
}

/** A new run from a preset, starting today; the seed from the clock, so nobody — you included — knows tomorrow's coin. */
export const newCoin = (p: Omit<Coin, "id" | "start" | "seed" | "days">, id: string, today: string, seed = Math.floor(Math.random() * 2 ** 31)): Coin => ({ ...p, id, start: today, days: COIN.days, seed });

/** What tapping "Followed the coin" logs where the log is the truth: a supplement ticked taken (heads) or skipped (tails), that evening. */
export function followEntry(c: Coin, day: string, side: Side): Omit<Extract<Entry, { kind: "supp" }>, "id"> | null {
  if (c.kind !== "supp" || !c.suppId) return null;
  return { kind: "supp", at: atMinute(day, 21 * 60 + 30), suppId: c.suppId, status: side === "heads" ? "taken" : "skipped", slot: "evening" };
}
