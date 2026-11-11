/**
 * Body watch (PLAN 210; owner, 11 Nov: "1 love (all)" — the illness early warning, board P). The night check's three
 * (skin temperature, breathing, blood oxygen — lib/nightcheck) and this morning's resting heart rate and HRV, each against
 * your own usual. Three or more off, or two off two mornings running, is the pattern that came before colds and flu in
 * band studies (Mishra 2020 and Natarajan 2020: resting heart rate up and HRV down 1–3 days before symptoms; Stanford,
 * Li 2017; Duke, Grzesiak 2021) — and it's also how a body looks after a night out or a very hard day.
 *
 * What makes it yours: the same pattern looked for in your own past mornings, and what came after — feeling ill logged
 * within two days (the "ill" body word, or "sick/ill/flu" in a check-in's note), or a night out the evening before. Not a
 * diagnosis; it never tells you what to do. Pure.
 *
 *   Usual   the median of the 4 weeks ending a week ago (readiness's window), 10+ mornings; spread from the median
 *           distance (× 1.48), never under a band's noise.
 *   Off     resting heart rate 3+ bpm over and 2× its spread; HRV 10 %+ under and 2× its spread (on a log scale);
 *           skin, breathing, blood oxygen by the night check's own rules.
 */

import { BODY_WORDS } from "./bodywords";
import { NIGHT, nightCheck, type NightDaily, type NightKey } from "./nightcheck";
import { BASE_DAYS, BASE_MIN } from "./readiness";
import { addDays } from "./time";
import type { Entry } from "./types";

export type WatchKey = "rhr" | "hrv" | NightKey;
export type WatchSignal = { id: WatchKey; name: string; value: number; usual: number; diff: number; off: boolean; say: string };
export type Episode = { day: string; ill: boolean; out: boolean };
export type BodyWatch = { day: string; signals: WatchSignal[]; off: WatchSignal[]; alert: boolean; running: number; past: Episode[]; track: string | null };
export type WatchBand = NightDaily & { rhr?: Record<string, number>; hrv?: Record<string, number> };

export const WATCH = { rhrMin: 3, rhrFloor: 1.5, hrvMin: 0.1, hrvFloor: 0.05, alertOff: 3, twoNights: 2, illWithin: 2, minPast: 1 } as const;
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

function heart(rec: Record<string, number> | undefined, day: string, k: "rhr" | "hrv"): WatchSignal | null {
  const v = rec?.[day];
  if (v == null || !(v > 0)) return null;
  const from = addDays(day, -7 - BASE_DAYS), to = addDays(day, -7);
  const base = Object.entries(rec ?? {}).filter(([d, x]) => d >= from && d < to && x > 0).map(([, x]) => (k === "hrv" ? Math.log(x) : x));
  if (base.length < BASE_MIN) return null;
  const u = median(base), spread = Math.max(k === "hrv" ? WATCH.hrvFloor : WATCH.rhrFloor, 1.4826 * median(base.map((x) => Math.abs(x - u))));
  if (k === "rhr") {
    const diff = v - u;
    return { id: k, name: "Resting heart rate", value: v, usual: u, diff, off: diff >= Math.max(WATCH.rhrMin, 2 * spread), say: `${diff >= 0 ? "+" : "−"}${Math.round(Math.abs(diff))} bpm` };
  }
  const d = Math.log(v) - u, pct = (Math.exp(d) - 1) * 100;
  return { id: k, name: "HRV", value: v, usual: Math.exp(u), diff: pct, off: -d >= Math.max(-Math.log(1 - WATCH.hrvMin), 2 * spread), say: `${pct >= 0 ? "+" : "−"}${Math.round(Math.abs(pct))} %` };
}

/** The five for the morning of `day`, and which are off. */
export function signalsOn(band: WatchBand, day: string): WatchSignal[] {
  const night = nightCheck(day, band).signals.filter((s) => s.usual != null && s.diff != null).map((s): WatchSignal => ({
    id: s.id, name: s.name, value: s.value, usual: s.usual!, diff: s.diff!, off: s.off,
    say: `${s.diff! >= 0 ? "+" : "−"}${Math.abs(s.diff!).toFixed(1)}${s.id === "spo2" ? " pts" : NIGHT[s.id].unit}`,
  }));
  return [heart(band.rhr, day, "rhr"), heart(band.hrv, day, "hrv"), ...night].filter((s): s is WatchSignal => !!s);
}

const offOn = (band: WatchBand, day: string) => signalsOn(band, day).filter((s) => s.off).length;
const alertOn = (band: WatchBand, day: string) => { const n = offOn(band, day); return n >= WATCH.alertOff || (n >= WATCH.twoNights && offOn(band, addDays(day, -1)) >= WATCH.twoNights); };

const ILL = BODY_WORDS.find((w) => w.id === "sick")!;
/** The days you said you felt ill: the "ill" body word, or it in a check-in's note. */
export function illDays(entries: Entry[], dayOf: (at: number) => string): Set<string> {
  return new Set(entries.filter((e) => e.kind === "feel" && ((e.body && "sick" in e.body) || ILL.re.test(e.note ?? ""))).map((e) => dayOf(e.at)));
}

/**
 * This morning's watch, and the same pattern in your past mornings (each episode's first morning) with what came after.
 * `outDays`: evenings with a night out (3+ drinks).
 */
export function bodyWatch(band: WatchBand, day: string, ill: Set<string>, outDays: Set<string>): BodyWatch {
  const signals = signalsOn(band, day), off = signals.filter((s) => s.off), alert = alertOn(band, day);
  let running = 0;
  if (alert) for (let d = day; offOn(band, d) >= WATCH.twoNights && running < 14; d = addDays(d, -1)) running++;
  // every earlier morning the band has, the first of each run of alerts
  const days = Object.keys(band.rhr ?? {}).filter((d) => d < addDays(day, -WATCH.illWithin)).sort(), past: Episode[] = [];
  for (const d of days) {
    if (!alertOn(band, d) || (past.length && alertOn(band, addDays(d, -1)))) continue;
    past.push({ day: d, ill: [0, 1, 2].some((k) => ill.has(addDays(d, k))), out: outDays.has(addDays(d, -1)) });
  }
  const n = past.length, nIll = past.filter((e) => e.ill).length, nOut = past.filter((e) => e.out && !e.ill).length;
  const times = (k: number) => (k === 1 ? "once" : k === 2 ? "twice" : `${k} times`);
  const track = n < WATCH.minPast ? null
    : `This pattern showed up ${times(n)} before. ${nIll ? `${nIll === n ? (n === 1 ? "That time" : "Every time") : cap(times(nIll))} you logged feeling ill within 2 days` : "You never logged feeling ill after it"}${nOut ? `; ${times(nOut)} it came the morning after a night out` : ""}.`;
  return { day, signals, off, alert, running, past, track };
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
