/**
 * Two things together (PLAN 209; owner, 11 Nov: "3, 4" — board N of the Insights canvas). Insights → Findings, after what
 * makes a day: pairs of things about the evening and night before, each splitting your days four ways — neither, one, the
 * other, both — and whether the days with both sit where the two would add up to, or clearly below (worse together) or
 * above (one softens the other). PLAN 211 (owner, 11 Nov: "visualize this, and use red green colors rn i dont
 * understand … add a couple outstanding items, good and very bad, and fixes"): each pair as red/green bars from a day
 * with neither, worst first; your worst pair (with the half that costs more, and a fix) and your best on top. Numbers
 * from lib/combos.
 */

import { useMemo, useState } from "react";
import { combos, FLAGS, standPairs, type Combo } from "../lib/combos";
import { OUTCOMES, type OutcomeKey } from "../lib/daytable";
import { useDayTable } from "./useDayTable";

const PICK: OutcomeKey[] = ["focus", "mood", "energy", "sleepRating"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const sg = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;

/**
 * One pair as three bars from a day with neither (owner, 11 Nov: "visualize this, and use red green colors"): only the
 * first, only the second, both — green a better day, red a worse one — and a tick where both would land if they just
 * added up.
 */
function PairBars({ c, span }: { c: Combo; span: number }) {
  const A = FLAGS[c.a], B = FLAGS[c.b], n0 = c.cells[0][0].m;
  const rows: [string, number, number][] = [[`only ${A.yes}`, c.cells[1][0].m - n0, c.cells[1][0].n], [`only ${B.yes}`, c.cells[0][1].m - n0, c.cells[0][1].n], ["both", c.cells[1][1].m - n0, c.cells[1][1].n]];
  const W = (v: number) => `${Math.min(50, (Math.abs(v) / span) * 50)}%`, add = c.add - n0;
  const reads = c.clear ? c.verdict : Math.abs(c.inter) < 0.3 ? "about the sum" : "about the sum — too few days to say more";
  return (
    <li className={`pb${c.clear ? (c.inter < 0 ? " worse" : " better") : ""}`} data-pair={`${c.a}:${c.b}`} data-verdict={c.verdict} data-q={c.q.toPrecision(2)}>
      <b className="pb-name">{cap(A.yes)} + {B.yes}</b>
      <div className="pb-bars">{rows.map(([label, v, n], i) => (
        <div key={label} className={`pb-row${i === 2 ? " both" : ""}`}>
          <span>{label} <small>{n} d</small></span>
          <span className="pb-track" aria-label={`${label}: ${sg(v)}`}><i className={v < 0 ? "bad" : "good"} style={v < 0 ? { right: "50%", width: W(v) } : { left: "50%", width: W(v) }} />
            {i === 2 && <em title={`if they just added up: ${sg(add)}`} style={{ left: `${50 + Math.max(-50, Math.min(50, (add / span) * 50))}%` }} />}</span>
          <b className={v < -0.05 ? "bad" : v > 0.05 ? "good" : ""}>{sg(v)}</b>
        </div>
      ))}</div>
      <span className="pb-reads">{reads}</span>
    </li>
  );
}

export function Combos({ now }: { now: number }) {
  const { rows } = useDayTable(now);
  const [k, setK] = useState<OutcomeKey>("focus");
  const cs = useMemo(() => combos(rows, k), [rows, k]);
  const stand = useMemo(() => (cs?.length ? standPairs(cs) : { worst: null, best: null }), [cs]);
  const [all, setAll] = useState(false);
  if (!cs || !cs.length) return null;
  const clear = cs.filter((c) => c.clear), name = OUTCOMES[k].name.toLowerCase();
  const d = (c: Combo) => c.cells[1][1].m - c.cells[0][0].m;
  // worst first; the clear ones above all
  const order = [...cs].sort((a, b) => +b.clear - +a.clear || d(a) - d(b));
  const span = Math.max(0.5, ...cs.flatMap((c) => [c.cells[1][0].m, c.cells[0][1].m, c.cells[1][1].m, c.add].map((v) => Math.abs(v - c.cells[0][0].m))));
  const shown = all ? order : order.slice(0, 5);
  return (
    <section className="p w12 cb" id="two-things" aria-label="Two things together" data-outcome={k} data-clear={clear.length}>
      <h2>Two things together <span>does one make the other worse?</span></h2>
      <p className="cb-what">Each pair splits your days by the evening and night before. The bars show your {name} against a day with <b>neither</b>: <b className="good">green</b> a better day, <b className="bad">red</b> a worse one. The tick on "both" is where it would land if the two just added up — far from it means they're worse (or better) together.</p>
      <div className="iseg" role="group" aria-label="Judge a day by">{PICK.map((o) => <button key={o} type="button" aria-pressed={o === k} onClick={() => setK(o)}>{OUTCOMES[o].name}</button>)}</div>
      {(stand.worst || stand.best) && <div className="cb-stand">
        {stand.worst && <div className="cb-st bad" data-pair={`${stand.worst.c.a}:${stand.worst.c.b}`}><small>Your worst pair</small><p>{stand.worst.say}</p>{stand.worst.fix && <p className="cb-fix"><b>Fix:</b> {stand.worst.fix}</p>}</div>}
        {stand.best && <div className="cb-st good" data-pair={`${stand.best.c.a}:${stand.best.c.b}`}><small>Your best pair</small><p>{stand.best.say}</p></div>}
      </div>}
      <p className="cb-say">{clear.length ? clear.slice(0, 2).map((c) => c.say).join(" ") : `No pair is clearly worse (or better) together than its two halves for ${name} yet — ${cs.length} checked.`}</p>
      <ul className="pb-list">{shown.map((c) => <PairBars key={`${c.a}:${c.b}`} c={c} span={span} />)}</ul>
      {order.length > 5 && <button type="button" className="linkish cb-more" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Fewer" : `See all ${order.length} pairs`}</button>}
      <p className="note-i">"Worse together" only when the days with both sit clearly below the tick — after allowing for how many pairs were looked at. Goes with, not causes.</p>
    </section>
  );
}
