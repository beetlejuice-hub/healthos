/**
 * Today: your week (PLAN 203, then 204; owner, 10 Nov, on the wilder canvas: "I fucking love the idea of all of these …
 * keep it professional too … easy the language, kepp it playful but informal"). You start the week with 70 and defend it:
 * each goal with its days and what it can still take, this week's focus (last week's weakest goal), last week's you, the next move that counts, a
 * stake that's owed, the gym-day treat, and you against everyone. The card, the race and the season are on the game page.
 * Numbers from lib/game, lib/play and lib/norms; this file only draws.
 */

import { useMemo } from "react";
import { useBand } from "../lib/band-client";
import type { Progress } from "../lib/game";
import { vsBest } from "../lib/norms";
import { PLAY, stakeDue, standing } from "../lib/play";
import { stepsByDay } from "../lib/steps";
import { act, useStore } from "../lib/store";
import { addDays, localDay } from "../lib/time";
import { useGame } from "./useGame";

const hhmm = (h: number) => { const m = Math.round(h * 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

/** What the goal needs next, said once: tonight's bed, today's protein, today's stack. */
function nextMove(g: Progress, h: number): string | null {
  const today = g.days.findIndex((x) => x === null);
  if (g.need - g.done <= 0) return null;
  if (g.id === "bed" && today >= 0 && h >= 18 && g.at != null) return `in bed by ${hhmm(g.at)} tonight makes it ${g.done + 1} of ${g.need}`;
  if (g.id === "protein" && today >= 0) return `${g.title} today makes it ${g.done + 1} of ${g.need}`;
  if (g.id === "stack" && today >= 0) return `the stack today makes it ${g.done + 1} of ${g.need}`;
  return null;
}

export function WeekCard({ now }: { now: number }) {
  const { game, ns } = useGame(now);
  const stakes = useStore((s) => s.settings.stakes), treat = useStore((s) => s.settings.treat), workouts = useStore((s) => s.workouts);
  const band = useBand().data, today = localDay(now);
  const vs = useMemo(() => {
    if (!band) return null;
    const steps = stepsByDay(band.steps ?? [], band.hr, today).get(addDays(today, -1)) ?? null, night = ns.find((n) => n.day === today);
    return vsBest({ steps, sleepMin: night?.asleep ?? null, rhr: band.rhr[today] ?? null });
  }, [band, ns, today]);
  if (!game) return null;
  const { now: w, focus, ghosts: gh, level, past } = game, h = new Date(now).getHours();
  const last = past.at(-1)?.from === addDays(w.from, -7) ? past.at(-1)! : null;
  // the focus first, then whatever's one miss from costing, then the rest
  const risk = (id: string) => Number(w.costs.find((c) => c.id === id)!.risk);
  const order = [...w.goals].sort((a, b) => Number(b.id === focus?.id) - Number(a.id === focus?.id) || risk(b.id) - risk(a.id));
  const move = order.map((g) => nextMove(g, h)).find(Boolean);
  const owed = stakeDue(stakes, past, today), trained = workouts.some((x) => x.endedAt != null && localDay(x.startedAt) === today);
  const ahead = gh.vsLast == null ? null : gh.vsLast > 0 ? `${gh.vsLast} ahead of last week's you` : gh.vsLast < 0 ? `${-gh.vsLast} behind last week's you` : "level with last week's you";
  return (
    <section className="card week" aria-label="This week's goals" data-points={w.points} data-level={level.level}>
      <div className="wk-top">
        <div className="wk-pts"><b>{w.points}</b><span>of {PLAY.start} left</span></div>
        <div className="wk-words">
          <span className="wk-k">Your week · level {level.level}</span>
          <span>{w.points >= PLAY.keep ? (w.dayN === 7 ? "Hold 50 tonight and you level up" : "Keep 50 by Sunday and you level up") : "Under 50 — this one costs a level. Monday's a fresh 70."}</span>
          <small>{w.dayN} of 7 days in{last ? ` · last week you kept ${last.points}` : ""}</small>
        </div>
      </div>
      <span className="wk-hold" aria-hidden="true"><i style={{ width: `${(w.points / PLAY.start) * 100}%` }} className={w.points < PLAY.keep ? "under" : undefined} /><em style={{ left: `${(PLAY.keep / PLAY.start) * 100}%` }} /></span>
      <ul className="wk-goals">
        {w.goals.map((g, i) => {
          const st = standing(g, w.costs[i]);
          return (
            <li key={g.id} data-goal={g.id}>
              <span className="wk-t">{g.title} <span>· {g.kind === "atMost" ? `${g.done} so far` : `${g.done} of ${g.need}`}</span></span>
              <b className={st.tone}>{st.say}</b>
              {g.kind === "days"
                ? <span className="wk-days" aria-hidden="true">{g.days.map((d, k) => <i key={k} className={d === true ? "hit" : d === false ? "miss" : ""} />)}</span>
                : <span className="wk-bar" aria-hidden="true"><i className={g.kind === "atMost" ? (g.done <= g.target ? "ok" : "over") : ""} style={{ width: `${Math.min(100, (g.done / Math.max(1, g.need)) * 100)}%` }} /></span>}
            </li>
          );
        })}
      </ul>
      {focus && (
        <p className="wk-focus" data-focus={focus.id} data-left={focus.left}>
          <span><b>This week's focus: {focus.area.toLowerCase()}</b> · {focus.state === "done" ? "done. Nice." : focus.state === "missed" ? "out of reach this week — fresh go Monday." : `${100 - focus.left} % there`}</span>
          {focus.state === "on" && <span className="wk-hp" aria-hidden="true"><i style={{ width: `${100 - focus.left}%` }} /></span>}
        </p>
      )}
      {move && <p className="wk-move"><b>Next:</b> {move}.</p>}
      {owed && (
        <p className="wk-owed"><span><b>You owe:</b> {owed.what}. Last week ended under 50.</span>
          <button type="button" className="kbtn" onClick={() => act.setSettings({ stakes: { ...stakes, [owed.from]: { what: owed.what, paid: true } } })}>Done it</button></p>
      )}
      {treat && trained && <p className="wk-treat"><b>Trained today</b> — {treat} is yours.</p>}
      {(ahead || vs) && <p className="wk-vs">{ahead && <><b>The race</b> · {ahead}{gh.vsBest != null && gh.vsBest < 0 ? `, ${-gh.vsBest} behind your best` : ""}</>}{ahead && vs && <br />}{vs && <><b>You vs everyone</b> · {vs}</>}</p>}
      <a className="wk-open" href="#game">Your card, the race and the season ›</a>
    </section>
  );
}
