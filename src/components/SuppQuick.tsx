/**
 * "+ Magnesium": a supplement logged now in one tap, like food, as many times a day as you take it (PLAN 87; owner, 13 Oct:
 * "log almost like food - one click, but i can log morning and night too if i take something twice"). lib/supplog decides
 * whether the tap answers the plan's tick or adds another intake. One you ran out of is here too, marked "out": a tap logs it
 * (from someone else's bottle) and leaves it ran out (owner, 20 Oct: "it should log without offering the restock option").
 */

import { act, getState, offerUndo, useStore } from "../lib/store";
import { logIntake, takenCount } from "../lib/supplog";
import { localDay } from "../lib/time";
import type { Entry } from "../lib/types";

export function SuppQuick({ now, label = "Took one now?" }: { now: number; label?: string }) {
  const all = useStore((s) => s.supplements);
  const supps = [...all.filter((s) => s.active && s.status !== "stopped"), ...all.filter((s) => !s.active && s.status === "out")];
  const entries = useStore((s) => s.entries);
  if (!supps.length) return null;
  const count = takenCount(entries, localDay(now));
  const tap = (id: string) => {
    const s = getState().supplements.find((x) => x.id === id)!, r = logIntake(s, getState().entries, Date.now());
    if (r.op === "add") offerUndo([act.addEntry(r.entry).id], `Logged ${s.name}`);
    else act.updateEntry(r.id, r.patch as Partial<Entry>);
  };
  return (
    <div className="supp-quick" role="group" aria-label="Log a supplement now">
      <span className="sq-k">{label}</span>
      {supps.map((s) => { const n = count.get(s.id) ?? 0; return (
        <button key={s.id} type="button" className="sq-chip" data-out={s.active ? undefined : "true"} aria-label={`Log ${s.name} now${s.active ? "" : " (you're out — stays out)"}${n ? ` — ${n} today so far` : ""}`} onClick={() => tap(s.id)}>
          + {s.name}{!s.active && <small>out</small>}{n ? <em>{n}×</em> : null}
        </button>
      ); })}
    </div>
  );
}
