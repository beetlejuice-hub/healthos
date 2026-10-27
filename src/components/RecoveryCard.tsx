/**
 * Today, the morning after a night out (PLAN 177, body lab 8; owner, 27 Oct: "YES"): what last night did against your
 * usual nights, when you're likely back to usual — from how long your own past nights out took — what got you back
 * faster, and how your lifts went the day after. Until 20:00; nothing on other days. Numbers from lib/recovery.
 */

import { useEffect, useMemo } from "react";
import { loadBandBefore, useBand } from "../lib/band-client";
import type { HrMinute } from "../lib/band";
import { sessions } from "../lib/liftstrength";
import { isNightOut, recoveryInputs, recoveryNow, usualNights, type Recovery } from "../lib/recovery";
import { clockH, firstAt, nights, usualNightHr, type Night } from "../lib/sleep";
import { useStore } from "../lib/store";
import { addDays, clock, DAY, HOUR, localDay } from "../lib/time";
import type { LoggedSet } from "../lib/training";
import type { EntryOf } from "../lib/types";
import { useWidth } from "./useWidth";

/** Past nights out are looked for this far back (the server keeps 120 days). */
const BACK_DAYS = 90;
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "tomorrow ~07:30": to the half hour. */
function when(t: number, now: number): string {
  const r = Math.round(t / (30 * 60_000)) * 30 * 60_000, d = localDay(r), today = localDay(now);
  return `${d === today ? "today" : d === addDays(today, 1) ? "tomorrow" : WD[new Date(r).getDay()]} ~${clock(r)}`;
}

export function RecoveryCard({ now }: { now: number }) {
  const band = useBand().data;
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts);
  const today = localDay(now), evening = new Date(now).getHours() >= 20;
  const ns = useMemo(() => (band ? nights(band.sleep, band.hr, band.rhr, band.hrv).filter((n) => n.up <= now && n.up >= now - BACK_DAYS * DAY) : []), [band, now]);
  // most mornings weren't after a night out: look at last night alone first, the rest only when it was
  const outLast = useMemo(() => {
    const last = ns.reduce<Night | null>((a, n) => (!a || n.bed > a.bed ? n : a), null);
    if (!last || last.day !== today || evening) return false;
    return isNightOut(last, recoveryInputs([last], entries, [], []).evenings.get(last.eve), usualNights(ns, new Set()).bedH);
  }, [ns, entries, today, evening]);
  const inputs = useMemo(() => (band && outLast ? recoveryInputs(ns, entries, band.steps ?? [], band.hr) : null), [band, outLast, ns, entries]);
  const ss = useMemo(() => {
    const sets = entries.filter((e): e is EntryOf<"set"> => e.kind === "set") as LoggedSet[];
    return sessions(workouts, sets).map((s) => ({ day: localDay(s.startedAt), pct: s.pct }));
  }, [entries, workouts]);
  const r = useMemo(() => (inputs ? recoveryNow(ns, inputs.evenings, inputs.after, ss, today, now) : null), [inputs, ns, ss, today, now]);
  // a night out: your past ones are needed, not just the band's usual week
  useEffect(() => { if (r) void loadBandBefore(now - BACK_DAYS * DAY); }, [r != null, band]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r || !band) return null;
  return <Card r={r} ns={ns} hr={band.hr} now={now} />;
}

function Card({ r, ns, hr, now }: { r: Recovery; ns: Night[]; hr: HrMinute[]; now: number }) {
  const h = r.hit, pct = r.done != null ? Math.round(r.done * 100) : null, left = r.backAt != null ? Math.round((r.backAt - now) / HOUR) : null;
  // one row of up to three, never two and an orphan; four as two rows of two
  const tiles = [h.hrv != null, h.deep != null, r.drinks > 0, (r.cigs ?? 0) > 0].filter(Boolean).length;
  return (
    <section className="card rc" aria-label="After last night" data-done={pct ?? ""} data-shrugged={r.shrugged || undefined}>
      <h3>After last night <span>bed {clock(r.night.bed)}</span></h3>
      {r.shrugged ? (
        <p className="rc-lead"><b>Back already.</b> Last night didn't push your HRV or resting heart rate out of your usual range this morning.</p>
      ) : r.backAt != null && r.backAt <= now ? (
        <p className="rc-lead">Your past nights out were usually back to usual by {when(r.backAt, now).replace(/^today /, "")} — <b>this one isn't yet</b>: HRV or resting heart rate still off this morning.</p>
      ) : r.backAt != null && pct != null ? (
        <div className="rc-top">
          <svg className="rc-ring" width="112" height="112" viewBox="0 0 112 112" role="img" aria-label={`${pct}% of the way back`}>
            <circle cx="56" cy="56" r="47" fill="none" stroke="var(--c-track)" strokeWidth="10" />
            <circle cx="56" cy="56" r="47" fill="none" stroke="var(--ok)" strokeWidth="10" strokeLinecap="round" transform="rotate(-90 56 56)" strokeDasharray={`${(r.done! * 295.3).toFixed(1)} 296`} />
            <text x="56" y="58" textAnchor="middle" className="rc-pct">{pct}%</text>
            <text x="56" y="76" textAnchor="middle" className="rc-pct-k">of the way back</text>
          </svg>
          <div className="rc-when">
            <span>Back to your usual</span>
            <b>{when(r.backAt, now)}</b>
            <span className="rc-in">{left! > 0 ? `in about ${left} h` : "within the hour"}</span>
            <small>typical for you, from {r.past} past nights out</small>
          </div>
        </div>
      ) : (
        <p className="rc-lead">When you're back to usual: needs 2 past nights out with the band to say{r.past ? ` — ${r.past} so far` : ""}.</p>
      )}
      <NightHr r={r} ns={ns} hr={hr} />
      <div className="rc-tiles" style={{ gridTemplateColumns: `repeat(${tiles > 3 ? 2 : Math.max(1, tiles)}, minmax(0, 1fr))` }}>
        {h.hrv != null && <div><span>HRV</span><b>{h.hrv}<small> ms</small></b>{h.hrvUsual != null && <small>usual {h.hrvUsual}</small>}</div>}
        {h.deep != null && <div><span>Deep sleep</span><b>{h.deep}<small> min</small></b>{h.deepUsual != null && <small>usual {h.deepUsual}</small>}</div>}
        {r.drinks > 0 && <div><span>Drinks</span><b>{r.drinks}</b><small>logged</small></div>}
        {r.cigs != null && r.cigs > 0 && <div><span>Cigarettes</span><b>{r.cigs === 1.5 ? "1–2" : r.cigs === 4 ? "3–5" : "6+"}</b><small>you said</small></div>}
      </div>
      {r.factors.length > 0 && (
        <div className="rc-faster">
          <span className="k">Got you back faster — your own nights out</span>
          {r.factors.map((f) => <p key={f.id} data-factor={f.id}><b>{f.name}</b><span>~{f.gainH} h sooner · {f.with} with, {f.without} without</span></p>)}
        </div>
      )}
      {r.lifts && (
        <p className="rc-lifts" data-pct={r.lifts.pct}><b>Lifting the day after:</b> {r.lifts.pct < 0 ? `your lifts ran ${-r.lifts.pct}% lighter` : r.lifts.pct > 0 ? `your lifts ran ${r.lifts.pct}% stronger` : "your lifts ran the same"} than your other sessions ({r.lifts.n} sessions).</p>
      )}
      <p className="rc-note">Back to usual: HRV and resting heart rate where 8 in 10 of your ordinary mornings are. Only your own nights out — goes with, not proof of cause.</p>
    </section>
  );
}

