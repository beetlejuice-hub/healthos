/**
 * Cardio in phases, with pace (PLAN 191; owner, 3 Nov: "Can app ask for average pace and different phases of cardio? Like i
 * do incline walk then normal running and just want the app to calculate some stats from my average pace average miles
 * average hbpm etc. like i know im shit at running but eanf to see that as stats").
 *
 * A cardio session's phases (Workout.phases): "Next: Run" during it ends one and starts the next, each ending where the
 * next starts and the last at the session's end; a session without any is one phase. On Save each phase takes the
 * distance the treadmill showed (kept in km; shown in miles or km). From that and its time: pace (time per distance) and
 * speed; from the band's minutes inside it: heart rate; and beats per distance (average bpm × minutes ÷ distance) — fewer
 * is fitter, even when the pace doesn't move. Per kind over time: average pace (all the time over all the distance),
 * distance, heart rate, best pace, and the first 3 against the last 3. Pure.
 */

import type { HrMinute } from "./band";
import type { CardioPhase, Workout } from "./types";
import { cardioHr, cardioKcal, kindOf, type CardioHr } from "./cardio";

export const MI_KM = 1.609344;
export type DistUnit = "mi" | "km";
export const CARDIO_STATS = { compare: 3 } as const;

/** A phase with its end, as it's measured. */
export type PhaseSpan = CardioPhase & { end: number; workoutId: string };

/**
 * A workout's cardio: a cardio session's whole time, or the timed cardio after lifting (phase 2: from its ▶ Start to its
 * Done). Null when it has none that was timed, or it was skipped.
 */
export function cardioPart(w: Workout, now: number): { what: string; start: number; end: number } | null {
  if (w.kind === "cardio") return { what: w.cardio?.what?.trim() || w.template || "Cardio", start: w.startedAt, end: w.endedAt ?? now };
  const c = w.cardio;
  if (c?.startedAt == null || c.done === false) return null;
  return { what: c.what?.trim() || "Cardio", start: c.startedAt, end: c.done ? c.at ?? w.endedAt ?? now : now };
}

/** A workout's cardio phases, each with its end; one phase when it has none (its kind, its whole time). `end`: where it
 * stops when it hasn't yet (the Save screen's Stop). */
export function phasesOf(w: Workout, now: number, end?: number): PhaseSpan[] {
  const part = cardioPart(w, now);
  if (!part) return [];
  const stop = end ?? part.end, ps = w.phases?.length ? w.phases : [{ what: part.what, start: part.start }];
  return ps.map((p, i) => ({ ...p, end: i + 1 < ps.length ? ps[i + 1].start : stop, workoutId: w.id })).filter((p) => p.end > p.start);
}

/** "Next: Run": the phase so far ends now and the next begins; cardio with none gets its first from its start. */
export function nextPhase(w: Workout, what: string, now: number): CardioPhase[] {
  const part = cardioPart(w, now), ps = w.phases?.length ? w.phases : [{ what: part?.what || "Cardio", start: part?.start ?? w.startedAt }];
  return [...ps, { what, start: now }];
}

/** About how many kcal, each phase at its own kind's MET (phase 2): null when none of them is a known kind or no weight. */
export function phasesKcal(ps: { what: string; start: number; end: number }[], kg: number | null): { kcal: number; parts: { what: string; met: number; min: number }[] } | null {
  const parts = ps.flatMap((p) => { const min = (p.end - p.start) / 60_000, k = cardioKcal(p.what, min, kg); return k ? [{ what: p.what, met: k.met, min, kcal: (k.met * kg! * min) / 60 }] : []; });
  return parts.length ? { kcal: Math.round(parts.reduce((a, x) => a + x.kcal, 0)), parts: parts.map(({ what, met, min }) => ({ what, met, min: Math.round(min) })) } : null;
}

/**
 * A pace better than every one before it of that kind (phase 2: "personal bests"), from `since`: with 2 or more before it
 * to beat. `by`: seconds per km faster than the best before.
 */
export function newBests(ps: PhaseStat[], since: number): { kind: string; pace: number; by: number; start: number }[] {
  const out: { kind: string; pace: number; by: number; start: number }[] = [];
  for (const p of ps) {
    if (p.start < since || p.pace == null) continue;
    const before = ps.filter((q) => q.kind === p.kind && q.pace != null && q.start < p.start);
    const best = before.length >= 2 ? Math.min(...before.map((q) => q.pace!)) : null;
    if (best != null && p.pace < best) out.push({ kind: p.kind, pace: p.pace, by: best - p.pace, start: p.start });
  }
  return out;
}

/** What a session was, in words: "Incline walk → Run". */
export const phaseWords = (ps: { what: string }[]) => ps.map((p) => p.what).filter((x, i, a) => i === 0 || x !== a[i - 1]).join(" → ");

export type PhaseStat = { what: string; kind: string; start: number; end: number; min: number; km: number | null; incline: number | null;
  /** seconds per km */ pace: number | null; kmh: number | null; hr: CardioHr | null; /** heartbeats per km */ beats: number | null };

/** One phase's numbers. */
export function phaseStat(p: PhaseSpan, hr: HrMinute[]): PhaseStat {
  const min = (p.end - p.start) / 60_000, km = p.km && p.km > 0 ? p.km : null, h = cardioHr(hr, p.start, p.end);
  return {
    what: p.what, kind: kindOf(p.what)?.name ?? (p.what.trim() || "Cardio"), start: p.start, end: p.end, min, km, incline: p.incline ?? null,
    pace: km ? (min * 60) / km : null, kmh: km ? km / (min / 60) : null, hr: h, beats: km && h ? (h.avg * min) / km : null,
  };
}

