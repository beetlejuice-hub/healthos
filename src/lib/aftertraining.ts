/**
 * Training page C · what training goes with afterwards (PLAN 64; board C, owner 13 Oct: "I like all of them" → "go").
 * Pure: sessions, nights, check-ins and heart-rate minutes in, numbers out.
 *
 *  - afterDays: one row per day that has the band's night after it — trained or a rest day, a heavy session or not, a
 *    session from 17:00 or not — with that night's sleep, the next morning's HRV and resting heart rate (filed on the
 *    night) and how you felt the next day. "Heavy" and "from 17:00" are known only on training days, so those rows set
 *    sessions against your other sessions, and "trained" sets training days against rest days.
 *  - heavyFlags: a session's kg lifted against the same template's last few sessions (your usual for that day).
 *  - trainingWeeks: kg lifted each week and the week's average energy — drawn as two charts, never one with two scales.
 *  - recovery: minutes until heart rate is back to usual after each session, each against your usual of the two weeks
 *    before it (so getting fitter doesn't move the bar it's measured against), and whether that's changing.
 * "Goes with", never "causes".
 */

import type { HrMinute } from "./band";
import { firstAt, type Factor, type Night, type Outcome } from "./sleep";
import { usualByHour, workoutWindows, type Span } from "./hrusual";
import { slopeTest, type Slope } from "./sessionfacts";
import { weekStart, type Session } from "./liftstrength";
import { addDays, DAY, HOUR, localDay, MIN, minuteOfDay } from "./time";
import type { Entry } from "./types";

/** Heavy = more kg lifted than the median of the same template's last HEAVY_PRIOR sessions; needs HEAVY_NEED of them. */
export const HEAVY_PRIOR = 6, HEAVY_NEED = 3;
/** "Trained from 17:00": a session starting at or after this hour. */
export const LATE_FROM_H = 17;

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

/** Per session (same order as given): heavier than your usual for that template, or null while there's no usual yet. */
export function heavyFlags(ss: Session[]): (boolean | null)[] {
  const out: (boolean | null)[] = ss.map(() => null), prior = new Map<string, number[]>();
  for (const i of ss.map((_, i) => i).sort((a, b) => ss[a].startedAt - ss[b].startedAt)) {
    const s = ss[i];
    if (s.workingSets === 0) continue;
    const key = s.template || "—", p = prior.get(key) ?? [];
    if (p.length >= HEAVY_NEED) out[i] = s.volume > median(p.slice(-HEAVY_PRIOR));
    p.push(s.volume); prior.set(key, p);
  }
  return out;
}

export type AfterDay = { day: string; trained: boolean; heavy: boolean | null; late: boolean; energy: number | null; mood: number | null };

/**
 * The days to test, each with the night after it (`ns[i]` goes with `days[i]`). From the day of your first logged
 * session: before it, a day without a session isn't known to be a rest day.
 */
export function afterDays(ss: Session[], ns: Night[], entries: Entry[]): { ns: Night[]; days: AfterDay[] } {
  if (!ss.length) return { ns: [], days: [] };
  const heavy = heavyFlags(ss), byDay = new Map<string, number[]>();
  ss.forEach((s, i) => { const d = localDay(s.startedAt), a = byDay.get(d); if (a) a.push(i); else byDay.set(d, [i]); });
  const feel = new Map<string, { energy: number[]; mood: number[] }>();
  for (const e of entries) {
    if (e.kind !== "feel") continue;
    const d = localDay(e.at), f = feel.get(d) ?? { energy: [], mood: [] };
    if (e.energy != null) f.energy.push(e.energy);
    if (e.mood != null) f.mood.push(e.mood);
    feel.set(d, f);
  }
  const first = localDay(Math.min(...ss.map((s) => s.startedAt)));
  const out = { ns: [] as Night[], days: [] as AfterDay[] };
  for (const n of [...ns].sort((a, b) => a.bed - b.bed)) {
    if (n.eve < first) continue;
    const mine = byDay.get(n.eve) ?? [], hs = mine.map((i) => heavy[i]), next = feel.get(addDays(n.eve, 1));
    out.ns.push(n);
    out.days.push({
      day: n.eve, trained: mine.length > 0,
      heavy: hs.some((h) => h === true) ? true : hs.some((h) => h === false) ? false : null,
      late: mine.some((i) => minuteOfDay(ss[i].startedAt) >= LATE_FROM_H * 60),
      energy: next ? mean(next.energy) : null, mood: next ? mean(next.mood) : null,
    });
  }
  return out;
}

