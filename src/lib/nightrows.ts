/**
 * Last night against your usual, row by row (owner, 13 Nov: "A A A … make theese better and smarter"; canvas Sleep A,
 * "last night, one picture"). Each measure the band gives — asleep, time to fall asleep, deep, REM, awake in the night,
 * the lowest heart rate, bedtime — with your usual (the median of the other nights shown) and the change, called better
 * or worse only past half its usual spread (and a floor, so 2 minutes isn't news). Then tonight: the bedtime your best
 * nights started by. Pure.
 */

import type { Night } from "./sleep";

export type Tone = "better" | "worse" | "same";
export type NightRow = { key: string; name: string; value: string; usual: string; delta: string | null; tone: Tone };
export const ROWS = { spread: 0.5, minNights: 5 } as const;

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sd = (v: number[]) => { const m = v.reduce((a, x) => a + x, 0) / v.length; return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / v.length); };
export const hm = (min: number) => (Math.abs(min) < 60 ? `${Math.round(Math.abs(min))} min` : `${Math.floor(Math.abs(min) / 60)} h ${String(Math.round(Math.abs(min) % 60)).padStart(2, "0")}`);
/** Minutes since 18:00 (so a bedtime after midnight sorts after one before it). */
const eveMin = (t: number) => { const d = new Date(t); return ((d.getHours() * 60 + d.getMinutes()) - 18 * 60 + 1440) % 1440; };
const clockOf = (m: number) => { const x = Math.round(m + 18 * 60) % 1440; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };

type Def = { key: string; name: string; get: (n: Night) => number | null; better: 1 | -1 | 0; floor: number; fmt: (v: number) => string; d: (v: number) => string };
const mins = (v: number) => hm(v), dmin = (v: number) => `${v > 0 ? "+" : "−"}${hm(v)}`;
const DEFS: Def[] = [
  { key: "asleep", name: "Asleep", get: (n) => n.asleep, better: 1, floor: 15, fmt: mins, d: dmin },
  { key: "latency", name: "To fall asleep", get: (n) => n.latency, better: -1, floor: 5, fmt: mins, d: dmin },
  { key: "deep", name: "Deep sleep", get: (n) => n.deep, better: 1, floor: 10, fmt: mins, d: dmin },
  { key: "rem", name: "REM sleep", get: (n) => n.rem, better: 1, floor: 10, fmt: mins, d: dmin },
  { key: "awake", name: "Awake in the night", get: (n) => n.awake, better: -1, floor: 5, fmt: mins, d: dmin },
  { key: "low", name: "Lowest heart rate", get: (n) => n.low, better: -1, floor: 2, fmt: (v) => `${Math.round(v)} bpm`, d: (v) => `${v > 0 ? "+" : "−"}${Math.abs(Math.round(v))}` },
  { key: "bed", name: "In bed", get: (n) => eveMin(n.bed), better: 0, floor: 15, fmt: clockOf, d: (v) => `${hm(v)} ${v > 0 ? "later" : "earlier"}` },
];

/** Each measure of `n` against the other nights; a measure the band didn't give that night is left out. Null under 5 others. */
export function nightRows(n: Night, all: Night[]): NightRow[] | null {
  const others = all.filter((x) => x.id !== n.id);
  if (others.length < ROWS.minNights) return null;
  return DEFS.flatMap((def): NightRow[] => {
    const v = def.get(n), past = others.map(def.get).filter((x): x is number => x != null && Number.isFinite(x));
    if (v == null || past.length < ROWS.minNights) return [];
    const u = median(past), diff = v - u, moved = Math.abs(diff) >= Math.max(def.floor, ROWS.spread * sd(past));
    const tone: Tone = !moved || def.better === 0 ? "same" : Math.sign(diff) === def.better ? "better" : "worse";
    return [{ key: def.key, name: def.name, value: def.fmt(v), usual: def.fmt(u), delta: moved ? def.d(diff) : null, tone }];
  });
}

/** The bedtime your best nights started by: the latest bedtime among your top quarter by score, up to the quarter hour.
 * Null under 8 nights. */
export function bestBedtime(ns: Night[], scores: number[]): string | null {
  if (ns.length < 8 || scores.length !== ns.length) return null;
  const cut = [...scores].sort((a, b) => b - a)[Math.max(0, Math.floor(ns.length / 4) - 1)];
  const beds = ns.filter((_, i) => scores[i] >= cut).map((n) => eveMin(n.bed));
  const q = Math.ceil(Math.max(...beds) / 15) * 15; // "by": up to the quarter hour, so every one of them did
  return clockOf(q);
}
