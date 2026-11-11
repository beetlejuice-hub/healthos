/**
 * What makes a day (PLAN 208; owner, 11 Nov — E made clearer, "i like E but its not that understandable", and H, the day
 * lines). Insights → Findings. Pick focus, mood, energy or your sleep rating; your best third of days against your worst
 * on each thing before them — a sentence, then per thing two rows of dots (best days, worst days) with each group's
 * middle — sorted by how far apart. Or the day lines: each day one line through the things to its rating, best and worst
 * thirds coloured, their middle days thick. Numbers from lib/bestdays; this file only draws.
 */

import { useMemo, useState } from "react";
import { bestDays } from "../lib/bestdays";
import { FACTORS, OUTCOMES, type DayRow, type FactorKey, type OutcomeKey } from "../lib/daytable";
import { useDayTable } from "./useDayTable";

const PICK: OutcomeKey[] = ["focus", "mood", "energy", "sleepRating"];
const LINE_KEYS: FactorKey[] = ["asleep", "bed", "drinks", "lateCaf", "protein", "steps", "trained", "hrv"];

function DayLines({ rows, k, best, worst }: { rows: DayRow[]; k: OutcomeKey; best: Set<string>; worst: Set<string> }) {
  // a thing becomes an axis when it has 10 days and isn't the same every day (a flat axis says nothing)
  const axes = [...LINE_KEYS.filter((f) => { const v = rows.map((r) => r[f]).filter((x): x is number => x != null); return v.length >= 10 && Math.max(...v) > Math.min(...v); }), k] as (FactorKey | OutcomeKey)[];
  const range = axes.map((a) => { const v = rows.map((r) => r[a]).filter((x): x is number => x != null); return [Math.min(...v), Math.max(...v)] as const; });
  const W = 1000, H = 360, X = (i: number) => 40 + (i * (W - 80)) / (axes.length - 1), Y = (i: number, v: number) => 320 - ((v - range[i][0]) / (range[i][1] - range[i][0] || 1)) * 280;
  const line = (r: DayRow) => axes.map((a, i) => (r[a] == null ? null : `${X(i).toFixed(1)},${Y(i, r[a]!).toFixed(1)}`)).filter(Boolean).join(" ");
  const med = (g: DayRow[], a: FactorKey | OutcomeKey) => { const s = g.map((r) => r[a]).filter((x): x is number => x != null).sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const mid = (g: DayRow[]) => axes.map((a, i) => { const m = med(g, a); return m == null ? null : `${X(i).toFixed(1)},${Y(i, m).toFixed(1)}`; }).filter(Boolean).join(" ");
  const rated = rows.filter((r) => r[k] != null), B = rated.filter((r) => best.has(r.day)), Wd = rated.filter((r) => worst.has(r.day));
  const label = (a: FactorKey | OutcomeKey) => (a in FACTORS ? FACTORS[a as FactorKey].name : OUTCOMES[a as OutcomeKey].name);
  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} className="bd-lines" role="img" aria-label={`${rated.length} days as lines through ${axes.map(label).join(", ").toLowerCase()}`}>
      {axes.map((a, i) => <g key={a}><line x1={X(i)} x2={X(i)} y1={40} y2={320} className="bd-ax" /><text x={X(i)} y={24} className="bd-axt" textAnchor="middle">{label(a)}</text>
        <text x={X(i)} y={340} className="bd-axv" textAnchor="middle">{a === "bed" ? "earlier ↓" : a === k ? "worse ↓" : FACTORS[a as FactorKey]?.binary ? "no ↓" : "less ↓"}</text></g>)}
      {rated.filter((r) => !best.has(r.day) && !worst.has(r.day)).map((r) => <polyline key={r.day} points={line(r)} className="bd-l rest" />)}
      {Wd.map((r) => <polyline key={r.day} points={line(r)} className="bd-l worst" />)}
      {B.map((r) => <polyline key={r.day} points={line(r)} className="bd-l best" />)}
      <polyline points={mid(Wd)} className="bd-mid worst" /><polyline points={mid(B)} className="bd-mid best" />
    </svg>
  );
}

