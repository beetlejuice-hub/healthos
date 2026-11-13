/**
 * The top of Training (renovation part 1, canvas A — "four tiles, then next"; owner, 13 Nov: "do 1"). "Getting fitter?":
 * strength, cardio fitness, recovery and weight, each from its own engine (lib/fitness), each tile on its own weeks with
 * up drawn as better; a tap goes to its card (weight to Food & body). Then "Next": the session after the last one with
 * its first lift as last time said, and the cardio short of the usual this week, each one tap from starting. Draws only.
 */

import type { Answer } from "../lib/fitness";
import { headline } from "../lib/fitness";
import { act } from "../lib/store";

const COLOR: Record<Answer["key"], string> = { strength: "var(--gym)", cardio: "var(--ok)", recovery: "var(--sh-g)", weight: "var(--wt)" };
/** Where each tile goes: its card on this page, or another page. */
const TARGET: Record<Answer["key"], string> = { strength: "tp-strength", cardio: "tp-cardiofit", recovery: "tp-cardiofit", weight: "#insights/intake" };

export function FitnessTop({ answers, since }: { answers: Answer[]; since: string | null }) {
  const go = (k: Answer["key"]) => {
    const t = TARGET[k];
    if (t.startsWith("#")) { location.hash = t; return; }
    document.getElementById(t)?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  return (
    <section className="sl-p ft" aria-label="Getting fitter?">
      <div className="cf-head"><span className="cmp-k">Getting fitter?</span>{since && <span className="sl-note">since {since}</span>}</div>
      <p className="ft-say">{headline(answers)}</p>
      <div className="ft-tiles">
        {answers.map((a) => (
          <button key={a.key} type="button" className={`ft-tile ${a.tone}`} data-key={a.key} onClick={() => go(a.key)} aria-label={`${a.name}: ${a.big ?? "not yet"}, ${a.word}`}>
            <span className="ft-nm"><i style={{ background: COLOR[a.key] }} />{a.name}</span>
            <b>{a.big ?? "—"}</b>
            <span className="ft-w">{a.word}</span>
            <Line pts={a.spark} color={COLOR[a.key]} />
          </button>
        ))}
      </div>
    </section>
  );
}

/** A tile's weeks as a line, up = better, the last point marked. */
function Line({ pts, color, w = 140, h = 28 }: { pts: [number, number][]; color: string; w?: number; h?: number }) {
  if (pts.length < 2) return <svg className="ft-line" width={w} height={h} aria-hidden="true" />;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), lo = Math.min(...ys), hi = Math.max(...ys), pad = (hi - lo) * 0.15 || 1;
  const X = (x: number) => 3 + ((x - x0) / (x1 - x0 || 1)) * (w - 6), Y = (y: number) => h - 3 - ((y - lo + pad) / (hi - lo + 2 * pad)) * (h - 6), last = pts.at(-1)!;
  return (
    <svg className="ft-line" width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" points={pts.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(" ")} />
      <circle cx={X(last[0])} cy={Y(last[1])} r="2.8" fill={color} />
    </svg>
  );
}

export type NextLift = { name: string; line: string | null };
export type NextCardio = { short: number; min: number; usual: number; kind: string | null };

/** What to do next: the next session and the cardio short this week. Nothing to say → nothing drawn. */
export function NextCard({ lift, cardio }: { lift: NextLift | null; cardio: NextCardio | null }) {
  if (!lift && !cardio) return null;
  const startLift = () => { act.startWorkout(lift!.name); location.hash = "#workout"; };
  const startCardio = () => { act.startCardio(cardio!.kind ?? "Cardio"); location.hash = "#workout"; };
  return (
    <section className="sl-p ft-next" aria-label="Next">
      <span className="cmp-k">Next</span>
      {lift && <div className="ft-row"><div><b>{lift.name}</b>{lift.line && <span>{lift.line}</span>}</div><button type="button" className="ft-btn" onClick={startLift}>Start</button></div>}
      {cardio && <div className="ft-row"><div><b>{cardio.short} min of cardio</b><span>{cardio.min} of your usual {cardio.usual} min this week</span></div>
        <button type="button" className="ft-btn alt" onClick={startCardio}>{cardio.kind ?? "Start cardio"}</button></div>}
    </section>
  );
}
