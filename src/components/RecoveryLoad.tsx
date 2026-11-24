/**
 * Recovery and load (PLAN 227; owner, 24 Nov: "5"). On Training, first: HRV's 7-day average against its normal band
 * (30 days drawn), resting heart rate against its normal, this week's load (how hard × minutes) against your usual week,
 * and — when HRV has been under its band 3+ days with resting heart rate up or an unusual swing — "strain building", with
 * what goes with it this week (the load, drinks). Numbers from lib/strain; it never says what to do.
 */

import { useWidth } from "./useWidth";
import { useStrain } from "./useStrain";

const WHERE = { below: "under your normal", within: "within your normal", above: "over your normal" } as const;

export function RecoveryLoad({ now }: { now: number }) {
  const { s, load, strain, goes } = useStrain(now);
  const [ref, w0] = useWidth<HTMLDivElement>(), W = Math.max(260, Math.min(w0, 640)), H = 90;
  if (!s && !load.week && !load.usual) return <div ref={ref} />;
  const ds = s?.days ?? [], lo = Math.min(...ds.map((d) => Math.min(d.lo, d.avg))) * 0.95, hi = Math.max(...ds.map((d) => Math.max(d.hi, d.avg))) * 1.05;
  const X = (i: number) => 4 + (i / Math.max(1, ds.length - 1)) * (W - 8), Y = (v: number) => 6 + (1 - (v - lo) / (hi - lo)) * (H - 12);
  return (
    <section className="sl-p rl" ref={ref} aria-label="Recovery and load" data-hrv={s?.today.where} data-strain={strain ? "yes" : "no"}>
      <span className="cmp-k">Recovery and load</span>
      {strain && <p className="rl-strain"><b>Strain building.</b> HRV has been {WHERE.below} {s!.below} days{strain.rhrUp != null ? `, resting heart rate ${Math.round(strain.rhrUp)} bpm over its normal` : ""}{strain.swing ? ", swinging more day to day than in the last two months" : ""}.
        {goes.length ? ` Goes with: ${goes.join(", ")}.` : ""}</p>}
      {s && <div className="rl-hrv">
        <div className="rl-k"><small>HRV, 7-day average</small><b>{Math.round(s.today.avg)} ms</b><span>{WHERE[s.today.where]} ({Math.round(s.today.lo)}–{Math.round(s.today.hi)} ms){s.below > 1 ? ` · ${s.below} days` : ""}</span></div>
        {ds.length > 2 && <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`HRV's 7-day average over ${ds.length} days against its normal band`}>
          <polygon points={[...ds.map((d, i) => `${X(i)},${Y(d.hi)}`), ...ds.map((d, i) => `${X(i)},${Y(d.lo)}`).reverse()].join(" ")} className="rl-band" />
          <polyline points={ds.map((d, i) => `${X(i).toFixed(1)},${Y(d.avg).toFixed(1)}`).join(" ")} className="rl-line" />
          {ds.map((d, i) => d.where !== "within" && <circle key={d.day} cx={X(i)} cy={Y(d.avg)} r="2.6" className={`rl-dot ${d.where}`} />)}
        </svg>}
        {s.rhr && <div className="rl-k"><small>Resting heart rate, 7 days</small><b>{Math.round(s.rhr.now)} bpm</b><span>normal {Math.round(s.rhr.usual)}{Math.abs(s.rhr.now - s.rhr.usual) >= 1 ? ` · ${s.rhr.now > s.rhr.usual ? "+" : "−"}${Math.abs(Math.round(s.rhr.now - s.rhr.usual))}` : ""}</span></div>}
      </div>}
      <div className="rl-k rl-load" data-week={load.week}><small>This week's load</small><b>{load.week ? load.week.toLocaleString("en-GB") : "—"}</b>
        <span>{load.usual ? `your usual week ${Math.round(load.usual).toLocaleString("en-GB")}${load.week ? ` · ${load.week >= load.usual ? "+" : "−"}${Math.abs(Math.round((load.week / load.usual - 1) * 100))} %` : ""}` : "how hard (1–10) × minutes, from each workout's \"How hard?\" — your usual after 3 rated weeks"}{load.unrated ? ` · ${load.unrated} this week without "How hard?"` : ""}</span></div>
      <p className="note">Against your own last two months. A soft read, not a verdict: HRV-guided training wasn't better than a plan in studies, and load ratios don't predict injury.</p>
    </section>
  );
}
