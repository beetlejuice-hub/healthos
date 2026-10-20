/**
 * What you ate, one day at a time (PLAN 128; owner, 20 Oct: "a simple window showing what i ate, the macros summary
 * basically for the day would be nice, when clicking on food on today page", "looking back to yesterday too"). Opened
 * from Today's Food card: the day's calories and macros against your goals, then each meal with what was in it. Tap an
 * item to change its numbers; × then "Delete?" removes it — any day, not just today (#113: "WHY CANT I REMOVE A FOOD I
 * LOGGED…??"). ‹ › walk back through the days.
 */

import { useEffect, useMemo, useState } from "react";
import { act, useStore } from "../lib/store";
import { amountOf, foodDay, type FoodItem } from "../lib/foodday";
import { macrosOf } from "../lib/nutrition";
import { go, LOG_FOR_KEY } from "../lib/nav";
import { addDays, atMinute, clock, dayLabel, localDay } from "../lib/time";
import { EntryEdit } from "./EntryEdit";

const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");

export function FoodDay({ day: first, onClose }: { day: string; onClose: () => void }) {
  const entries = useStore((s) => s.entries);
  const goals = useStore((s) => s.goals);
  const [day, setDay] = useState(first);
  const [edit, setEdit] = useState<string | null>(null), [sure, setSure] = useState<string | null>(null);
  const d = useMemo(() => foodDay(entries, day), [entries, day]);
  const today = localDay(Date.now());
  const name = day === today ? "Today" : day === addDays(today, -1) ? "Yesterday" : dayLabel(atMinute(day, 720));
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const move = (n: number) => { setDay(addDays(day, n)); setEdit(null); setSure(null); };
  // another day: Log opens on that day, at lunch time (as Today's catch-up hands it over)
  const addFood = () => { if (day !== today) { try { sessionStorage.setItem(LOG_FOR_KEY, JSON.stringify({ day, time: "12:30" })); } catch { /* Log opens on today */ } } onClose(); go("log", "food"); };
  const row = (e: FoodItem) => {
    const m = macrosOf(e)!;
    return (
      <div className={`li fd-li${edit === e.id ? " editing" : ""}`} key={e.id}>
        <button type="button" className="li-open" aria-expanded={edit === e.id} aria-label={`Change ${e.name}`} onClick={() => { setEdit(edit === e.id ? null : e.id); setSure(null); }}>
          <span>{e.name}<small>{clock(e.at)} · {amountOf(e)}{m.p >= 1 ? ` · P ${fmt(m.p)} g` : ""}</small></span>
        </button>
        <span className="r">{fmt(m.kcal)}</span>
        {sure === e.id
          ? <button type="button" className="pill-btn fd-del" onClick={() => { act.removeEntry(e.id); setSure(null); }}>Delete?</button>
          : <button type="button" className="x" aria-label={`Delete ${e.name}`} onClick={() => setSure(e.id)}>×</button>}
        {edit === e.id && <EntryEdit e={e} onDone={() => setEdit(null)} />}
      </div>
    );
  };
  return (
    <>
      <div className="sheet-bg" onClick={onClose} aria-hidden="true" />
      <section className="sheet food-day" role="dialog" aria-modal="true" aria-label="What I ate">
        <header className="fd-head">
          <button type="button" className="fd-nav" aria-label="Day before" onClick={() => move(-1)}>‹</button>
          <b>{name}</b>
          <button type="button" className="fd-nav" aria-label="Day after" disabled={day >= today} onClick={() => move(1)}>›</button>
          <button type="button" className="x fd-close" aria-label="Close" onClick={onClose}>✕</button>
        </header>
        <div className="fd-sum">
          <p className="fd-kcal"><b>{fmt(d.totals.kcal)}</b> kcal <span>{d.count ? (d.totals.kcal <= goals.kcal ? `${fmt(goals.kcal - d.totals.kcal)} under` : `${fmt(d.totals.kcal - goals.kcal)} over`) + ` your ${fmt(goals.kcal)}` : `goal ${fmt(goals.kcal)}`}</span></p>
          <div className="macros">
            {([["Protein", d.totals.p, goals.p, "var(--pro)"], ["Carbs", d.totals.c, goals.c, "var(--carb)"], ["Fat", d.totals.f, goals.f, "var(--fat)"]] as const).map(([n, v, g, c]) => (
              <div className="mac" key={n}>
                <div><span>{n}</span><span><b>{fmt(v)}</b> / {g} g</span></div>
                <div className="track"><i style={{ width: `${Math.min(100, (v / g) * 100)}%`, background: c }} /></div>
              </div>
            ))}
          </div>
        </div>
        {d.meals.map((m) => (
          <div className="fd-meal" key={m.name}>
            <h4>{m.name}<span>{fmt(m.kcal)} kcal</span></h4>
            <div className="list">{m.items.map(row)}</div>
          </div>
        ))}
        {!d.count && <p className="note">Nothing logged {day === today ? "yet today" : `on ${name === "Yesterday" ? "yesterday" : name}`}.</p>}
        <button type="button" className="pill-btn fd-add" onClick={addFood}>+ Add food{day === today ? "" : ` to ${name === "Yesterday" ? "yesterday" : name}`}</button>
      </section>
    </>
  );
}
