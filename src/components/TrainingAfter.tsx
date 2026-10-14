/**
 * Insights → Training, C · what training goes with afterwards (PLAN 64; board C, owner 13 Oct: "go"). The night after,
 * the next morning and the next day in the grid; each week's kg lifted next to how you felt (two charts on the same
 * weeks, never one with two scales); minutes until heart rate is back to your usual after each session. Numbers from
 * lib/aftertraining; this file only draws.
 */

import { useMemo, type ReactElement } from "react";
import { AFTER_FACTORS, AFTER_OUTCOMES, afterDays, recovery, trainingWeeks, WEEK_CHECKINS, weeksLink, type AfterDay, type Recovery, type TrainingWeek } from "../lib/aftertraining";
import type { HrMinute } from "../lib/band";
import type { Span } from "../lib/hrusual";
import type { Session } from "../lib/liftstrength";
import type { Slope } from "../lib/sessionfacts";
import type { Factor, Night, Outcome } from "../lib/sleep";
import { dayLabel } from "../lib/time";
import type { Entry } from "../lib/types";
import { GoesWith, type GridCopy } from "./Sleep";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const C_COPY: GridCopy = {
  title: "What training goes with afterwards", what: "days", minNights: 10,
  toward: "toward more or deeper sleep, higher HRV, a lower resting heart rate, a better next day",
  sub: "Each cell: days you trained against rest days; heavy sessions (more kg than that workout's last few times) and sessions from 17:00 against your other sessions — with the night after, the next morning and the next day. Filled: clear · faint: likely · empty: not clear yet. Goes with, not proof of cause.",
};

export function TrainingAfter({ ss, ns, entries, hr, spans, now, w, wide, band }: { ss: Session[]; ns: Night[]; entries: Entry[]; hr: HrMinute[]; spans: Span[]; now: number; w: number; wide: boolean; band: boolean }) {
  const after = useMemo(() => afterDays(ss, ns, entries), [ss, ns, entries]);
  const weeks = useMemo(() => trainingWeeks(ss, entries, now), [ss, entries, now]);
  const link = useMemo(() => weeksLink(weeks), [weeks]);
  const rec = useMemo(() => (band ? recovery(ss, hr, spans) : null), [band, ss, hr, spans]);
  // the grid component is the Sleep page's (same shuffle, same look); its row and column types are generic in lib/sleep
  const G = GoesWith as unknown as (p: { ns: Night[]; evs: AfterDay[]; wide: boolean; w: number; outcomes: Outcome<Night, AfterDay>[]; factors: Factor<Night, AfterDay>[]; narrow: Outcome<Night, AfterDay>[]; copy: GridCopy }) => ReactElement;
  const half = wide ? Math.floor((w - 12) / 2) : w;
  return (
    <div className="tp-c" data-sec="training" data-days={after.days.length}>
      {band && <G ns={after.ns} evs={after.days} wide={wide} w={w} outcomes={AFTER_OUTCOMES} factors={AFTER_FACTORS} narrow={AFTER_OUTCOMES} copy={C_COPY} />}
      <div className={`tp-row${wide ? " halves" : ""}`}>
        {weeks.length > 0 && <Weeks ws={weeks} link={link} w={half} />}
        {rec && <Back rec={rec} w={half} />}
      </div>
    </div>
  );
}

