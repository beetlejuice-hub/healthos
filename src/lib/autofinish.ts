/**
 * A workout that finishes itself (PLAN 202; owner, 10 Nov: "Workout should be finished automatically, app should detect
 * when my heartrate started to come down like its p easy to spot, and if its just for a couple minutes it should ask if
 * its just a break or finished"). From the band's heart rate since the start:
 *
 *   working   heart rate at or above "working" — your resting rate plus 30 % of the way to your max (55 rest, 190 max:
 *             96) — on a 3-minute running mean, so one low minute between sets isn't the end
 *   pause     down since the last working minute for 5–15 minutes, with the band's data live (its newest reading under
 *             10 minutes old) and no rest timer running → ask: a break, or done?
 *   done      down for 15 minutes or more → finished at the last working minute
 *   unknown   no working minute yet (the band not worn, not synced), or a gap in the readings over the drop
 *
 * Asked once per drop: a "break" answer is kept as the drop's start, and only a new drop (a working minute after it)
 * asks again; after a "break", done waits 30 minutes instead of 15. Pure.
 */

import type { HrMinute } from "./band";

export const AUTOFIN = { reserve: 0.3, smoothMin: 3, pauseMin: 5, doneMin: 15, liveMin: 10, gapMin: 4 } as const;
const MIN = 60_000;

export type Ending =
  | { kind: "working"; threshold: number }
  | { kind: "pause"; since: number; threshold: number }
  | { kind: "done"; at: number; threshold: number }
  | { kind: "unknown"; why: "no-working" | "gap" | "no-data" };

/** The heart rate counted as working: resting plus a share of the way to max. */
export const workingHr = (rest: number, max: number) => Math.round(rest + AUTOFIN.reserve * (max - rest));

/** `gapSec`: how often the band sends a reading (status's typical gap) — a gap counts only past 2½ of those, 4 minutes at least. */
export function workoutEnding(hr: HrMinute[], o: { startedAt: number; now: number; rest: number; max: number; resting?: boolean; breakAt?: number | null; gapSec?: number | null }): Ending {
  const mins = hr.filter((m) => m[0] >= o.startedAt && m[0] <= o.now).sort((a, b) => a[0] - b[0]);
  if (!mins.length) return { kind: "unknown", why: "no-data" };
  const threshold = workingHr(o.rest, o.max);
  // a running mean of the last 3 minutes' readings (by time, not by count: a missing minute isn't averaged in)
  const smooth = mins.map((m, i) => {
    const w = mins.slice(0, i + 1).filter((x) => x[0] > m[0] - AUTOFIN.smoothMin * MIN);
    return [m[0], w.reduce((a, x) => a + x[1], 0) / w.length] as const;
  });
  const last = smooth.filter(([, v]) => v >= threshold).at(-1);
  if (!last) return { kind: "unknown", why: "no-working" };
  const after = mins.filter((m) => m[0] > last[0]), newest = mins.at(-1)![0];
  // the readings over the drop must be there, minute after minute: a band that stopped sending isn't a heart that slowed
  const stamps = [last[0], ...after.map((m) => m[0])];
  const gap = Math.max(AUTOFIN.gapMin * MIN, 2.5 * (o.gapSec ?? 0) * 1000);
  if (stamps.some((t, i) => i > 0 && t - stamps[i - 1] > gap)) return { kind: "unknown", why: "gap" };
  const down = (newest - last[0]) / MIN, at = last[0] + MIN, saidBreak = o.breakAt != null && o.breakAt >= last[0];
  // you said it's a break: twice as long before it counts as done
  if (down >= AUTOFIN.doneMin * (saidBreak ? 2 : 1)) return { kind: "done", at, threshold };
  const live = o.now - newest <= AUTOFIN.liveMin * MIN;
  if (down >= AUTOFIN.pauseMin && live && !o.resting && !saidBreak) return { kind: "pause", since: at, threshold };
  return { kind: "working", threshold };
}
