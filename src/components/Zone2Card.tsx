/**
 * Zone 2 on Training (owner, 14 Nov, item 8: zone-2 minutes a week). This week's minutes at 60–70 % of your max against a
 * quiet 150 aim and your usual, and 8 weeks as bars with the aim as a line; a week the band saw little of is drawn faint
 * and says so. Without a max heart rate (age or your own number in Settings) it says what it needs. Numbers from lib/zone2.
 */

import { useMemo } from "react";
import { maxHrOf } from "../lib/cardio";
import type { HrMinute } from "../lib/band";
import { useStore } from "../lib/store";
import { dayLabel } from "../lib/time";
import { ZONE2, zone2Line, zone2Weeks } from "../lib/zone2";

export function Zone2Card({ now, hr, w }: { now: number; hr: HrMinute[]; w: number }) {
  const settings = useStore((s) => s.settings), max = maxHrOf(settings);
  const ws = useMemo(() => (max && hr.length ? zone2Weeks(hr, max.bpm, now) : null), [hr, max?.bpm, now]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!hr.length) return null;
  if (!max) return (
    <section className="sl-p z2" aria-label="Zone 2">
      <span className="cmp-k">Zone 2 · a week</span>
      <p className="sl-note">Needs your max heart rate for the zones: add your age (or your own max) in Settings → Sleep and body.</p>
    </section>
  );
  const l = zone2Line(ws!), H = 96, x0 = 4, x1 = Math.max(240, w - 30) - 30, y0 = 8, y1 = H - 18, top = Math.max(ZONE2.aim * 1.25, ...ws!.map((x) => x.min)) * 1.05;
  const bw = (x1 - x0) / ws!.length, Y = (v: number) => y1 - (v / top) * (y1 - y0), cw = x1 + 30;
  return (
    <section className="sl-p z2" aria-label="Zone 2" data-now={l.now}>
      <span className="cmp-k">Zone 2 · a week</span>
      <div className="os-head"><b className="os-big">{l.now} min</b><span className="s">this week of a {ZONE2.aim} aim{l.usual != null ? ` · usual ${l.usual}` : ""}{l.seenWell ? "" : " · the band saw little of it so far"}</span></div>
      <svg width={cw} height={H} viewBox={`0 0 ${cw} ${H}`} role="img" aria-label={`Zone-2 minutes each week for ${ws!.length} weeks, the ${ZONE2.aim} aim as a line`}>
        <line x1={x0} x2={x1} y1={Y(ZONE2.aim)} y2={Y(ZONE2.aim)} className="z2-aim" />
        <text x={x1 + 4} y={Y(ZONE2.aim) + 3} className="hp-t">{ZONE2.aim}</text>
        {ws!.map((x, i) => <rect key={x.week} x={x0 + i * bw + 3} y={Y(x.min)} width={bw - 6} height={Math.max(1, y1 - Y(x.min))} rx="2" className={`z2-bar${x.seen < ZONE2.seenWell ? " faint" : ""}${i === ws!.length - 1 ? " now" : ""}`}><title>{`${dayLabel(x.week)}: ${x.min} min${x.seen < ZONE2.seenWell ? ` (the band saw ${Math.round(x.seen * 100)} % of it)` : ""}`}</title></rect>)}
        <text x={x0} y={H - 4} className="hp-t">{dayLabel(ws![0].week).replace(/^\w+ /, "")}</text>
        <text x={x1} y={H - 4} textAnchor="end" className="hp-t">this week</text>
      </svg>
      <p className="sl-note">Minutes at {Math.round(ZONE2.lo * 100)}–{Math.round(ZONE2.hi * 100)} % of your max ({Math.round(ZONE2.lo * max.bpm)}–{Math.round(ZONE2.hi * max.bpm)} bpm, max {max.bpm}{max.from === "age" ? " from your age" : ""}), in a workout or not — brisk walks count. 150 a week of moderate activity is the WHO's aim; zone 2 is its easy end. Faint bars: weeks the band saw little of.</p>
    </section>
  );
}
