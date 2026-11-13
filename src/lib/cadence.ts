/**
 * Cardio fitness without typing, the band's side (PLAN 218; owner, 13 Nov: "seeing how my cardio and fitness changes on
 * steps, running" — and of typing a level after each session: "scrap this idea if thats the only way"). Shared by the
 * Worker (which keeps what comes out, past its 120 days of minutes) and the tests. Pure.
 *
 * - **Pairs**: each 5-minute step window with 40+ steps a minute, and the heart rate in those same 5 minutes. Steps a
 *   minute stand in for how hard you're going, so the heart rate can be compared at the same step rate over weeks.
 * - **Recovery**: how far the heart rate falls in the 2 minutes after a cardio effort ends (Cole 1999, NEJM: a slow
 *   drop goes with lower fitness). The end is where the heart rate came off the effort, not the end saved: he often
 *   forgets to stop the session (PLAN 216), and the heart-rate finish ends it after the drop.
 */

import type { HrMinute, StepBucket } from "./band";

const MIN = 60_000;
/** `spm`: the least steps a minute kept; `hrMin`: heart-rate minutes a window needs (of its 5). */
export const CAD = { spm: 40, win: 5, hrMin: 3 } as const;

/** [window start (ms), steps a minute, the average heart rate of the minutes inside it]. */
export type CadPair = [t: number, spm: number, bpm: number];

/** Every 5-minute step window with CAD.spm+ steps a minute and CAD.hrMin+ heart-rate minutes inside it, oldest first.
 * Hourly windows (Google's fallback) are left out: an hour of steps says nothing about a pace. */
export function cadencePairs(hr: HrMinute[], steps: StepBucket[]): CadPair[] {
  const mins = [...hr].sort((a, b) => a[0] - b[0]), out: CadPair[] = [];
  let i = 0;
  for (const [t, len, n] of [...steps].sort((a, b) => a[0] - b[0])) {
    if (len !== CAD.win) continue;
    const spm = n / len;
    if (spm < CAD.spm) continue;
    while (i < mins.length && mins[i][0] < t) i++;
    let j = i, sum = 0, k = 0;
    for (; j < mins.length && mins[j][0] < t + len * MIN; j++) { sum += mins[j][1]; k++; }
    if (k >= CAD.hrMin) out.push([t, Math.round(spm * 10) / 10, Math.round(sum / k)]);
  }
  return out;
}

/** Fold freshly worked-out windows into what's kept: a window worked out again replaces the old one. */
export function mergePairs(kept: CadPair[], fresh: CadPair[]): CadPair[] {
  const m = new Map(kept.map((p) => [p[0], p]));
  for (const p of fresh) m.set(p[0], p);
  return [...m.values()].sort((a, b) => a[0] - b[0]);
}

/**
 * `after`: minutes after the effort's end the heart rate is read; `slack`: minutes past the saved end the effort may
 * still run (a Stop tapped early); `share`: the effort is 90 % of the session's high heart rate (its 80th percentile)
 * or more; `floor`: below this high, it wasn't a cardio effort (or the band wasn't on); `least`: minutes of readings.
 */
export const HRR = { after: 2, slack: 10, share: 0.9, floor: 100, least: 5 } as const;

/** `at`: the last minute of the effort; `peak` its heart rate; `then` the heart rate HRR.after minutes later. */
export type Recovery = { at: number; peak: number; then: number; drop: number };

/**
 * The heart-rate drop after a cardio stretch saved as start–end. The effort's end: the last minute, up to HRR.slack
 * minutes past the saved end, at HRR.share of the session's high or more — so a walk over afterwards doesn't count as
 * the effort, and an end saved late (the heart-rate finish, the 3-hour cap) doesn't hide it; then the highest of that
 * minute and the 2 before it (the fall's first minute can still be over the bar). Null when the minutes
 * aren't there (both the minute after it and the one HRR.after minutes later must be), the session never got going,
 * or the effort ran into the end of the slack (still going: no end to read).
 */
export function recoveryOf(hr: HrMinute[], start: number, end: number): Recovery | null {
  const inside = hr.filter((m) => m[0] >= start && m[0] < end).map((m) => m[1]).sort((a, b) => a - b);
  if (inside.length < HRR.least) return null;
  const high = inside[Math.floor(0.8 * (inside.length - 1))];
  if (high < HRR.floor) return null;
  const bar = HRR.share * high, last = end + HRR.slack * MIN;
  const lastHigh = hr.filter((m) => m[0] >= start && m[0] < last && m[1] >= bar).reduce<HrMinute | null>((a, m) => (!a || m[0] > a[0] ? m : a), null);
  if (!lastHigh || lastHigh[0] >= last - HRR.after * MIN) return null;
  // the first minute of the fall can still be over the bar: the effort ends at the highest of the last 3 (the latest of equals)
  const at = hr.filter((m) => m[0] >= lastHigh[0] - 2 * MIN && m[0] <= lastHigh[0]).reduce((a, m) => (m[1] >= a[1] ? m : a));
  const by = new Map(hr.map((m) => [m[0], m[1]]));
  const next = by.get(at[0] + MIN), then = by.get(at[0] + HRR.after * MIN);
  if (next == null || then == null) return null;
  return { at: at[0], peak: at[1], then, drop: at[1] - then };
}
