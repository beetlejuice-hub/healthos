/** Insights → Your week: how you felt this week against last, and what seems to change it. */

import { useMemo } from "react";
import { useStore } from "../lib/store";
import { weekly, type Avg } from "../lib/weekly";
import { phraseOf } from "../lib/feel";
import { atMinute, dayLabel } from "../lib/time";

const f1 = (v: number) => v.toFixed(1);
const arrow = (a: Avg) => (a.dir === "up" ? (a.k === "stress" ? "up (worse)" : "up") : a.dir === "down" ? (a.k === "stress" ? "down (better)" : "down") : a.dir === "same" ? "about the same" : "");
const dayName = (day: string) => dayLabel(atMinute(day, 12 * 60));

export function Weekly({ now }: { now: number }) {
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), supps = useStore((s) => s.supplements);
  const w = useMemo(() => weekly(entries, workouts, new Map(supps.filter((x) => x.active).map((x) => [x.id, x.name])), now), [entries, workouts, supps, now]);
  if (!w.ready) {
    if (!w.checkIns) return null;
    return <section className="weekly" aria-label="Your week"><h2>Your week <span>how you felt</span></h2>
      <p className="wk-wait">Starts {w.startsOn ? dayName(w.startsOn) : "soon"}, after two weeks of check-ins ({w.checkIns} so far).</p></section>;
  }
  const k = w.week;
  return (
    <section className="weekly" aria-label="Your week">
      <h2>Your week <span>last 7 days vs the 7 before · {k.checkIns} check-ins on {k.days} days</span></h2>
      <div className="wk-avgs">
        {k.avgs.filter((a) => a.now != null).map((a) => (
          <div key={a.k} className={`wk-avg ${a.dir === "up" || a.dir === "down" ? ((a.dir === "up") !== (a.k === "stress") ? "better" : "worse") : ""}`}>
            <span>{a.k}</span><b>{f1(a.now!)}</b>
            <small>{a.before != null ? `was ${f1(a.before)} · ${arrow(a) || "too few to compare"}` : "nothing to compare yet"}</small>
          </div>
        ))}
      </div>
      <ul className="wk-facts">
        {k.best && k.worst && <li>Mood was best in the <b>{k.best.name}</b> ({f1(k.best.mood)}) and lowest in the <b>{k.worst.name}</b> ({f1(k.worst.mood)}).</li>}
        {k.bestDay && <li>Best day: <b>{dayName(k.bestDay.day)}</b> (mood {f1(k.bestDay.mood)}){k.bestDay.what.length ? `, with ${k.bestDay.what.map(phraseOf).join(", ")}` : ""}.</li>}
        {k.lowDay && k.lowDay.day !== k.bestDay?.day && <li>Lowest: <b>{dayName(k.lowDay.day)}</b> (mood {f1(k.lowDay.mood)}){k.lowDay.what.length ? `, with ${k.lowDay.what.map(phraseOf).join(", ")}` : ""}.</li>}
        {k.top ? <li className={k.top.sure ? "wk-top" : "wk-early"}>
          {k.top.sure ? "Clearest connection so far: " : "Early sign, could still be chance: "}
          after <b>{k.top.r.label}</b> your {k.top.r.metric} {k.top.r.effect > 0 ? "rises" : "drops"} about {f1(Math.abs(k.top.r.effect))} points more than it otherwise does ({k.top.r.withN} times{k.top.sure ? "" : "; needs more to be sure"}).
        </li> : <li>No connection stands out yet. More check-ins, and ticking what you were up to, help most.</li>}
      </ul>
    </section>
  );
}
