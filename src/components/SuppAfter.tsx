/**
 * Insights → Training & stack: after a supplement (PLAN 63; owner, 9 Oct: "keep in mind at what time i log supplements,
 * can check whether it affects mental, or bpm changes"). Heart rate 30–90 minutes after each intake against the same
 * hours on days without it (lib/hrusual afterEach — intakes taken with coffee left out), and how you felt at check-ins
 * 1–4 hours after against check-ins at the same time of day without it (lib/suppafter). Goes with, never "it does".
 */

import { useMemo, useState } from "react";
import type { BandData } from "../lib/band";
import { afterEach } from "../lib/hrusual";
import type { Lanes } from "../lib/insights";
import { useStore } from "../lib/store";
import { feelAfter, FEEL_AFTER_MIN, type FeelKey } from "../lib/suppafter";
import { Aligned } from "./HeartEffects";
import { useWidth } from "./useWidth";

const KEYS: [FeelKey, string][] = [["mood", "Mood"], ["energy", "Energy"], ["stress", "Stress"], ["focus", "Focus"]];
const sgn = (v: number, d = 1) => { const t = Math.abs(v).toFixed(d); return Number(t) === 0 ? `±${t}` : `${v > 0 ? "+" : "−"}${t}`; };
/** Intakes before the heart-rate side says anything. */
const HR_MIN = 6;

export function SuppAfter({ band, data }: { band: BandData | null; data: Lanes }) {
  const entries = useStore((s) => s.entries), supps = useStore((s) => s.supplements);
  const taken = useMemo(() => supps.map((s) => ({ s, times: entries.flatMap((e) => (e.kind === "supp" && e.suppId === s.id && e.status === "taken" ? [e.at] : [])) })).filter((x) => x.times.length >= 3), [entries, supps]);
  const [pick, setPick] = useState<string | null>(null);
  const cur = taken.find((x) => x.s.id === pick) ?? taken[0];
  const caf = useMemo(() => data.doses.filter((d) => d.mg >= 40).map((d) => d.at), [data.doses]);
  const hr = useMemo(() => (cur && band?.hr.length ? afterEach(cur.times, band.hr, data.workouts, { avoid: caf, minN: HR_MIN }) : null), [cur, band, data.workouts, caf]);
  const feels = useMemo(() => (cur ? KEYS.map(([k]) => feelAfter(cur.times, data.checks, k)) : []), [cur, data.checks]);
  const [ref, w] = useWidth<HTMLDivElement>();
  if (!cur) return null;
  const name = cur.s.name;
  const hrWords = !band ? "Heart rate: connect the band." : !hr ? "Heart rate: no readings from the band yet."
    : hr.n === 0 ? `Heart rate: nothing to measure yet — it needs the band on around an intake, days without ${name} at that hour, and no coffee within 2 hours of it.`
      : hr.sure === "too few" || hr.effect == null ? `Heart rate: ${hr.n} intake${hr.n === 1 ? "" : "s"} measured — about ${HR_MIN} are needed before it says anything.`
        : hr.sure === "not clear" ? `Heart rate: no clear change — ${sgn(hr.effect)} bpm 30–90 min after, which chance alone could give.`
          : `Heart rate goes with ${sgn(hr.effect)} bpm 30–90 min after ${name}, against the same hours on days without it. How sure: ${hr.sure}.`;
  const sameTime = feels.length > 0 && feels.every((f) => f.nWith === 0) && cur.times.length >= 5;
  return (
    <section className="p" id="supp-after" ref={ref}>
      <h2>After a supplement <span>heart rate and how you felt, in the hours after</span></h2>
      <div className="iseg" role="group" aria-label="Supplement" style={{ flexWrap: "wrap" }}>
        {taken.map((x) => <button key={x.s.id} type="button" aria-pressed={x.s.id === cur.s.id} onClick={() => setPick(x.s.id)}>{x.s.name}</button>)}
      </div>
      {hr && hr.n > 0 && hr.curve.length > 1 && <Aligned width={Math.min(w - 4, 560)} height={170} x={[-30, 180]} y={[-6, 10]} each={hr.each} avg={hr.curve} color="var(--supp)"
        strip={hr.wobble || undefined} xTicks={[[-30, "−30"], [0, "taken"], [60, "60"], [120, "120"], [180, "180 min"]]} yTicks={[-5, 0, 5, 10]}
        label={`Heart rate after ${hr.n} intakes of ${name}, each lined up at the intake, against days without it`} />}
      <p className="he-words" data-sure={hr?.sure}>{hrWords}</p>
      <div className="tw"><table><tbody>
        <tr><th /><th className="n" title="check-ins 1–4 h after">after</th><th className="n" title="check-ins at the same time of day, without it">without</th><th className="n">diff</th></tr>
        {feels.map((f) => (
          <tr key={f.key} data-key={f.key} data-sure={f.sure}><td>{KEYS.find(([k]) => k === f.key)![1]}</td>
            <td className="n">{f.nWith}</td><td className="n">{f.nWithout}</td>
            <td className="n">{f.diff == null ? <span className="dimt">{FEEL_AFTER_MIN}+ each</span> : <>{sgn(f.diff)} <span className={`tag ${f.sure === "clear" || f.sure === "likely" ? "s" : "w"}`}>{f.sure}</span></>}</td></tr>
        ))}
      </tbody></table></div>
      <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>{sameTime
        ? `You take ${name} at the same time every day, so there's nothing to compare yet — the days you skip it, or take it at another time, are the comparison.`
        : "After: check-ins 1–4 hours after taking it. Without: check-ins at about the same time of day on days without it — so a supplement taken at noon isn't credited with your usual afternoon. Goes with, not proof of cause."}</p>
    </section>
  );
}
