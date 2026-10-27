/**
 * Today: days you didn't log, drafted (PLAN 177, body lab 9; owner, 27 Oct: "okay?"). What you do almost every day — the
 * usual coffee, the stack — at its usual time, each with why it's there; you untick what didn't happen and keep the
 * rest, or none of it. Nothing counts until kept. Numbers from lib/ghost.
 */

import { useMemo, useState } from "react";
import { daysWords } from "../lib/foodgaps";
import { ghostAnswers, ghostDrafts } from "../lib/ghost";
import { act, offerUndo, useStore } from "../lib/store";
import { localDay } from "../lib/time";

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function GhostCard({ now }: { now: number }) {
  const entries = useStore((s) => s.entries), supplements = useStore((s) => s.supplements);
  const today = localDay(now);
  const g = useMemo(() => ghostDrafts(entries, supplements, today), [entries, supplements, today]);
  const [off, setOff] = useState<Set<string>>(new Set());
  if (!g || !g.drafts.length) return null;
  const kept = g.drafts.filter((d) => !off.has(d.id));
  const weekend = g.days.length === 2 && new Date(`${g.days[0]}T12:00:00`).getDay() === 6;
  const answer = (keep: boolean) => {
    const ids = [...(keep ? kept.flatMap((d) => d.entries) : []), ...ghostAnswers(g.days, keep ? kept.length : 0)].map((e) => act.addEntry(e).id);
    offerUndo(ids, keep ? `Kept ${kept.length} from ${daysWords(g.days, today)}` : `None kept from ${daysWords(g.days, today)}`);
  };
  const toggle = (id: string) => setOff((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <section className="card catchup ghost" role="region" aria-label="Usual things, drafted">
      <h3>Not logged <span>{daysWords(g.days, today)}</span></h3>
      <b className="gh-title">{weekend ? "Your weekend, drafted" : "Drafted from your usual days"}</b>
      <p className="gh-why">What you do almost every day, at its usual time. Drafts, not facts — only what's ticked is kept.</p>
      {g.days.map((day) => {
        const ds = g.drafts.filter((d) => d.day === day);
        return ds.length ? (
          <div className="gh-day" key={day}>
            {g.days.length > 1 && <span className="gh-dh">{DAY[new Date(`${day}T12:00:00`).getDay()]}</span>}
            {ds.map((d) => (
              <label key={d.id} className="gh-item" data-draft={d.id}>
                <input type="checkbox" checked={!off.has(d.id)} onChange={() => toggle(d.id)} />
                <span><b>{d.title}</b><small>{d.why}{d.kcal ? ` · about ${d.kcal} kcal` : ""}</small></span>
              </label>
            ))}
          </div>
        ) : null;
      })}
      <div className="cu-btns">
        {kept.length > 0 && <button type="button" className="pill-btn pri" onClick={() => answer(true)}>Keep the {kept.length} ticked</button>}
        <button type="button" className="pill-btn" onClick={() => answer(false)}>None of it</button>
      </div>
    </section>
  );
}