/** Last night's sleeping heart rate (10-minute averages) against your usual nights' middle half at the same clock time. */
function NightHr({ r, ns, hr }: { r: Recovery; ns: Night[]; hr: HrMinute[] }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const n = r.night;
  // a 3-slot rolling median: one odd ten minutes (the minute of waking) doesn't spike the band; a real rise still shows
  const band = useMemo(() => {
    const out = new Set(r.out), b = usualNightHr(ns.filter((x) => !out.has(x.id)), hr), m3 = (v: number[]) => [...v].sort((x, y) => x - y)[1];
    // at the ends the three nearest (the window shifted in), or the first and last slots would keep their spike
    return b.length < 3 ? b : b.map((x, i) => { const j = Math.min(b.length - 2, Math.max(1, i)), w = [b[j - 1], b[j], b[j + 1]]; return { h: x.h, lo: m3(w.map((y) => y.lo)), mid: m3(w.map((y) => y.mid)), hi: m3(w.map((y) => y.hi)) }; });
  }, [r.out, ns, hr]);
  const line = useMemo(() => {
    const b = new Map<number, number[]>();
    for (let j = firstAt(hr, n.onset); j < hr.length && hr[j][0] <= n.wake; j++) { const k = Math.round(clockH(hr[j][0], n.eve) * 6); (b.get(k) ?? b.set(k, []).get(k)!).push(hr[j][1]); }
    return [...b].sort((x, y) => x[0] - y[0]).map(([k, v]) => ({ h: k / 6, v: v.reduce((a, x) => a + x, 0) / v.length }));
  }, [hr, n]);
  if (line.length < 6 || band.length < 6) return <div ref={ref} />;
  const x0 = Math.min(line[0].h, band[0].h), x1 = Math.max(line.at(-1)!.h, band.at(-1)!.h);
  const vs = [...line.map((p) => p.v), ...band.flatMap((b) => [b.lo, b.hi])], y0 = Math.floor(Math.min(...vs) - 2), y1 = Math.ceil(Math.max(...vs) + 2);
  const H = 84, top = 18, bot = 16, X = (hh: number) => ((hh - x0) / Math.max(0.5, x1 - x0)) * (w - 2) + 1, Y = (v: number) => top + (1 - (v - y0) / (y1 - y0)) * (H - top - bot);
  const area = [...band.map((b) => `${X(b.h).toFixed(1)},${Y(b.hi).toFixed(1)}`), ...[...band].reverse().map((b) => `${X(b.h).toFixed(1)},${Y(b.lo).toFixed(1)}`)].join(" ");
  const ticks = [x0, (x0 + x1) / 2, x1].map((hh) => { const m = Math.round(((hh % 24) * 60) / 30) * 30; return { hh, t: `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}` }; });
  const d = r.hit.meanHr;
  return (
    <div ref={ref} className="rc-hr">
      <span className="k">Your heart asleep last night, against your usual nights</span>
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={`Sleeping heart rate last night${d != null ? `, ${d >= 0 ? "+" : "−"}${Math.abs(d)} bpm on average against your usual` : ""}; the grey band is the middle half of your usual nights`}>
        <polygon points={area} className="rc-band" />
        <polyline points={line.map((p) => `${X(p.h).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ")} fill="none" stroke="var(--hr)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {d != null && <text x="1" y="11" className="rc-hr-d">{d >= 0 ? "+" : "−"}{Math.abs(d)} bpm on average</text>}
        {ticks.map((t, i) => <text key={i} x={X(t.hh)} y={H - 3} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} className="rc-tick">{t.t}</text>)}
      </svg>
      <span className="rc-legend"><i className="ln" /> last night <i className="bd" /> your usual nights</span>
    </div>
  );
}