/** Each week: kg lifted (bars), and below it on the same weeks the average energy from check-ins (a line). */
function Weeks({ ws, link, w }: { ws: TrainingWeek[]; link: Slope; w: number }) {
  const cw = w - 30, L = 34, R = 8, top = 24, vH = 104, gap = 44, eH = 84, H = top + vH + gap + eH + 20;
  const step = (cw - L - R) / ws.length, bw = Math.max(3, Math.min(26, step - 4)), cx = (i: number) => L + (i + 0.5) * step;
  const kmax = Math.max(1000, ...ws.map((x) => x.kg)), top5 = Math.ceil(kmax / 5000) * 5000, VY = (v: number) => top + vH - (v / top5) * vH;
  const es = ws.flatMap((x) => (x.energy != null ? [x.energy] : []));
  const elo = es.length ? Math.max(0, Math.floor(Math.min(...es) - 0.3)) : 5, ehi = es.length ? Math.min(10, Math.ceil(Math.max(...es) + 0.3)) : 8;
  const e0 = top + vH + gap, EY = (v: number) => e0 + eH - ((v - elo) / Math.max(1, ehi - elo)) * eH;
  const full = ws.filter((x) => !x.partial && x.energy != null && x.sessions > 0).length;
  const words = link.sure === "too few" ? `Needs 8 whole weeks with sessions and ${WEEK_CHECKINS}+ check-ins to say how they go together — ${full} so far.`
    : link.sure === "not clear" ? `Weeks you lifted more haven't gone clearly with more or less energy — ${full} weeks so far.`
      : `Weeks you lifted more went with ${link.slope! > 0 ? "more" : "less"} energy (${link.sure}).`;
  // the energy line breaks over a week without enough check-ins
  const segs: [number, number][][] = [];
  ws.forEach((x, i) => { if (x.energy == null) { segs.push([]); return; } if (!segs.length) segs.push([]); segs[segs.length - 1].push([cx(i), EY(x.energy)]); });
  const last = ws[ws.length - 1];
  return (
    <section className="sl-p tp-weeks" aria-label="Each week: what you lifted, and how you felt">
      <span className="cmp-k">Each week · what you lifted, and how you felt</span>
      <svg width={cw} height={H} viewBox={`0 0 ${cw} ${H}`} role="img" aria-label={`${ws.length} weeks: kg lifted each week, and below it the week's average energy from your check-ins`}>
        <text x={L} y={12} className="tp-lname">kg lifted</text>
        <line x1={L} x2={cw - R} y1={top + vH} y2={top + vH} className="he-grid" />
        <text x={L - 5} y={VY(top5) + 4} textAnchor="end" className="hp-t">{top5 / 1000}k</text>
        <text x={L - 5} y={top + vH + 3} textAnchor="end" className="hp-t">0</text>
        {ws.map((x, i) => x.kg > 0 && (
          <rect key={x.from} data-week={x.from} data-kg={Math.round(x.kg)} x={cx(i) - bw / 2} y={VY(x.kg)} width={bw} height={top + vH - VY(x.kg)} rx="2" className={x.partial ? "kg so-far" : "kg"}>
            <title>{`Week of ${dayLabel(x.from)} · ${Math.round(x.kg).toLocaleString("en-GB")} kg · ${x.sessions} session${x.sessions === 1 ? "" : "s"}${x.partial ? " so far" : ""}`}</title>
          </rect>))}
        {last.partial && last.kg > 0 && <text x={cx(ws.length - 1)} y={VY(last.kg) - 5} textAnchor="middle" className="hp-t">so far</text>}
        <text x={L} y={e0 - 12} className="tp-lname">energy, average check-in</text>
        {[elo, (elo + ehi) / 2, ehi].map((v) => <g key={v}><line x1={L} x2={cw - R} y1={EY(v)} y2={EY(v)} className="he-grid" /><text x={L - 5} y={EY(v) + 3} textAnchor="end" className="hp-t">{Number.isInteger(v) ? v : v.toFixed(1)}</text></g>)}
        {segs.filter((s) => s.length > 1).map((s, k) => <polyline key={k} points={s.map((p) => p.join(",")).join(" ")} className="en-line" />)}
        {ws.map((x, i) => x.energy != null && (
          <circle key={x.from} cx={cx(i)} cy={EY(x.energy)} r={3.2} className={x.partial ? "en-dot so-far" : "en-dot"}>
            <title>{`Week of ${dayLabel(x.from)} · energy ${x.energy.toFixed(1)} from ${x.checkins} check-ins${x.partial ? " so far" : ""}`}</title>
          </circle>))}
        <text x={L} y={H - 4} className="hp-t">{MON[new Date(ws[0].from).getMonth()]}</text>
        <text x={cw - R} y={H - 4} textAnchor="end" className="hp-t">{MON[new Date(last.from).getMonth()]}</text>
      </svg>
      <p className="he-words" data-sure={link.sure}>{words}</p>
      <p className="sl-note">Two charts on the same weeks. Paler: this week so far. Energy needs {WEEK_CHECKINS} check-ins in a week.</p>
    </section>
  );
}

