/**
 * Today: your week — weekly goals and one week score (PLAN 203; owner, 10 Nov: "1 yes 2 yes" to weekly goals plus one
 * week score, on Today first; canvas https://claude.ai/artifact/NJWv92De7QkzN9KzhvhD1V, A built while he picks). Under the
 * tiles: the score so far in a ring, what you're on pace for and last week's, each goal with its days, the one move
 * that counts next, and you against everyone. Numbers from lib/game and lib/norms; this file only draws.
 */

import { useMemo } from "react";
import { useBand } from "../lib/band-client";
import { weekOf, type Progress } from "../lib/game";
import { vsBest } from "../lib/norms";
import { clockH, nights } from "../lib/sleep";
import { stepsByDay } from "../lib/steps";
import { useStore } from "../lib/store";
import { addDays, localDay } from "../lib/time";

/** What the goal needs next, said once: tonight's bed, today's protein, today's stack, the sessions left. */
function nextMove(g: Progress, h: number): string | null {
  const today = g.days.findIndex((x) => x === null), left = g.need - g.done;
  if (left <= 0) return null;
  if (g.id === "bed" && today >= 0 && h >= 18 && g.at != null) { const m = Math.round(g.at * 60) % 1440; return `in bed by ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")} tonight makes it ${g.done + 1} of ${g.need}`; }
  if (g.id === "protein" && today >= 0) return `${g.title} today makes it ${g.done + 1} of ${g.need}`;
  if (g.id === "stack" && today >= 0) return `the stack today makes it ${g.done + 1} of ${g.need}`;
  return null;
}

export function WeekCard({ now }: { now: number }) {
  const entries = useStore((s) => s.entries), supplements = useStore((s) => s.supplements), workouts = useStore((s) => s.workouts), goalP = useStore((s) => s.goals.p);
  const band = useBand().data, today = localDay(now);
  const ns = useMemo(() => (band ? nights(band.sleep, band.hr, band.rhr, band.hrv) : []), [band]);
  const w = useMemo(() => weekOf(today, { entries, supplements, workouts, beds: ns.map((n) => ({ eve: n.eve, h: clockH(n.bed, n.eve) })), proteinGoal: goalP }), [today, entries, supplements, workouts, ns, goalP]);
  const vs = useMemo(() => {
    if (!band) return null;
    const steps = stepsByDay(band.steps ?? [], band.hr, today).get(addDays(today, -1)) ?? null, night = ns.find((n) => n.day === today);
    return vsBest({ steps, sleepMin: night?.asleep ?? null, rhr: band.rhr[today] ?? null });
  }, [band, ns, today]);
  if (!w) return null;
  const h = new Date(now).getHours(), move = w.goals.map((g) => nextMove(g, h)).find(Boolean);
  const C = 2 * Math.PI * 33.5, arc = (Math.min(100, w.score) / 100) * C;
  return (
    <section className="card week" aria-label="This week's goals" data-score={w.score} data-pace={w.pace}>
      <div className="wk-top">
        <span className="wk-ring" aria-hidden="true">
          <svg width="74" height="74" viewBox="0 0 74 74"><circle cx="37" cy="37" r="33.5" className="wk-track" /><circle cx="37" cy="37" r="33.5" className="wk-arc" strokeDasharray={`${arc} ${C}`} transform="rotate(-90 37 37)" /></svg>
          <b>{w.score}</b>
        </span>
        <div className="wk-words">
          <span className="wk-k">Your week</span>
          <span>{w.dayN < 7 ? <>On pace for <b className="wk-pace">{w.pace}</b></> : <>Done: <b className="wk-pace">{w.score}</b></>}{w.last != null && <> · last week {w.last}</>}</span>
          <small>{w.dayN} of 7 days in · {w.goals.length} goal{w.goals.length === 1 ? "" : "s"}, out of 100</small>
        </div>
      </div>
      <ul className="wk-goals">
        {w.goals.map((g) => (
          <li key={g.id} data-goal={g.id}>
            <span className="wk-t">{g.title} <span>· {g.id === "stack" && w.streak ? `${w.streak} in a row` : g.detail}</span></span>
            <b className={g.kind === "atMost" && g.done <= g.target ? "ok" : undefined}>{g.kind === "atMost" ? `${g.done} so far` : `${g.done} of ${g.need}`}</b>
            {g.kind === "days"
              ? <span className="wk-days" aria-hidden="true">{g.days.map((d, i) => <i key={i} className={d === true ? "hit" : d === false ? "miss" : ""} />)}</span>
              : <span className="wk-bar" aria-hidden="true"><i className={g.kind === "atMost" ? (g.done <= g.target ? "ok" : "over") : ""} style={{ width: `${Math.min(100, (g.done / Math.max(1, g.need)) * 100)}%` }} /></span>}
          </li>
        ))}
      </ul>
      {move && <p className="wk-move"><b>Next:</b> {move}.</p>}
      {vs && <p className="wk-vs"><b>You vs everyone</b> · {vs}</p>}
    </section>
  );
}
