/**
 * What you ate, one day at a time (PLAN 128; owner, 20 Oct: "a simple window showing what i ate, the macros summary
 * basically for the day would be nice, when clicking on food on today page", "looking back to yesterday too"). Opened
 * from Today's Food card: the day's calories and macros against your goals, then each meal with what was in it. Tap an
 * item to change its numbers; × then "Delete?" removes it — any day, not just today (#113: "WHY CANT I REMOVE A FOOD I
 * LOGGED…??"). ‹ › walk back through the days. Each item and each meal has its score (lib/foodscore, PLAN 139); tap an
 * item's to see its three parts.
 */

import { useEffect, useMemo, useState } from "react";
import { act, useStore } from "../lib/store";
import { amountOf, foodDay, type FoodItem } from "../lib/foodday";
import { macrosOf } from "../lib/nutrition";
import { itemScore, plateScore, type ItemScore } from "../lib/foodscore";
import { BASIC_FOODS } from "../lib/foods-basic";
import type { Food } from "../lib/types";
import { go, LOG_FOR_KEY } from "../lib/nav";
import { addDays, atMinute, clock, dayLabel, localDay } from "../lib/time";
import { EntryEdit } from "./EntryEdit";
import { askAi, useAiStatus } from "../lib/ai/client";

const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");
const BASIC = new Map(BASIC_FOODS.map((f) => [f.id, f as Food]));
/** 70+ fits well, 40+ in between, under 40 fits the goal less — never "bad". */
const band = (s: number | null) => (s == null ? "none" : s >= 70 ? "ideal" : s >= 40 ? "fair" : "poor");

