/**
 * A night out of 100 (PLAN 97). Pure. Owner, 14 Oct: "a 100/… pointing for my sleep based on all the sleep data … and also
 * add in my rating"; 15 Oct: "pls dont make the score compared to my usual, it should have a range, like taken from
 * studies, like an ideal scenario, an average one, and a bad one, and then compare this and my usual to the last nights
 * sleep..cause if my usual is pretty bad, it will still show me a good score". So each part is scored on fixed ranges —
 * ideal, fair, poor — from the research, and your usual is shown on the same scale, not scored against:
 *
 *   Length 25          7–9 h ideal, 6–7 fair, under 6 poor (National Sleep Foundation 2015: 7–9 recommended, 6 "may be
 *                      appropriate", under 6 not); 9–10 fair, past 10 poor.
 *   Asleep in bed 10   of the time in bed, asleep: 85 %+ ideal (NSF 2017), 75–85 fair, under 75 poor.
 *   Awake in night 7   20 min or less ideal (NSF), 20–50 fair, past 50 poor.
 *   Wakings 3          over 5 min: 0–1 ideal (NSF), 2–3 fair, 4+ poor.
 *   Fell asleep in 5   within 30 min ideal (NSF), 30–45 fair, past 45 poor.
 *   Deep 7, REM 8      share of the time asleep: deep 13 %+ ideal, 8–13 fair; REM 20 %+, 15–20 fair (adult sleep norms).
 *                      Small: wrist bands score stages roughly, and the NSF found no agreement on them.
 *   Fell asleep at 5   22:00–23:00 ideal — the lowest heart-disease risk in 88,000 people (Nikbakhtian 2021); 20–22 and
 *                      23–00:30 fair; past 00:30 poor. Never marked down for being earlier than your usual (owner, 15 Oct:
 *                      "I went to bed earlier and timing is at 0").
 *   HRV 8, Heart rate asleep 7
 *                      the one place with no one-size range — HRV differs several-fold between people — so against your
 *                      usual (the 28 nights before), in steps the size a drink moves them (~−3.5 ms HRV, ~+2.5 bpm a
 *                      drink): HRV within 8 % under ideal, 8–20 % under fair, more poor; heart rate up to +1.5 bpm ideal,
 *                      +1.5–4 fair, more poor.
 *   Your rating 15     7–10 ideal, 4–7 fair, 1–4 poor.
 *
 * Unknown parts (no rating yet, no stages, a measure the band didn't send, under 5 nights for the heart's usual) are left
 * out, named, and the rest scaled to 100. Words on Fitbit's bands: 90+ great, 80+ good, 60+ fair, under that rough.
 */

import { clockH, usual, type Night } from "./sleep";
import { addDays } from "./time";