/** Every phase of every finished cardio session, oldest first. */
export function allPhases(workouts: Workout[], hr: HrMinute[], now: number): PhaseStat[] {
  // finished: a cardio session that's ended, the cardio after lifting that's Done (phase 2)
  const done = (w: Workout) => (w.kind === "cardio" ? w.endedAt != null : w.cardio?.done === true && w.cardio.startedAt != null);
  return workouts.filter(done).flatMap((w) => phasesOf(w, now)).sort((a, b) => a.start - b.start).map((p) => phaseStat(p, hr));
}

export type KindStats = {
  kind: string; n: number; withDist: number; km: number; avgKm: number | null;
  pace: number | null; best: number | null; hr: number | null; peak: number | null; beats: number | null; incline: number | null;
  /** the first and the last CARDIO_STATS.compare with a distance: their pace and beats, when there are twice as many */
  then: { pace: number; beats: number | null } | null; now: { pace: number; beats: number | null } | null;
  series: { start: number; pace: number; beats: number | null }[];
};

const avg = (v: number[]) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : null);
/** Over a set of phases: all their time over all their distance; beats likewise, on those with heart rate too. */
const pooled = (ps: PhaseStat[]) => {
  const d = ps.filter((p) => p.km), km = d.reduce((a, p) => a + p.km!, 0), sec = d.reduce((a, p) => a + p.min * 60, 0);
  const b = d.filter((p) => p.hr), bkm = b.reduce((a, p) => a + p.km!, 0), beats = b.reduce((a, p) => a + p.hr!.avg * p.min, 0);
  return { km, pace: km ? sec / km : null, beats: bkm ? beats / bkm : null };
};

/** Per kind, the most done first: its phases' pace, distance, heart rate (minute-weighted) and how they've moved. */
export function kindStats(ps: PhaseStat[]): KindStats[] {
  const kinds = [...new Set(ps.map((p) => p.kind))];
  return kinds.map((kind): KindStats => {
    const mine = ps.filter((p) => p.kind === kind), d = mine.filter((p) => p.km), h = mine.filter((p) => p.hr), all = pooled(mine);
    const hrMin = h.reduce((a, p) => a + p.min, 0), k = CARDIO_STATS.compare, enough = d.length >= 2 * k;
    const side = (x: PhaseStat[]) => { const q = pooled(x); return { pace: q.pace!, beats: q.beats }; };
    return {
      kind, n: mine.length, withDist: d.length, km: all.km, avgKm: d.length ? all.km / d.length : null, pace: all.pace,
      best: d.length ? Math.min(...d.map((p) => p.pace!)) : null, hr: hrMin ? Math.round(h.reduce((a, p) => a + p.hr!.avg * p.min, 0) / hrMin) : null,
      peak: h.length ? Math.max(...h.map((p) => p.hr!.peak)) : null, beats: all.beats, incline: avg(mine.flatMap((p) => (p.incline != null ? [p.incline] : []))),
      then: enough ? side(d.slice(0, k)) : null, now: enough ? side(d.slice(-k)) : null,
      series: d.map((p) => ({ start: p.start, pace: p.pace!, beats: p.beats })),
    };
  }).sort((a, b) => b.withDist - a.withDist || b.n - a.n);
}

/** "11:08" a mile (or km): seconds per km in the unit. */
export const paceText = (secPerKm: number, u: DistUnit) => { const s = Math.round(u === "mi" ? secPerKm * MI_KM : secPerKm); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
/** "1.8 mi" */
export const distText = (km: number, u: DistUnit, unit = true) => `${(u === "mi" ? km / MI_KM : km).toFixed(km / (u === "mi" ? MI_KM : 1) >= 10 ? 0 : 1)}${unit ? ` ${u}` : ""}`;
/** "5.5 mph" / "8.9 km/h" */
export const speedText = (kmh: number, u: DistUnit) => (u === "mi" ? `${(kmh / MI_KM).toFixed(1)} mph` : `${kmh.toFixed(1)} km/h`);
/** "1,790" beats a mile (or km) */
export const beatsText = (perKm: number, u: DistUnit) => Math.round(u === "mi" ? perKm * MI_KM : perKm).toLocaleString("en-GB");
/** What's typed, in the unit → km; null when it isn't a distance. */
export const toKm = (typed: string, u: DistUnit): number | null => { const v = Number(typed.replace(",", ".")); return v > 0 && v < 200 ? (u === "mi" ? v * MI_KM : v) : null; };
/** km → what to show in the box. */
export const fromKm = (km: number | undefined, u: DistUnit) => (km ? String(Math.round((u === "mi" ? km / MI_KM : km) * 100) / 100) : "");

/** For the AI: a session's phases in words, with distance, pace and heart rate where known. */
export function phaseLine(ps: PhaseStat[], u: DistUnit): string {
  return ps.map((p) => `${p.what} ${Math.round(p.min)} min${p.km ? ` ${distText(p.km, u)} (${paceText(p.pace!, u)} /${u})` : ""}${p.incline != null ? ` at ${p.incline} % incline` : ""}${p.hr ? `, avg ${p.hr.avg} bpm` : ""}`).join("; ");
}
