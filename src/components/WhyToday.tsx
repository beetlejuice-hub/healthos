/**
 * Why today (PLAN 208; owner, 11 Nov: "yea lets do this 4" — I of the Insights canvas). On Today: from your usual focus
 * (or mood, energy), each thing about last night and yesterday pushing what days like this tend to be up or down — bars
 * from your usual — then what you've rated, and what nothing logged explains; the last 7 days, expected against rated.
 * Numbers from lib/whytoday; this file only draws.
 */

import { useMemo, useState } from "react";
import { FACTORS, OUTCOMES, type OutcomeKey } from "../lib/daytable";
import { whyToday } from "../lib/whytoday";
import { useDayTable } from "./useDayTable";

const PICK: OutcomeKey[] = ["focus", "mood", "energy"];
const sgn = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(1)}`;

export function WhyToday({ now }: { now: number }) {
  const { rows, today } = useDayTable(now);
  const [k, setK] = useState<OutcomeKey>("focus");
  const y = useMemo(() => whyToday(rows, k, today), [rows, k, today]);
  if (!y || !y.pushes.length) return null;
  const name = OUTCOMES[k].name.toLowerCase();
  // the bars on one scale: from the lowest to the highest point the running total reaches, your rating too
  const steps = y.pushes.map((p, i) => { const from = y.usual + y.pushes.slice(0, i).reduce((a, q) => a + q.pts, 0); return { ...p, from, to: from + p.pts }; });
  const pts = [y.usual, y.expected, ...steps.map((s) => s.to), ...(y.rated != null ? [y.rated] : [])];
  const lo = Math.floor(Math.min(...pts) - 0.3), hi = Math.ceil(Math.max(...pts) + 0.3), X = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const up = y.pushes.filter((p) => p.pts > 0), down = y.pushes.filter((p) => p.pts < 0);
  const sentence = `${up.length ? `${up.slice(0, 2).map((p) => p.say).join(" and ")} pushed it up` : "Nothing pushed it up"}${down.length ? `; ${down.slice(0, 2).map((p) => p.say).join(" and ")} pulled it down` : ""}.`;
  return (
    <section className="card why" aria-label="Why today" data-outcome={k} data-expected={y.expected}>
      <h3>Why today <span>what days like this tend to be, from your own {y.n}</span></h3>
      <div className="why-pick" role="group" aria-label="Which">{PICK.map((o) => <button key={o} type="button" aria-pressed={o === k} onClick={() => setK(o)}>{OUTCOMES[o].name}</button>)}</div>
      <p className="why-say">{sentence.charAt(0).toUpperCase() + sentence.slice(1)}</p>
      <ul className="why-bars">
        <li><span>Your usual {name}</span><span className="why-track"><i className="base" style={{ left: 0, width: `${X(y.usual)}%` }} /></span><b>{y.usual.toFixed(1)}</b></li>
        {steps.map((s) => (
          <li key={s.key} data-key={s.key}><span>{s.say}<small>{FACTORS[s.key].when}</small></span>
            <span className="why-track"><i className={s.pts > 0 ? "up" : "down"} style={{ left: `${X(Math.min(s.from, s.to))}%`, width: `${Math.max(1.5, Math.abs(X(s.to) - X(s.from)))}%` }} /></span><b className={s.pts > 0 ? "up" : "down"}>{sgn(s.pts)}</b></li>
        ))}
        <li className="why-total"><span>Days like this</span><span className="why-track"><i className="base" style={{ left: 0, width: `${X(y.expected)}%` }} />{y.rated != null && <em style={{ left: `${X(y.rated)}%` }} title={`you rated ${y.rated.toFixed(1)}`} />}</span><b>{y.expected.toFixed(1)}</b></li>
      </ul>
      <p className="note">{y.rated != null ? `You rated ${y.rated.toFixed(1)} — ${Math.abs(y.rated - y.expected) < 0.3 ? "about what days like this are" : `${sgn(y.rated - y.expected)} that nothing logged explains`}.` : `No ${name} rated today yet — this is what days like it have been.`} Goes with, not causes.</p>
      {y.week.length > 2 && <div className="why-week" role="img" aria-label="The last days, expected and rated">
        {y.week.map((d) => <span key={d.day} title={`${d.day}: expected ${d.expected}${d.rated != null ? `, rated ${d.rated.toFixed(1)}` : ""}`}>
          <small>{new Date(`${d.day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "narrow" })}</small>
          <i style={{ bottom: `${(d.expected / 10) * 100}%` }} className="exp" />{d.rated != null && <i style={{ bottom: `${(d.rated / 10) * 100}%` }} className={d.rated >= d.expected ? "rated up" : "rated down"} />}
        </span>)}
        <small className="why-key">○ expected · ● rated</small>
      </div>}
    </section>
  );
}
