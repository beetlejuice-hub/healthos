/**
 * A logged food or drink, pressed and held (or swiped left) — owner, 3 Nov: "I should be able to delete or change my
 * logged food, maybe we can do long press and add options there or swipe". One sheet: a different amount (½ … 2×, or the
 * grams), another time that day, its numbers, the same again now, delete. Every change can be undone for a few seconds.
 * The rules are lib/foodactions; this draws them and applies them.
 */

import { useEffect, useState, type ReactNode } from "react";
import { act, offerUndo, useStore } from "../lib/store";
import { AMOUNTS, again, atTime, scaled, toAmount, type Logged } from "../lib/foodactions";
import { amountOf } from "../lib/foodday";
import { macrosOf } from "../lib/nutrition";
import type { Entry } from "../lib/types";
import { clock, dayLabel } from "../lib/time";
import { EntryEdit } from "./EntryEdit";
import { useHold } from "./useHold";

const hhmm = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export function FoodActions({ id, onClose }: { id: string; onClose: () => void }) {
  // the entry as it is now (a change, or an Undo, redraws it); gone → nothing to show
  const e = useStore((s) => s.entries.find((x) => x.id === id)) as Logged | undefined;
  const [grams, setGrams] = useState<string | null>(null), [nums, setNums] = useState(false);
  // the finger that held the row lifts over the sheet: for a moment nothing in it takes a tap (it focused the time, 3 Nov)
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 350); return () => clearTimeout(t); }, []);
  if (!e || (e.kind !== "food" && e.kind !== "drink")) return null;
  const unit = e.kind === "food" ? "g" : "ml", kcal = Math.round(macrosOf(e)?.kcal ?? 0);
  // a change: applied, with the entry as it was offered back
  const change = (patch: Partial<Entry> | null, label: string) => {
    if (!patch) return;
    act.updateEntry(e.id, patch);
    offerUndo([], label, [e]);
    setGrams(null);
  };
  const del = () => { act.removeEntry(e.id); offerUndo([], `Deleted ${e.name}`, [e]); onClose(); };
  const dup = () => { const n = act.addEntry(again(e, Date.now()) as never); offerUndo([n.id], `Logged ${e.name} again`); onClose(); };
  return (
    <>
      <div className={`sheet-bg fa-bg${ready ? "" : " fa-wait"}`} onClick={onClose} aria-hidden="true" />
      <section className={`sheet fa${ready ? "" : " fa-wait"}`} role="dialog" aria-modal="true" aria-label={`${e.name}: change or delete`}>
        <header className="fa-head">
          <div><b>{e.name}</b><small>{dayLabel(e.at)} · {clock(e.at)} · {amountOf(e)} · {kcal} kcal</small></div>
          <button type="button" className="x" aria-label="Close" onClick={onClose}>×</button>
        </header>
        <div className="fa-row" role="group" aria-label="Amount">
          <span className="fa-k">Amount</span>
          <div className="fa-chips">
            {AMOUNTS.map((a) => <button key={a.k} type="button" className="pill-btn" onClick={() => change(scaled(e, a.k), `${e.name}: ${a.label}`)}>{a.label}</button>)}
          </div>
          <form className="fa-grams" onSubmit={(ev) => { ev.preventDefault(); change(toAmount(e, grams ?? ""), `${e.name}: ${grams} ${unit}`); }}>
            <input inputMode="decimal" aria-label={`Amount in ${unit}`} placeholder={`${Math.round(e.kind === "food" ? e.grams : e.ml)}`} value={grams ?? ""} onChange={(ev) => setGrams(ev.target.value)} />
            <span>{unit}</span>
            <button type="submit" className="pill-btn" disabled={!toAmount(e, grams ?? "")}>Set</button>
          </form>
        </div>
        <label className="fa-row fa-time"><span className="fa-k">Time</span>
          <input type="time" aria-label="Time" value={hhmm(e.at)} onChange={(ev) => { const at = atTime(e, ev.target.value); if (at != null && at !== e.at) change({ at }, `${e.name}: moved to ${ev.target.value}`); }} />
        </label>
        {nums ? <EntryEdit e={e} onDone={() => setNums(false)} />
          : <div className="fa-btns">
            <button type="button" className="pill-btn" onClick={() => setNums(true)}>Change numbers</button>
            <button type="button" className="pill-btn" onClick={dup}>Log again now</button>
            <button type="button" className="pill-btn fa-del" onClick={del}>Delete</button>
          </div>}
      </section>
    </>
  );
}

/** A logged food's row that opens FoodActions when held or swiped left. */
export function HoldRow({ id, className, onHold, children }: { id: string; className: string; onHold: (id: string) => void; children: ReactNode }) {
  const h = useHold(() => onHold(id));
  return <div className={`${className} holdable`} data-hold={id} {...h}>{children}</div>;
}
