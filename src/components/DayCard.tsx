/**
 * Workout → one day of your split (owner, 6 Oct: "make ui look better"). The day that's up next is the
 * big card: what it hits, how long it takes, every exercise with its sets × reps, today's suggestion for
 * the first lift, and one wide Start. The other days are compact: name, the same summary, Start.
 */

import { dayStats } from "../lib/training";
import { dayLabel } from "../lib/time";
import type { Template } from "../lib/types";

type Props = {
  t: Template; dayNo: number; next: boolean; lastAt: number | null;
  sug: { exercise: string; kg: number; reps: number } | null;
  onEdit: () => void; onStart: () => void;
};

export function DayCard({ t, dayNo, next, lastAt, sug, onEdit, onStart }: Props) {
  const s = dayStats(t);
  return (
    <section className={`dcard${next ? " next" : ""}`} aria-label={t.name}>
      <header>
        <span className="dno">Day {dayNo}{next && <b> · Up next</b>}</span>
        <button type="button" className="dedit" aria-label={`Edit ${t.name}`} onClick={onEdit}>✎</button>
      </header>
      <h2>{t.name}</h2>
      <p className="dmeta">
        <span>{s.exercises} exercises</span><span>{s.sets} sets</span><span>~{s.liftMin} min</span>
      </p>
      {t.cardio && <p className="dcardio">{t.cardio}</p>}
      {s.muscles.length > 0 && <div className="dtags">{s.muscles.map((m) => <span key={m}>{m}</span>)}</div>}
      {!next && t.exercises.length > 0 && <p className="dex">{t.exercises.map((e) => e.name).join(" · ")}</p>}
      {next && t.exercises.length > 0 && (
        <ol className="dlist">
          {t.exercises.map((e, k) => <li key={k}><span>{e.name}</span><b>{e.sets} × {e.reps === 1 ? "hold" : e.reps}</b></li>)}
        </ol>
      )}
      <footer>
        <span className="dlast">
          {lastAt ? `Last: ${dayLabel(lastAt)}` : "Not done yet"}
          {next && sug && <><br /><b>{sug.exercise} today: {sug.kg} kg × {sug.reps}</b></>}
        </span>
        <button type="button" className={next ? "go" : "go alt"} onClick={onStart}>Start</button>
      </footer>
    </section>
  );
}