export const NEED_H = 7;
/** Nights before this one that make your usual (shown on each part; scored against only for the heart). */
export const USUAL_NIGHTS = 28;
export type Zone = "ideal" | "fair" | "poor";
export type PartId = "length" | "efficiency" | "waso" | "wakings" | "onset" | "deep" | "rem" | "bedtime" | "hrv" | "hrsleep" | "rating";
export type Part = {
  id: PartId; name: string; got: number; max: number; why: string;
  /** For the drawing: this night and your usual on one scale, with the study's zones. */
  value: number; usual: number | null; scale: [number, number]; zones: [number, number, Zone][]; zone: Zone; ideal: string; usualText: string | null;
};
export type SleepScore = { score: number; parts: Part[]; left: { id: PartId; name: string; max: number }[]; word: string };

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}`;
const clockOf = (h: number) => { const m = Math.round((((h % 24) + 24) % 24) * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
/** Straight lines between the points of a curve, flat past its ends. */
export function curveAt(pts: [number, number][], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0); }
  return pts[pts.length - 1][1];
}
// on a boundary the better zone wins, the way the NSF's marks read ("85 % or more", "30 minutes or less", "6 h may be
// appropriate"): 85 % asleep in bed is ideal, 75 % fair, 15 % REM fair
const RANK: Record<Zone, number> = { ideal: 2, fair: 1, poor: 0 };
const zoneAt = (zones: [number, number, Zone][], x: number): Zone => {
  const inIt = zones.filter(([a, b]) => x >= a && x <= b).map((z) => z[2]);
  if (inIt.length) return inIt.reduce((a, z) => (RANK[z] > RANK[a] ? z : a));
  return (x < zones[0][0] ? zones[0] : zones[zones.length - 1])[2];
};

export const scoreWord = (s: number) => (s >= 90 ? "great" : s >= 80 ? "good" : s >= 60 ? "fair" : "rough");

/** Wakings of more than 5 minutes between falling asleep and waking for good, from the stages (null without them). */
export function longWakings(n: Pick<Night, "stages" | "onset" | "wake">): number | null {
  if (!n.stages?.length) return null;
  return n.stages.filter((s) => s.type === "awake" && s.start >= n.onset && s.end <= n.wake && s.end - s.start > 5 * 60_000).length;
}

type Spec = { name: string; max: number; scale: [number, number]; zones: [number, number, Zone][]; curve: [number, number][]; ideal: string; text: (v: number) => string };
export const SPECS: Record<PartId, Spec> = {
  length: { name: "Length", max: 25, scale: [4, 11], zones: [[4, 6, "poor"], [6, 7, "fair"], [7, 9, "ideal"], [9, 10, "fair"], [10, 11, "poor"]], curve: [[4, 0], [5, 0.25], [6, 0.6], [7, 1], [9, 1], [10, 0.8], [11, 0.5]], ideal: "7–9 h", text: (h) => hm(h * 60) },
  efficiency: { name: "Asleep in bed", max: 10, scale: [60, 100], zones: [[60, 75, "poor"], [75, 85, "fair"], [85, 100, "ideal"]], curve: [[60, 0], [75, 0.4], [85, 1], [100, 1]], ideal: "85 %+", text: (v) => `${Math.round(v)} %` },
  waso: { name: "Awake in the night", max: 7, scale: [0, 90], zones: [[0, 20, "ideal"], [20, 50, "fair"], [50, 90, "poor"]], curve: [[0, 1], [20, 1], [50, 0.4], [90, 0]], ideal: "20 min or less", text: (v) => `${Math.round(v)} min` },
  wakings: { name: "Wakings over 5 min", max: 3, scale: [0, 6], zones: [[0, 1.5, "ideal"], [1.5, 3.5, "fair"], [3.5, 6, "poor"]], curve: [[0, 1], [1, 1], [3, 0.5], [5, 0]], ideal: "0–1", text: (v) => String(Math.round(v)) },
  onset: { name: "Fell asleep in", max: 5, scale: [0, 75], zones: [[0, 30, "ideal"], [30, 45, "fair"], [45, 75, "poor"]], curve: [[0, 1], [30, 1], [45, 0.5], [60, 0.1], [75, 0]], ideal: "30 min or less", text: (v) => `${Math.round(v)} min` },
  deep: { name: "Deep", max: 7, scale: [0, 30], zones: [[0, 8, "poor"], [8, 13, "fair"], [13, 30, "ideal"]], curve: [[0, 0], [8, 0.4], [13, 1], [30, 1]], ideal: "13 %+ of sleep", text: (v) => `${Math.round(v)} %` },
  rem: { name: "REM", max: 8, scale: [0, 35], zones: [[0, 15, "poor"], [15, 20, "fair"], [20, 35, "ideal"]], curve: [[0, 0], [15, 0.5], [20, 1], [35, 1]], ideal: "20 %+ of sleep", text: (v) => `${Math.round(v)} %` },
  bedtime: { name: "Fell asleep at", max: 5, scale: [20, 27], zones: [[20, 22, "fair"], [22, 23, "ideal"], [23, 24.5, "fair"], [24.5, 27, "poor"]], curve: [[20, 0.6], [22, 1], [23, 1], [24, 0.7], [25, 0.4], [26, 0.15], [27, 0]], ideal: "22:00–23:00", text: clockOf },
  hrv: { name: "HRV", max: 8, scale: [-40, 20], zones: [[-40, -20, "poor"], [-20, -8, "fair"], [-8, 20, "ideal"]], curve: [[-35, 0], [-20, 0.35], [-8, 1], [20, 1]], ideal: "within 8 % of your usual", text: (v) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v))} %` },
  hrsleep: { name: "Heart rate asleep", max: 7, scale: [-5, 10], zones: [[-5, 1.5, "ideal"], [1.5, 4, "fair"], [4, 10, "poor"]], curve: [[-5, 1], [1.5, 1], [4, 0.5], [8, 0]], ideal: "at your usual", text: (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)} bpm` },
  rating: { name: "Your rating", max: 15, scale: [1, 10], zones: [[1, 4, "poor"], [4, 7, "fair"], [7, 10, "ideal"]], curve: [[0, 0], [10, 1]], ideal: "7–10", text: (v) => `${v}/10` },
};

/** This night's score: each part on its study range; your usual (the 28 nights before) shown, and used for the heart only. */
export function sleepScore(n: Night, rating: number | null | undefined, others: Night[]): SleepScore {
  const rest = others.filter((x) => x.id !== n.id && x.day < n.day && x.day >= addDays(n.day, -USUAL_NIGHTS));
  const parts: Part[] = [], left: SleepScore["left"] = [];
  // a part from its value on the study's scale; `u` your usual on the same scale; `why` the value in words
  const part = (id: PartId, v: number | null | undefined, u: number | null | undefined, why?: string) => {
    const s = SPECS[id];
    if (!ok(v)) { left.push({ id, name: s.name, max: s.max }); return; }
    parts.push({ id, name: s.name, max: s.max, got: Math.round(s.max * clamp(curveAt(s.curve, v)) * 10) / 10, why: why ?? s.text(v),
      value: v, usual: ok(u) ? u : null, scale: s.scale, zones: s.zones, zone: zoneAt(s.zones, v), ideal: s.ideal, usualText: ok(u) && id !== "hrv" && id !== "hrsleep" ? s.text(u) : null }); // the heart's usual is in its why
  };
  const um = (f: (x: Night) => number | null | undefined) => usual(rest.map(f))?.mid ?? null;
  const inBed = (x: Night) => (ok(x.up) && ok(x.bed) && x.up > x.bed ? (x.up - x.bed) / 60_000 : null);
  const eff = (x: Night) => { const b = inBed(x); return b && ok(x.asleep) ? (100 * x.asleep) / b : null; };
  const share = (x: Night, m: number | null) => (ok(m) && ok(x.asleep) && x.asleep > 0 ? (100 * m) / x.asleep : null);
  part("length", ok(n.asleep) ? n.asleep / 60 : null, um((x) => (ok(x.asleep) ? x.asleep / 60 : null)));
  part("efficiency", eff(n), um(eff));
  part("waso", n.awake, um((x) => x.awake));
  part("wakings", longWakings(n), um(longWakings));
  part("onset", n.latency, um((x) => x.latency));
  part("deep", share(n, n.deep), um((x) => share(x, x.deep)));
  part("rem", share(n, n.rem), um((x) => share(x, x.rem)));
  const onAt = (x: Night) => (ok(x.onset) && x.eve ? clockH(x.onset, x.eve) : null);
  part("bedtime", onAt(n), um(onAt));
  // the heart: against your usual — there's no one-size HRV; your usual is the 0 of its scale
  const uh = usual(rest.map((x) => x.hrv)), uhr = usual(rest.map((x) => x.meanHr ?? null)), ul = usual(rest.map((x) => x.low));
  const dHrv = ok(n.hrv) && uh ? (100 * (n.hrv - uh.mid)) / uh.mid : null;
  part("hrv", dHrv, 0, dHrv == null ? "" : `${Math.round(n.hrv!)} ms · usual ${Math.round(uh!.mid)} (${SPECS.hrv.text(dHrv)})`);
  const byMean = ok(n.meanHr) && uhr != null, dHr = byMean ? n.meanHr! - uhr!.mid : ok(n.low) && ul ? n.low - ul.mid : null;
  part("hrsleep", dHr, 0, dHr == null ? "" : byMean ? `${Math.round(n.meanHr!)} bpm · usual ${Math.round(uhr!.mid)}` : `lowest ${Math.round(n.low!)} bpm · usual ${Math.round(ul!.mid)}`);
  part("rating", rating ?? null, null);
  const got = parts.reduce((a, p) => a + p.got, 0), max = parts.reduce((a, p) => a + p.max, 0);
  const score = max ? Math.round((got / max) * 100) : 0;
  return { score, parts, left, word: scoreWord(score) };
}