export function FoodDay({ day: first, onClose }: { day: string; onClose: () => void }) {
  const entries = useStore((s) => s.entries);
  const goals = useStore((s) => s.goals);
  const foods = useStore((s) => s.foods), bedMinute = useStore((s) => s.settings.bedMinute);
  const [why, setWhy] = useState<string | null>(null);
  const [day, setDay] = useState(first);
  const [edit, setEdit] = useState<string | null>(null), [sure, setSure] = useState<string | null>(null);
  const d = useMemo(() => foodDay(entries, day), [entries, day]);
  // what each item was logged from: the built-in table's nutrients win over a copy saved before they existed
  const { scores, foodOf } = useMemo(() => {
    const of = (e: FoodItem): Food | undefined => { if (e.kind !== "food" || !e.foodId) return undefined; const mine = foods.find((f) => f.id === e.foodId), b = BASIC.get(e.foodId); return mine ? { ...mine, nutri: mine.nutri ?? b?.nutri, noGrade: mine.noGrade ?? b?.noGrade } : b; };
    const items = d.meals.flatMap((m) => m.items);
    return { scores: new Map(items.map((e) => [e.id, itemScore(e, of(e), bedMinute)])), foodOf: new Map(items.map((e) => [e.id, of(e)])) };
  }, [d, foods, bedMinute]);
  // a food saved before it had nutrients (one the AI made earlier, or your own): ask once, on a tap, and keep the answer
  const { on: aiOn } = useAiStatus();
  const [asking, setAsking] = useState<string | null>(null), [askErr, setAskErr] = useState<string | null>(null);
  const canAsk = (f: Food | undefined): f is Food => !!f && aiOn === true && !f.nutri && !f.grade && !f.noGrade && !f.parts?.length && f.source !== "basic";
  const askNutri = async (f: Food) => {
    setAsking(f.id); setAskErr(null);
    const m = f.per100;
    const r = await askAi({ task: "describe", text: `${f.name} — per 100 g: ${Math.round(m.kcal)} kcal, protein ${m.p} g, carbs ${m.c} g, fat ${m.f} g. One food item, with its nutri per 100 g.` });
    setAsking(null);
    const n = r.ok ? r.answer.items.find((x) => x.kind === "food" && x.nutri)?.nutri : undefined;
    if (!n) { setAskErr(r.ok ? "The AI couldn't say for this one." : r.message); return; }
    act.rememberFood({ ...f, nutri: { sugar: n.sugar, satFat: n.satFat, salt: n.salt, fiber: n.fiber, ...(n.fvl ? { fvl: n.fvl } : {}), ...(n.redMeat ? { redMeat: true } : {}), ...(n.cheese ? { cheese: true } : {}) } });
  };
  const today = localDay(Date.now());
  const name = day === today ? "Today" : day === addDays(today, -1) ? "Yesterday" : dayLabel(atMinute(day, 720));
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const move = (n: number) => { setDay(addDays(day, n)); setEdit(null); setSure(null); setWhy(null); };
  // another day: Log opens on that day, at lunch time (as Today's catch-up hands it over)
  const addFood = () => { if (day !== today) { try { sessionStorage.setItem(LOG_FOR_KEY, JSON.stringify({ day, time: "12:30" })); } catch { /* Log opens on today */ } } onClose(); go("log", "food"); };
  const chip = (e: FoodItem, s: ItemScore | null | undefined) => s
    ? <button type="button" className="fd-score" data-band={band(s.score)} aria-expanded={why === e.id} aria-label={`${e.name}: score ${s.score ?? "not known yet"} — why`} onClick={() => setWhy(why === e.id ? null : e.id)}>{s.score ?? "—"}</button>
    : <span className="fd-score" data-band="none" aria-hidden="true" />;
  const row = (e: FoodItem) => {
    const m = macrosOf(e)!, s = scores.get(e.id);
    return (
      <div className={`li fd-li${edit === e.id ? " editing" : ""}`} key={e.id}>
        <button type="button" className="li-open" aria-expanded={edit === e.id} aria-label={`Change ${e.name}`} onClick={() => { setEdit(edit === e.id ? null : e.id); setSure(null); }}>
          <span>{e.name}<small>{clock(e.at)} · {amountOf(e)}{m.p >= 1 ? ` · P ${fmt(m.p)} g` : ""}</small></span>
        </button>
        {chip(e, s)}
        <span className="r">{fmt(m.kcal)}</span>
        {sure === e.id
          ? <button type="button" className="pill-btn fd-del" onClick={() => { act.removeEntry(e.id); setSure(null); }}>Delete?</button>
          : <button type="button" className="x" aria-label={`Delete ${e.name}`} onClick={() => setSure(e.id)}>×</button>}
        {why === e.id && s && <ul className="fd-why">
          {s.parts.map((p) => <li key={p.id}><span>{p.name}</span><b>{fmt(p.got)}/{p.max}</b><small>{p.why}</small></li>)}
          {s.missing && <li className="fd-miss"><span>Quality</span><b>—</b><small>No score yet: {s.missing}.</small></li>}
          {s.missing && canAsk(foodOf.get(e.id)) && <li className="fd-ask">
            <button type="button" className="pill-btn" disabled={asking != null} onClick={() => void askNutri(foodOf.get(e.id)!)}>{asking === foodOf.get(e.id)!.id ? "Asking…" : "✨ Ask the AI for its nutrients"}</button>
            {askErr && <small className="err">{askErr}</small>}
          </li>}
        </ul>}
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
            {(() => { const p = plateScore(m.items.map((e) => ({ kcal: macrosOf(e)!.kcal, s: scores.get(e.id) ?? null })));
              return <h4>{m.name}<span>{fmt(m.kcal)} kcal{p.score != null && <> · <b className="fd-plate" data-band={band(p.score)} aria-label={`${m.name} scores ${p.score}`}>{p.score}</b></>}</span></h4>; })()}
            <div className="list">{m.items.map(row)}</div>
          </div>
        ))}
        {!d.count && <p className="note">Nothing logged {day === today ? "yet today" : `on ${name === "Yesterday" ? "yesterday" : name}`}.</p>}
        <button type="button" className="pill-btn fd-add" onClick={addFood}>+ Add food{day === today ? "" : ` to ${name === "Yesterday" ? "yesterday" : name}`}</button>
      </section>
    </>
  );
}
