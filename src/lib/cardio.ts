/**
 * Cardio sessions (PLAN 130; owner, 20 Oct: "Feel like ts doesnt track cardio sessions properly. It should be a button that
 * i press and it strts w timer, then it logs as cardio sessions, reads and understands the heart bpm and other metrics and
 * later it can make it into the digest. Cardio is important for my weight loss.").
 *
 * A cardio stretch is a session of its own (a workout with kind "cardio", timed start to stop) or the cardio after lifting
 * (a workout's `cardio`, timed from Start to Done). Its heart rate is the band's minutes inside it; its calories an
 * estimate from the Compendium of Physical Activities (Ainsworth 2011): MET × your weight × hours — the whole session,
 * resting included. The heart rate isn't used for calories: without your age and sex it would only be a guess. Pure.
 */

import type { HrMinute } from "./band";
import type { Workout } from "./types";
import { clock, dayLabel } from "./time";
import { weekStart } from "./liftstrength";

/** The one-tap kinds, each with its Compendium MET and what that entry is. */
export const CARDIO_KINDS: { name: string; met: number; is: string; match: RegExp }[] = [
  { name: "Stairmaster", met: 9.0, is: "stair-treadmill, general", match: /stair|step ?mill|climb/i },
  { name: "Incline walk", met: 8.0, is: "walking uphill, 6–15 % grade, 4.7–5.6 km/h", match: /incline|uphill|hill/i },
  { name: "Bike", met: 7.0, is: "stationary bike, general", match: /bike|cycl|spin/i },
  { name: "Rower", met: 7.0, is: "rowing machine, 100 W", match: /row/i },
  { name: "Run", met: 8.0, is: "running, general", match: /run|jog/i },
  { name: "Elliptical", met: 5.0, is: "elliptical, moderate", match: /ellip|cross ?trainer/i },
  { name: "Walk", met: 3.5, is: "walking, 4.8 km/h, level", match: /walk/i },
];
/** The chips: the kinds you'd tap (a plain walk is in Steps already). */
export const CARDIO_CHIPS = CARDIO_KINDS.filter((k) => k.name !== "Walk").map((k) => k.name);

/** What kind a cardio is, from its words ("20 min stairmaster" → Stairmaster); first match wins, so "incline walk" is uphill. */
export const kindOf = (what: string) => CARDIO_KINDS.find((k) => k.match.test(what)) ?? null;

/** A forgotten cardio session (the timer left running) ends itself after this long, marked as such. */
export const CARDIO_MAX_MIN = 180;

export type CardioSpan = { what: string; start: number; end: number; workoutId: string; /** a session of its own, not after lifting */ own: boolean; running: boolean; auto?: boolean };

/** Every timed cardio stretch, oldest first: sessions of their own, and cardio after lifting that was started. */
export function cardioSpans(workouts: Workout[], now: number): CardioSpan[] {
  const out: CardioSpan[] = [];
  for (const w of workouts) {
    if (w.kind === "cardio") out.push({ what: w.cardio?.what ?? w.template, start: w.startedAt, end: w.endedAt ?? now, workoutId: w.id, own: true, running: w.endedAt == null, ...(w.autoEnded ? { auto: true } : {}) });
    else if (w.cardio?.startedAt != null && w.cardio.done !== false) {
      const end = w.cardio.done ? w.cardio.at ?? w.endedAt : w.endedAt;
      out.push({ what: w.cardio.what, start: w.cardio.startedAt, end: end ?? now, workoutId: w.id, own: false, running: end == null });
    }
  }
  return out.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
}

export type CardioHr = { n: number; avg: number; peak: number };
/** The band's minutes inside a stretch: how many, their average, and the highest beat. Null with fewer than 2. */
export function cardioHr(hr: HrMinute[], start: number, end: number): CardioHr | null {
  const m = hr.filter(([t]) => t >= start && t < end);
  if (m.length < 2) return null;
  return { n: m.length, avg: Math.round(m.reduce((a, x) => a + x[1], 0) / m.length), peak: Math.max(...m.map((x) => x[3])) };
}

/** About how many kcal: MET × kg × hours. Null when the kind or your weight isn't known. */
export function cardioKcal(what: string, minutes: number, kg: number | null): { kcal: number; met: number; is: string } | null {
  const k = kindOf(what);
  if (!k || !kg || minutes <= 0) return null;
  return { kcal: Math.round((k.met * kg * minutes) / 60), met: k.met, is: k.is };
}

export const minutesOf = (s: { start: number; end: number }) => Math.round((s.end - s.start) / 60_000);

/** The last stretch of the same kind before this one. */
export function lastLike(spans: CardioSpan[], s: CardioSpan): CardioSpan | null {
  const k = kindOf(s.what)?.name ?? s.what.toLowerCase();
  return [...spans].reverse().find((x) => x.start < s.start && !x.running && (kindOf(x.what)?.name ?? x.what.toLowerCase()) === k) ?? null;
}

/**
 * One line for the AI (the night read-back, PLAN 130): "Stairmaster 18:00–18:40 (40 min): heart rate avg 142, peak 165 bpm
 * (band, 38 of 40 min); about 480 kcal (MET 9 × 80 kg) — last Stairmaster, Tue 13 Oct: 35 min, avg 138 bpm".
 */
