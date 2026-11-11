/**
 * Two things together (PLAN 209; owner, 11 Nov: "3, 4" — board N of the Insights canvas). Insights → Findings, after what
 * makes a day: pairs of things about the evening and night before, each splitting your days four ways — neither, one, the
 * other, both — and whether the days with both sit where the two would add up to, or clearly below (worse together) or
 * above (one softens the other). The clear ones as 2×2 squares; the rest in one line. Numbers from lib/combos.
 */

import { useMemo, useState } from "react";
import { combos, FLAGS, type Combo } from "../lib/combos";
import { OUTCOMES, type OutcomeKey } from "../lib/daytable";
import { useDayTable } from "./useDayTable";

const PICK: OutcomeKey[] = ["focus", "mood", "energy", "sleepRating"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Pair({ c, lo, hi }: { c: Combo; lo: number; hi: number }) {
  const A = FLAGS[c.a], B = FLAGS[c.b], W = (v: number) => `${Math.max(2, Math.min(100, ((v - lo) / (hi - lo || 1)) * 100))}%`;
  // the square's tone: how it sits against neither (mint above, amber below)
  const tone = (v: number) => { const d = (v - c.cells[0][0].m) / (hi - lo || 1); return d > 0.04 ? "up" : d < -0.04 ? (d < -0.2 ? "down2" : "down") : "same"; };
  const sq = (i: 0 | 1, j: 0 | 1) => <div className={`cb-sq ${tone(c.cells[i][j].m)}${i && j ? " both" : ""}`}><b>{c.cells[i][j].m.toFixed(1)}</b><small>{c.cells[i][j].n} days{i && j ? " · both" : ""}</small></div>;
  const bad = c.verdict === "worse together" || c.verdict === "one takes the edge off the other's good";
  return (
    <article className={`cb-p${c.clear ? (bad ? " worse" : " better") : ""}`} data-pair={`${c.a}:${c.b}`} data-verdict={c.verdict} data-q={c.q.toPrecision(2)}>
      <header><b>{cap(A.yes)} × {B.yes}</b><span>{c.verdict}</span></header>
      <div className="cb-grid">
        <span /><small>{B.no}</small><small>{B.yes}</small>
        <small>{A.no}</small>{sq(0, 0)}{sq(0, 1)}
        <small>{A.yes}</small>{sq(1, 0)}{sq(1, 1)}
      </div>
      <div className="cb-bars">
        <span>If they just added up</span><span className="cb-t"><i className="add" style={{ width: W(c.add) }} /></span><b>{c.add.toFixed(1)}</b>
        <span>Days with both</span><span className="cb-t"><i className="both" style={{ width: W(c.both) }} /></span><b>{c.both.toFixed(1)}</b>
      </div>
      <p>{c.say}</p>
    </article>
  );
}

/** Not clear: a row of the compact table — the four averages and how many days had both. */
function Row({ c }: { c: Combo }) {
  const A = FLAGS[c.a], B = FLAGS[c.b];
  return (
    <tr data-pair={`${c.a}:${c.b}`} data-verdict={c.verdict}>
      <th scope="row">{cap(A.yes)} + {B.yes}</th>
      <td>{c.cells[0][0].m.toFixed(1)}</td><td>{c.cells[1][0].m.toFixed(1)}</td><td>{c.cells[0][1].m.toFixed(1)}</td>
      <td>{c.cells[1][1].m.toFixed(1)} <small>{c.cells[1][1].n} d</small></td>
      <td className="cb-reads">{c.explainedBy ? "adds up, once the other is held still" : "adds up"}</td>
    </tr>
  );
}

export function Combos({ now }: { now: number }) {
  const { rows } = useDayTable(now);
  const [k, setK] = useState<OutcomeKey>("focus");
  const cs = useMemo(() => combos(rows, k), [rows, k]);
  if (!cs || !cs.length) return null;
  const clear = cs.filter((c) => c.clear), rest = cs.filter((c) => !c.clear), name = OUTCOMES[k].name.toLowerCase();
  const vals = clear.flatMap((c) => [c.add, c.both, ...c.cells.flat().map((x) => x.m)]), lo = Math.min(...vals, 10) - 0.5, hi = Math.max(...vals, 0) + 0.2;
  const small = cs.filter((c) => c.cells[1][1].n < 10).length;
  return (
    <section className="p w12 cb" id="two-things" aria-label="Two things together" data-outcome={k} data-clear={clear.length}>
      <h2>Two things together <span>does one make the other worse?</span></h2>
      {/* owner, 11 Nov, of the 15 grids: "dont really get this part" — what it's for, in one line */}
      <p className="cb-what">Most things just add up: a short night costs a bit, drinks cost a bit, both cost both. This looks for pairs where the two <b>together</b> are clearly worse (or better) than that — like drinks hitting much harder after a late night.</p>
      <div className="iseg" role="group" aria-label="Judge a day by">{PICK.map((o) => <button key={o} type="button" aria-pressed={o === k} onClick={() => setK(o)}>{OUTCOMES[o].name}</button>)}</div>
      {clear.length ? <>
        <p className="cb-say">{clear.slice(0, 2).map((c) => c.say).join(" ")}</p>
        <div className="cb-list">{clear.slice(0, 3).map((c) => <Pair key={`${c.a}:${c.b}`} c={c} lo={lo} hi={hi} />)}</div>
      </> : <div className="cb-none">
        <b>Nothing yet for {name}.</b>
        <span>{cs.length} pairs checked — every one adds up about as you'd expect.{small > cs.length / 2 ? " Most have under 10 days with both, so only a big effect would show; it gets sharper as days come in." : ""}</span>
      </div>}
      {rest.length > 0 && <details className="cb-rest">
        <summary>{clear.length ? `The other ${rest.length} pairs add up about as you'd expect` : `See the ${rest.length} pairs`}</summary>
        <div className="cb-scroll"><table className="cb-table">
          <thead><tr><th scope="col">Pair</th><th scope="col">neither</th><th scope="col">only the 1st</th><th scope="col">only the 2nd</th><th scope="col">both</th><th scope="col">reads</th></tr></thead>
          <tbody>{rest.map((c) => <Row key={`${c.a}:${c.b}`} c={c} />)}</tbody>
        </table></div>
        <p className="note-i">Your average {name} on days with neither, only the first, only the second, and both — by the evening and night before.</p>
      </details>}
      <p className="note-i">"Worse together" only when the days with both sit clearly below what the other three squares predict — after allowing for how many pairs were looked at. Goes with, not causes.</p>
    </section>
  );
}