/** Minutes from the end of each session until heart rate is back in your usual band, and the line through them. */
function Back({ rec, w }: { rec: Recovery; w: number }) {
  const cw = w - 30, H = 190, L = 34, R = 10, T = 10, B = 24, ps = rec.pts;
  const n = ps.length, mean = n ? ps.reduce((a, p) => a + p.backMin, 0) / n : 0;
  const ymax = Math.max(30, Math.ceil(Math.max(0, ...ps.map((p) => p.backMin)) / 10) * 10);
  const t0 = ps[0]?.at ?? 0, t1 = ps[n - 1]?.at ?? 1, X = (t: number) => L + ((t - t0) / Math.max(1, t1 - t0)) * (cw - L - R), Y = (m: number) => T + (1 - m / ymax) * (H - T - B);
  // the least-squares line, through the middle of the dots (mean day, mean minutes)
  const s = rec.slope, day = (t: number) => (t - t0) / 86_400_000, mx = n ? ps.reduce((a, p) => a + day(p.at), 0) / n : 0;
  const line = s.slope != null && n > 1 ? [mean + s.slope * (0 - mx), mean + s.slope * (day(t1) - mx)] : null;
  const from = MON[new Date(t0).getMonth()], ch = rec.change;
  const words = n < 8 ? `Needs 8 sessions with the band on before and after — ${n} so far.`
    : (s.sure === "clear" || s.sure === "likely") && ch != null ? `About ${Math.max(1, Math.round(Math.abs(ch)))} min ${ch < 0 ? "faster" : "slower"} than in ${from} (${s.sure}) — minutes from the end of a session until your heart rate is back in your usual band.`
      : `No clear change yet: about ${Math.round(mean)} min after a session until your heart rate is back in your usual band, over ${n} sessions.`;
  return (
    <section className="sl-p tp-back" aria-label="Heart rate back to your usual after each session">
      <span className="cmp-k">Heart rate · back to your usual after each session</span>
      {n > 0 && (
        <svg width={cw} height={H} viewBox={`0 0 ${cw} ${H}`} role="img" aria-label={`${n} sessions: minutes until heart rate was back in your usual band`}>
          {[0, ymax / 2, ymax].map((m) => <g key={m}><line x1={L} x2={cw - R} y1={Y(m)} y2={Y(m)} className="he-grid" /><text x={L - 5} y={Y(m) + 3} textAnchor="end" className="hp-t">{m}m</text></g>)}
          {line && <line x1={X(t0)} x2={X(t1)} y1={Y(line[0])} y2={Y(line[1])} stroke="var(--i-ink)" strokeDasharray="5 4" strokeWidth="1.3" />}
          {ps.map((p) => <circle key={p.id} data-id={p.id} data-back={p.backMin} cx={X(p.at)} cy={Y(Math.min(ymax, p.backMin))} r={3.4} className="back-dot"><title>{`${dayLabel(p.at)} · back to usual ${p.backMin} min after`}</title></circle>)}
          <text x={L} y={H - 6} className="hp-t">{from}</text>
          <text x={cw - R} y={H - 6} textAnchor="end" className="hp-t">{MON[new Date(t1).getMonth()]}</text>
        </svg>
      )}
      <p className="he-words" data-sure={n < 8 ? "too few" : s.sure}>{words}</p>
      <p className="sl-note">Back = within 3 bpm of your usual for that time of day, five readings running, within 2 h. Each session against your usual of the two weeks before it.{rec.notBack > 0 ? ` ${rec.notBack} session${rec.notBack === 1 ? " wasn't" : "s weren't"} back within 2 h and ${rec.notBack === 1 ? "is" : "are"} left out.` : ""}</p>
    </section>
  );
}