export function cardioLine(s: CardioSpan, spans: CardioSpan[], hr: HrMinute[], kg: number | null, max?: number | null): string {
  const min = minutesOf(s), h = cardioHr(hr, s.start, s.end), kc = cardioKcal(s.what, min, kg), last = lastLike(spans, s);
  const zones = h && max ? zoneMinutes(hr, s.start, s.end, max) : null;
  const lh = last ? cardioHr(hr, last.start, last.end) : null;
  return `${s.what} ${clock(s.start)}–${clock(s.end)} (${min} min${s.auto ? ", the timer was left running — ended by itself" : ""})${s.own ? "" : ", after lifting"}: `
    + (h ? `heart rate avg ${h.avg}, peak ${h.peak} bpm (band, ${h.n} of ${min} min)${zones && zones.some(Boolean) ? `, zones ${zoneWords(zones)} (max ${max})` : ""}` : "no heart rate from the band for it")
    + (kc ? `; about ${kc.kcal} kcal (MET ${kc.met} × ${kg} kg)` : "")
    + (last ? ` — last ${kindOf(last.what)?.name ?? last.what}, ${dayLabel(last.start)}: ${minutesOf(last)} min${lh ? `, avg ${lh.avg} bpm` : ""}` : " — the first of its kind");
}

/**
 * For the AI's usual context (the morning read, chat; PLAN 130 — "later it can make it into the digest … Cardio is
 * important for my weight loss"): this week's cardio against the weeks before, then the last few sessions. Weeks start
 * Monday. Nothing when there's no cardio yet.
 */
export function cardioWeekLines(spans: CardioSpan[], hr: HrMinute[], kg: number | null, now: number, weeks = 4, last = 3, max?: number | null): string[] {
  const done = spans.filter((s) => !s.running && s.start <= now);
  if (!done.length) return [];
  const starts = [weekStart(now)];
  while (starts.length < weeks) starts.push(weekStart(starts[starts.length - 1] - 1));
  const inWeek = (k: number) => done.filter((s) => s.start >= starts[k] && (k === 0 || s.start < starts[k - 1]));
  const mins = (ss: CardioSpan[]) => ss.reduce((a, s) => a + minutesOf(s), 0);
  const now0 = inWeek(0), kcal = now0.reduce((a, s) => a + (cardioKcal(s.what, minutesOf(s), kg)?.kcal ?? 0), 0);
  return [
    `Cardio this week (from ${dayLabel(starts[0])}): ${now0.length} session${now0.length === 1 ? "" : "s"}, ${mins(now0)} min${kcal ? `, about ${kcal} kcal` : ""}; the ${weeks - 1} weeks before, newest first: ${starts.slice(1).map((_, k) => `${mins(inWeek(k + 1))} min`).join(", ")}`,
    ...(last > 0 ? done.slice(-last).reverse() : []).map((s) => `Cardio: ${cardioLine(s, done, hr, kg, max)}`),
  ];
}

export type CardioWeek = { week: number; min: number; sessions: number; kcal: number };
/** The last `weeks` weeks (Monday-first, oldest first), each with its cardio minutes, sessions and about-kcal (PLAN 146). */
export function cardioWeeks(spans: CardioSpan[], kg: number | null, now: number, weeks = 8): CardioWeek[] {
  const starts = [weekStart(now)];
  while (starts.length < weeks) starts.push(weekStart(starts[starts.length - 1] - 1));
  return starts.reverse().map((w, k, all) => {
    const mine = spans.filter((s) => !s.running && s.start >= w && (k === all.length - 1 || s.start < all[k + 1]) && s.start <= now);
    return { week: w, min: mine.reduce((a, s) => a + minutesOf(s), 0), sessions: mine.length, kcal: mine.reduce((a, s) => a + (cardioKcal(s.what, minutesOf(s), kg)?.kcal ?? 0), 0) };
  });
}

/**
 * Heart-rate zones (owner: "go" on zones for cardio, after #146). Max heart rate: his own number when he set one, else
 * from his age (Tanaka 2001: 208 − 0.7 × age — closer than 220 − age for adults), else none — and the zones say what they
 * need instead of guessing. The five zones by % of max: Z1 50–60, Z2 60–70, Z3 70–80, Z4 80–90, Z5 90+ (minutes under 50 %
 * aren't a zone). Pure.
 */
export const ZONES = [0.5, 0.6, 0.7, 0.8, 0.9] as const;
export function maxHrOf(s: { maxHr?: number; age?: number }): { bpm: number; from: "set" | "age" } | null {
  if (s.maxHr && s.maxHr >= 120 && s.maxHr <= 230) return { bpm: Math.round(s.maxHr), from: "set" };
  if (s.age && s.age >= 12 && s.age <= 100) return { bpm: Math.round(208 - 0.7 * s.age), from: "age" };
  return null;
}
/** Minutes in Z1–Z5 inside a stretch, from the band's minute averages. */
export function zoneMinutes(hr: HrMinute[], start: number, end: number, max: number): number[] {
  const out = [0, 0, 0, 0, 0];
  for (const [t, avg] of hr) {
    if (t < start || t >= end) continue;
    const f = avg / max;
    for (let z = ZONES.length - 1; z >= 0; z--) if (f >= ZONES[z]) { out[z]++; break; }
  }
  return out;
}
/** "Z2 18 · Z3 15 · Z4 4 min" — the zones with minutes in them. */
export const zoneWords = (mins: number[]) => mins.map((m, z) => (m ? `Z${z + 1} ${m}` : "")).filter(Boolean).join(" · ") + " min";
/** A workout's zones for the AI: "Z1 22 · Z2 18 min (of max 186 bpm)", or null with no max or no band minutes in it. */
export function zoneLine(hr: HrMinute[], start: number, end: number, max: number | null | undefined): string | null {
  if (!max) return null;
  const mins = zoneMinutes(hr, start, end, max);
  return mins.some(Boolean) ? `${zoneWords(mins)} (of max ${max} bpm)` : null;
}