export function BestDays({ now }: { now: number }) {
  const { rows } = useDayTable(now);
  const [k, setK] = useState<OutcomeKey>("focus"), [view, setView] = useState<"dots" | "lines">("dots");
  const b = useMemo(() => bestDays(rows, k), [rows, k]);
  const groups = useMemo(() => {
    const rated = rows.filter((r) => r[k] != null).sort((p, q) => p[k]! - q[k]!), third = Math.floor(rated.length / 3);
    return { worst: new Set(rated.slice(0, third).map((r) => r.day)), best: new Set(rated.slice(-third).map((r) => r.day)) };
  }, [rows, k]);
  if (!b) return null;
  return (
    <section className="p w12 bd" id="what-makes-a-day" aria-label="What makes a day" data-outcome={k}>
      <h2>What makes a day <span>your best third of days against your worst · {b.n} rated days</span></h2>
      <div className="bd-ctrl">
        <div className="iseg" role="group" aria-label="Judge a day by">{PICK.map((o) => <button key={o} type="button" aria-pressed={o === k} onClick={() => setK(o)}>{OUTCOMES[o].name}</button>)}</div>
        <div className="iseg" role="group" aria-label="View">{(["dots", "lines"] as const).map((v) => <button key={v} type="button" aria-pressed={v === view} onClick={() => setView(v)}>{v === "dots" ? "Best against worst" : "Day lines"}</button>)}</div>
      </div>
      <p className="bd-say"><b className="is-best">{b.best}</b> {b.worst && <b className="is-worst">{b.worst}</b>}</p>
      {view === "dots" ? <ul className="bd-rows">{b.rows.filter((c) => Math.max(...c.bestVals, ...c.worstVals) > Math.min(...c.bestVals, ...c.worstVals)).map((c) => {
        const all = [...c.bestVals, ...c.worstVals], lo = Math.min(...all), hi = Math.max(...all), X = (v: number) => 2 + ((v - lo) / (hi - lo || 1)) * 96;
        const f = FACTORS[c.key];
        // dots as HTML so they stay round at any width; the same value stacks a little so piles show
        const strip = (vals: number[], cls: string) => { const seen = new Map<number, number>(); return vals.map((v, i) => { const k = Math.round(X(v)), n = seen.get(k) ?? 0; seen.set(k, n + 1);
          return <i key={i} className={`bd-d ${cls}`} style={{ left: `${X(v)}%`, top: `${50 - Math.min(n, 6) * 6 * (n % 2 ? 1 : -1)}%` }} />; }); };
        return (
          <li key={c.key} data-key={c.key} data-says={c.says}>
            <span className="bd-name"><b>{f.name}</b><small>{f.when}</small></span>
            {f.binary ? <span className="bd-share" aria-hidden="true"><span><i className="is-best" style={{ width: `${c.best * 100}%` }} /></span><span><i className="is-worst" style={{ width: `${c.worst * 100}%` }} /></span></span>
              : <span className="bd-strips" aria-hidden="true"><span className="bd-strip">{strip(c.bestVals, "is-best")}<em className="is-best" style={{ left: `${X(c.best)}%` }} /></span><span className="bd-strip">{strip(c.worstVals, "is-worst")}<em className="is-worst" style={{ left: `${X(c.worst)}%` }} /></span></span>}
            <span className="bd-v"><b className="is-best">{f.binary ? `${Math.round(c.best * 100)} %` : f.fmt(c.best)}</b><b className="is-worst">{f.binary ? `${Math.round(c.worst * 100)} %` : f.fmt(c.worst)}</b><small>{c.says === "strongly" ? "far apart" : c.says === "some" ? "somewhat apart" : "alike"}</small></span>
          </li>
        );
      })}</ul> : <DayLines rows={rows} k={k} best={groups.best} worst={groups.worst} />}
      <p className="note-i">{view === "dots" ? <><b className="is-best">Top row: your best days</b> · <b className="is-worst">bottom row: your worst</b> · the tick is each group's middle day; for yes/no things, the bar is the share.</> : <>Each day one line, from what came before it to how it went. <b className="is-best">Your best third</b> · <b className="is-worst">your worst</b> · thick: each group's middle.</>} Goes with, not causes — late nights and drinks often come together.</p>
    </section>
  );
}
