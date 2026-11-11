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

export function Combos({ now }: { now: number }) {
  const { rows } = useDayTable(now);
  const [k, setK] = useState<OutcomeKey>("focus");
  const cs = useMemo(() => combos(rows, k), [rows, k]);
  if (!cs || !cs.length) return null;
  const clear = cs.filter((c) => c.clear), rest = cs.filter((c) => !c.clear);
  const vals = cs.flatMap((c) => [c.add, c.both, ...c.cells.flat().map((x) => x.m)]), lo = Math.min(...vals) - 0.5, hi = Math.max(...vals) + 0.2;
  const shown = clear.length ? clear.slice(0, 3) : [];
  return (
    <section className="p w12 cb" id="two-things" aria-label="Two things together" data-outcome={k}>
      <h2>Two things together <span>does one make the other worse — or soften it? · {cs.length} pairs with 4+ days each way</span></h2>
      <div className="iseg" role="group" aria-label="Judge a day by">{PICK.map((o) => <button key={o} type="button" aria-pressed={o === k} onClick={() => setK(o)}>{OUTCOMES[o].name}</button>)}</div>
      <p className="cb-say">{clear.length ? clear.slice(0, 2).map((c) => c.say).join(" ") : `Every pair adds up about as you'd expect for ${OUTCOMES[k].name.toLowerCase()} — nothing makes another clearly worse or better.`}</p>
      {shown.length > 0 && <div className="cb-list">{shown.map((c) => <Pair key={`${c.a}:${c.b}`} c={c} lo={lo} hi={hi} />)}</div>}
      {rest.length > 0 && <details className="cb-rest">
        <summary><b>{clear.length ? "The rest add up about as you'd expect" : "Every pair"}</b> — {rest.slice(0, 3).map((c) => `${FLAGS[c.a].yes} + ${FLAGS[c.b].yes}`).join(", ")}{rest.length > 3 ? `, … (${rest.length})` : ""}</summary>
        <div className="cb-list">{rest.map((c) => <Pair key={`${c.a}:${c.b}`} c={c} lo={lo} hi={hi} />)}</div>
      </details>}
      <p className="note-i">Each pair splits your days four ways by the evening and night before. "Worse together" only when the days with both sit clearly below what the two alone add up to — after allowing for how many pairs were looked at. Goes with, not causes.</p>
    </section>
  );
}
