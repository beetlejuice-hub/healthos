/**
 * Insights → Body lab: your body clock (PLAN 177, body lab 6; owner, 27 Oct: "yea"). A 24-hour dial — sleep, the night
 * low, the focus window, the afternoon slump — from your last 30 days, and the ping 15 minutes before the slump.
 * Numbers from lib/bodyclock; the ping is planned in lib/push/plan.
 */

import { useMemo } from "react";
import type { BandData } from "../lib/band";
import { bodyClock, clockOf, CLOCK, type Window } from "../lib/bodyclock";
import { isOn, syncPlan } from "../lib/push/client";
import { DEFAULT_NOTIFY } from "../lib/push/plan";
import { nights } from "../lib/sleep";
import { act, useStore } from "../lib/store";
import { localDay } from "../lib/time";

const COL = { sleep: "#9fa8f0", focus: "#a8dcc0", slump: "#f0b27a", low: "#ef7d6d" } as const;
const SURE = { clear: "clear", likely: "likely", "not clear": "could still be chance", "too few": "too few check-ins" } as const;
const R = 100, C = 145;
const pt = (min: number, r = R) => { const a = ((min % 1440) / 1440) * 2 * Math.PI - Math.PI / 2; return [C + r * Math.cos(a), C + r * Math.sin(a)] as const; };
/** An arc clockwise from minute a to minute b on the 24-hour dial. */
function arc(a: number, b: number) {
  const span = ((b - a) % 1440 + 1440) % 1440, [x1, y1] = pt(a), [x2, y2] = pt(a + span);
  return `M${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${span > 720 ? 1 : 0} 1 ${x2.toFixed(1)},${y2.toFixed(1)}`;
}
const hh = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;
const named = (w: Window | null): w is Window => !!w && (w.sure === "clear" || w.sure === "likely");

export function BodyClockCard({ band, now }: { band: BandData | null; now: number }) {
  const entries = useStore((s) => s.entries), prefs = useStore((s) => s.settings.notify ?? DEFAULT_NOTIFY);
  const today = localDay(now);
  const ns = useMemo(() => (band ? nights(band.sleep, band.hr, band.rhr, band.hrv).filter((n) => n.up <= now) : []), [band, now]);
  const c = useMemo(() => bodyClock(ns, entries, today), [ns, entries, today]);
  const checks = useMemo(() => entries.filter((e) => e.kind === "feel" && (e.energy != null || e.focus != null)).length, [entries]);
  if (!c.sleep && !c.focus && !c.slump && checks < 5) return null;
  const focus = named(c.focus) ? c.focus : null, slump = named(c.slump) ? c.slump : null;
  const setPing = (v: boolean) => { act.setSettings({ notify: { ...prefs, slump: v } }); void syncPlan(true).catch(() => {}); };
  const parts = [c.sleep && `sleep ${clockOf(c.sleep.onset)} to ${clockOf(c.sleep.wake)}`, c.low != null && `night low ${clockOf(c.low)}`, focus && `focus best ${hh(focus.from)}–${hh(focus.to)}`, slump && `slump ${hh(slump.from)}–${hh(slump.to)}`].filter(Boolean).join(", ");
  return (
    <section className="sl-p bl-card" aria-label="Your body clock" data-card="clock">
      <span className="cmp-k">Your body clock · last {CLOCK.days} days</span>
      <svg className="bc-dial" width="290" height="290" viewBox="0 0 290 290" role="img" aria-label={`24-hour clock: ${parts || "not enough yet"}`}>
        <circle cx={C} cy={C} r={R} fill="none" className="bc-track" strokeWidth="16" />
        {c.sleep && <path d={arc(c.sleep.onset, c.sleep.wake)} fill="none" stroke={COL.sleep} strokeWidth="16" />}
        {focus && <path d={arc(focus.from * 60, focus.to * 60)} fill="none" stroke={COL.focus} strokeWidth="16" />}
        {slump && <path d={arc(slump.from * 60, slump.to * 60)} fill="none" stroke={COL.slump} strokeWidth="16" />}
        {c.low != null && (() => { const [x, y] = pt(c.low); return <circle cx={x} cy={y} r="7" fill={COL.low} className="bc-low" strokeWidth="2.5" />; })()}
        {[["00", 0], ["06", 360], ["12", 720], ["18", 1080]].map(([t, m]) => { const [x, y] = pt(+m, R + 22); return <text key={t} x={x} y={y + 4} textAnchor="middle" className="bc-tick">{t}</text>; })}
        {c.sleep ? <>
          <text x={C} y={C - 4} textAnchor="middle" className="bc-mid">Sleep midpoint {clockOf(c.sleep.mid)}</text>
          {c.shift != null && Math.abs(c.shift) >= 20 && <text x={C} y={C + 18} textAnchor="middle" className="bc-sub">weekends {c.shift > 0 ? "+" : "−"}{Math.round(Math.abs(c.shift))} min</text>}
        </> : <text x={C} y={C + 4} textAnchor="middle" className="bc-sub">sleep: needs {CLOCK.minNights} nights from the band</text>}
      </svg>
      <div className="bc-legend">
        {c.sleep && <><i style={{ background: COL.sleep }} /><span>Sleep</span><span className="v">{clockOf(c.sleep.onset)}–{clockOf(c.sleep.wake)}</span></>}
        {c.low != null && <><i className="dot" style={{ background: COL.low }} /><span>Your night low (lowest heart rate)</span><span className="v">{clockOf(c.low)}</span></>}
        <i style={{ background: focus ? COL.focus : "transparent" }} className={focus ? undefined : "none"} />
        <span data-row="focus">{focus ? <>Focus window · {focus.mean.toFixed(1)} vs {focus.rest.toFixed(1)} <em>{SURE[focus.sure]}</em></> : <>Focus: no window stands out yet <em>{c.focus ? SURE[c.focus.sure] : `needs ${CLOCK.minChecks} check-ins with focus`}</em></>}</span>
        <span className="v">{focus ? `${hh(focus.from)}–${hh(focus.to)}` : ""}</span>
        <i style={{ background: slump ? COL.slump : "transparent" }} className={slump ? undefined : "none"} />
        <span data-row="slump">{slump ? <>Afternoon slump · energy {slump.mean.toFixed(1)} vs {slump.rest.toFixed(1)} <em>{SURE[slump.sure]}</em></> : <>Slump: no afternoon hour stands out yet <em>{c.slump ? SURE[c.slump.sure] : `needs ${CLOCK.minChecks} check-ins with energy`}</em></>}</span>
        <span className="v">{slump ? `${hh(slump.from)}–${hh(slump.to)}` : ""}</span>
      </div>
      {slump && <label className="bc-ping">
        <input type="checkbox" checked={!!prefs.slump} onChange={(e) => setPing(e.target.checked)} />
        <span><b>Ping me before the slump</b> · at {clockOf(slump.from * 60 - 15)}, 15 min early{prefs.slump && !isOn() ? <small> — notifications are off on this device: turn them on in <a href="#settings">Settings</a></small> : null}</span>
      </label>}
      <p className="bl-foot">Your own last {CLOCK.days} days: sleep and the night low from the band; focus and the slump from your check-ins, named only when shuffling the ratings rarely does as well. No "night owl" labels — those need population norms.</p>
    </section>
  );
}
