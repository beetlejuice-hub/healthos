/**
 * Zone-2 minutes a week (owner, 14 Nov, item 8 of the open list; his reason for cardio, 20 Oct: "Cardio is important for my
 * weight loss"). Every minute of the band's heart rate in zone 2 — 60–70 % of your max (lib/cardio's zones) — in or out of
 * a workout, a week at a time, against a quiet aim of 150: the WHO's 150 minutes a week of moderate activity, of which
 * zone 2 is the easy end. A week the band was off for much of isn't read as a week of no zone 2: it says how much of the
 * week the band saw. Pure.
 */

import type { HrMinute } from "./band";
import { ZONES } from "./cardio";
import { weekStart } from "./liftstrength";

export const ZONE2 = { aim: 150, weeks: 8, lo: ZONES[1], hi: ZONES[2], seenWell: 0.6 } as const;
export type Zone2Week = { week: number; min: number; /** share of the week's minutes the band had a reading for (to now, this week) */ seen: number };

/** The last `weeks` weeks (this one so far last): zone-2 minutes and how much of each week the band saw. */
export function zone2Weeks(hr: HrMinute[], max: number, now: number, weeks: number = ZONE2.weeks): Zone2Week[] {
  const starts = [weekStart(now)];
  while (starts.length < weeks) starts.push(weekStart(starts[starts.length - 1] - 1));
  starts.reverse();
  const out = starts.map((week) => ({ week, min: 0, readings: 0 }));
  const lo = ZONE2.lo * max, hi = ZONE2.hi * max;
  for (const [t, avg] of hr) {
    if (t > now || t < starts[0]) continue;
    let k = out.length - 1; while (k > 0 && t < out[k].week) k--;
    out[k].readings++;
    if (avg >= lo && avg < hi) out[k].min++;
  }
  return out.map((w, k) => {
    const end = k + 1 < out.length ? out[k + 1].week : now, span = Math.max(1, (end - w.week) / 60_000);
    return { week: w.week, min: w.min, seen: Math.min(1, w.readings / span) };
  });
}

/** "96 of a 150 aim this week · usual 120" — the usual being the weeks before that the band saw well; null with none. */
export function zone2Line(ws: Zone2Week[]): { now: number; usual: number | null; seenWell: boolean } {
  const cur = ws[ws.length - 1], before = ws.slice(0, -1).filter((w) => w.seen >= ZONE2.seenWell);
  return { now: cur.min, usual: before.length >= 2 ? Math.round(before.reduce((a, w) => a + w.min, 0) / before.length) : null, seenWell: cur.seen >= ZONE2.seenWell };
}