export const AFTER_FACTORS: Factor<Night, AfterDay>[] = [
  { id: "trained", name: "Trained that day", has: (_, d) => d.trained },
  { id: "heavy", name: "Heavy session", has: (_, d) => d.heavy === true, known: (_, d) => d.heavy != null },
  { id: "late", name: `Trained from ${LATE_FROM_H}:00`, has: (_, d) => d.late, known: (_, d) => d.trained },
];
export const AFTER_OUTCOMES: Outcome<Night, AfterDay>[] = [
  { id: "asleep", name: "Asleep", unit: "min", better: 1, of: (n) => n.asleep },
  { id: "deep", name: "Deep", unit: "min", better: 1, of: (n) => n.deep },
  { id: "hrv", name: "HRV", unit: "ms", better: 1, of: (n) => n.hrv },
  { id: "rhr", name: "Resting HR", unit: "bpm", better: -1, of: (n) => n.rhr },
  { id: "energy", name: "Energy next day", unit: "/10", better: 1, of: (_, d) => d.energy },
  { id: "mood", name: "Mood next day", unit: "/10", better: 1, of: (_, d) => d.mood },
];

export type TrainingWeek = { from: number; kg: number; sessions: number; energy: number | null; checkins: number; partial: boolean };
/** Check-ins a week needs before its energy is drawn. */
export const WEEK_CHECKINS = 2;

/** Each Monday week from your first session's to this one: kg lifted (working sets), sessions, average energy. */
export function trainingWeeks(ss: Session[], entries: Entry[], now: number): TrainingWeek[] {
  if (!ss.length) return [];
  const last = weekStart(now), out: TrainingWeek[] = [];
  const feels = entries.filter((e): e is Extract<Entry, { kind: "feel" }> => e.kind === "feel" && e.energy != null);
  // the next Monday from the middle of the week: a clock change makes a week 167 or 169 hours
  for (let w = weekStart(Math.min(...ss.map((s) => s.startedAt))); w <= last; w = weekStart(w + 10 * DAY)) {
    const to = weekStart(w + 10 * DAY), mine = ss.filter((s) => s.startedAt >= w && s.startedAt < to && s.startedAt <= now);
    const en = feels.filter((e) => e.at >= w && e.at < to && e.at <= now).map((e) => e.energy!);
    out.push({ from: w, kg: mine.reduce((a, s) => a + s.volume, 0), sessions: mine.length, energy: en.length >= WEEK_CHECKINS ? mean(en) : null, checkins: en.length, partial: w === last });
  }
  return out;
}

/** Do weeks you lift more go with more or less energy? Whole weeks only; the slope is per 1,000 kg. */
export function weeksLink(ws: TrainingWeek[]): Slope {
  return slopeTest(ws.filter((w) => !w.partial && w.energy != null && w.sessions > 0).map((w) => [w.kg / 1000, w.energy!] as [number, number]), { min: 8, seed: 23 });
}

export type Recovery = { pts: { id: string; at: number; backMin: number }[]; notBack: number; slope: Slope; change: number | null };

/**
 * Minutes from the end of each session until heart rate is back to usual (lib/hrusual: within 3 bpm, five readings
 * running, within 2 h), each against the usual of the 14 days before that session. Sessions with no usual yet or no
 * heart rate after are left out; ones not back within 2 h while the band was on are counted in `notBack`. `change`: the line's change from
 * the first session to the last, in minutes (negative: coming back down faster).
 */
export function recovery(ss: Session[], hr: HrMinute[], spans: Span[]): Recovery {
  const pts: Recovery["pts"] = [];
  let notBack = 0;
  for (const s of ss) {
    const end = s.endedAt;
    if (end == null || end <= s.startedAt) continue;
    const before = hr.slice(firstAt(hr, s.startedAt - 15 * DAY), firstAt(hr, s.startedAt));
    const usual = usualByHour(before, spans, localDay(s.startedAt));
    const around = hr.slice(firstAt(hr, s.startedAt - HOUR), firstAt(hr, end + 2.5 * HOUR));
    const w = workoutWindows([{ start: s.startedAt, end }], around, usual)[0];
    if (w.vs !== "usual") continue;
    if (w.backMin != null) pts.push({ id: s.id, at: end, backMin: w.backMin });
    // not back only when the band was on for the 2 h after; taken off sooner, it's not known
    else if (around.some((m) => m[0] >= end + 110 * MIN)) notBack++;
  }
  const t0 = pts[0]?.at ?? 0, slope = slopeTest(pts.map((p) => [(p.at - t0) / DAY, p.backMin] as [number, number]), { min: 8, seed: 29 });
  return { pts, notBack, slope, change: slope.slope == null ? null : slope.slope * ((pts[pts.length - 1].at - t0) / DAY) };
}
