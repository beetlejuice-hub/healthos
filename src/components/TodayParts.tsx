/**
 * Today, redesigned (owner, 6 Oct, on the canvas: "I LOVE THIS!! build this pls"). The parts that are
 * new: four live numbers, the Now card that follows the clock, and the six fixed one-tap buttons.
 * Everything inside them (the check-in, the stack, caffeine, food) is the same components as before.
 */

import type { ReactNode } from "react";
import { act, offerUndo, useStore } from "../lib/store";
import { DRINKS } from "../lib/drinks";
import { go } from "../lib/nav";
import { clock, localDay } from "../lib/time";
import { answerSlot, slotsOf, type Drink } from "../lib/types";
import { MOMENT_TITLE, type Moment } from "../lib/moment";

const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");
const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

/** Today's stack doses (one per supplement per slot) and how many are ticked taken. */
export function useStackCount(now: number) {
  const supplements = useStore((s) => s.supplements), entries = useStore((s) => s.entries);
  const day = localDay(now);
  const doses = supplements.filter((x) => x.active).flatMap((s) => slotsOf(s).map((slot) => `${s.id}|${slot}`));
  const taken = new Set(entries.flatMap((e) => (e.kind === "supp" && e.status === "taken" && localDay(e.at) === day ? [`${e.suppId}|${answerSlot(e, supplements.find((x) => x.id === e.suppId))}`] : [])));
  return { total: doses.length, taken: doses.filter((d) => taken.has(d)).length };
}

/** The four numbers. Each one jumps to its detail further down. */
export function Status({ kcal, goalKcal, protein, goalP, cafNow, cafBed, bed, stack }: {
  kcal: number; goalKcal: number; protein: number; goalP: number; cafNow: number; cafBed: number; bed: number; stack: { total: number; taken: number };
}) {
  const left = goalKcal - kcal;
  const tile = (label: string, value: ReactNode, pct: number, color: string, sub: string, target: string) => (
    <button type="button" className="t2-tile" onClick={() => scrollTo(target)} aria-label={`${label}: ${typeof value === "string" ? value : ""} ${sub}`.trim()}>
      <span className="k">{label}</span>
      <b>{value}</b>
      <span className="bar"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} /></span>
      <span className="s">{sub}</span>
    </button>
  );
  return (
    <section className="t2-status" aria-label="Today in numbers">
      {tile("kcal", fmt(Math.abs(left)), (kcal / goalKcal) * 100, "var(--kcal)", left >= 0 ? "left today" : "over goal", "fuel")}
      {tile("Protein", `${fmt(protein)} g`, (protein / goalP) * 100, "var(--pro)", `of ${goalP} g`, "fuel")}
      {tile("Caffeine", <>{cafNow}<small> mg</small></>, cafNow / 4, "var(--caf)", `${cafBed} at ${clock(bed)}`, "caffeine")}
      {stack.total > 0
        ? tile("Stack", <>{stack.taken}<small> / {stack.total}</small></>, (stack.taken / stack.total) * 100, "var(--supp)", stack.taken >= stack.total ? "all taken" : `${stack.total - stack.taken} to go`, "stack")
        : tile("Stack", "–", 0, "var(--supp)", "none set up", "stack")}
    </section>
  );
}

/** The card that follows the clock: its title and colour say which part of the day it's about. */
export function NowCard({ moment, children }: { moment: Moment; children: ReactNode }) {
  return (
    <section className={`t2-now m-${moment}`} aria-label={`Now: ${MOMENT_TITLE[moment]}`}>
      <span className="t2-k">Now · {MOMENT_TITLE[moment]}</span>
      {children}
    </section>
  );
}

/** Evening: caffeine at bed in words, and the day in numbers. */
export function EveningRead({ cafBed, bed, tier, day }: { cafBed: number; bed: number; tier: "low" | "possible" | "higher"; day: { kcal: number | null; protein: number | null; mood: number | null } }) {
  const nums: [string, string][] = [];
  if (day.kcal != null) nums.push([fmt(day.kcal), "kcal today"]);
  if (day.protein != null) nums.push([`${fmt(day.protein)} g`, "protein"]);
  if (day.mood != null) nums.push([day.mood.toFixed(1), "mood, avg"]);
  return (
    <div className="t2-evening">
      <p className="t2-bedcaf">Caffeine at {clock(bed)}: <b>{cafBed === 0 ? "none" : `about ${cafBed} mg`}</b> · <b className={`tier ${tier}`}>{tier === "low" ? "low" : tier === "possible" ? "possible effect" : "higher chance"}</b></p>
      {nums.length > 0 && <div className="t2-daynums">{nums.map(([v, k]) => <span key={k}><b>{v}</b>{k}</span>)}</div>}
    </div>
  );
}

/**
 * Six buttons that never move (owner: "a lot of things that i can manage, quickly one tap log, add
 * coffee"). Coffee logs your usual drink in one tap with Undo; without a usual it asks for one.
 */
export function Pad({ now, onPickUsual, stack }: { now: number; onPickUsual: () => void; stack: { total: number; taken: number } }) {
  const usual = useStore((s) => s.settings.usualDrink);
  const entries = useStore((s) => s.entries);
  const day = localDay(now);
  const todays = entries.filter((e) => localDay(e.at) === day);
  const kcal = todays.reduce((a, e) => a + (e.kind === "food" ? e.macros.kcal : 0), 0);
  const drinks = todays.filter((e) => e.kind === "drink").length;
  const lastFeel = todays.filter((e) => e.kind === "feel").at(-1);
  const weight = todays.filter((e) => e.kind === "weight").at(-1);
  const coffee = () => {
    if (!usual) return onPickUsual();
    const e = act.addEntry({ kind: "drink", at: Date.now(), drinkId: usual.id, name: usual.name, ml: usual.ml, caffeineMg: usual.caffeineMg, alcoholG: usual.alcoholG, kcal: usual.kcal });
    offerUndo([e.id], `Logged ${usual.name} · ${usual.caffeineMg} mg`);
  };
  const btn = (key: string, label: string, hint: string, icon: ReactNode, onClick: () => void, aria?: string) => (
    <button type="button" className={`t2-pad-b p-${key}`} onClick={onClick} aria-label={aria}>
      {icon}<b>{label}</b><span>{hint}</span>
    </button>
  );
  const svg = (color: string, d: ReactNode) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
  return (
    <section className="t2-pad" aria-label="Log in one tap">
      {btn("coffee", usual ? "Coffee" : "Coffee", usual ? `${usual.caffeineMg} mg · ${usual.name}` : "pick usual",
        svg("var(--caf)", <><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17" /><path d="M8 3v3M12 3v3" /></>),
        coffee, usual ? `Log ${usual.name}, ${usual.caffeineMg} mg caffeine` : "Coffee: choose your usual drink")}
      {btn("food", "Food", kcal ? `${fmt(kcal)} kcal` : "or scan", svg("var(--kcal)", <><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10" /><path d="M17 21V3c-2 1.5-3 4-3 7h3" /></>), () => go("log", "food"))}
      {btn("drink", "Drink", drinks ? `${drinks} today` : "water, beer", svg("var(--alc)", <><path d="M6 3h12l-1.6 16.6A1.6 1.6 0 0 1 14.8 21H9.2a1.6 1.6 0 0 1-1.6-1.4z" /><path d="M6.6 9h10.8" /></>), () => go("log", "drink"))}
      {btn("stack", "Stack", stack.total ? `${stack.taken} of ${stack.total}` : "set it up", svg("var(--supp)", <><rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-35 12 12)" /><path d="M9.6 8.6l4.8 6.8" /></>), () => (stack.total ? scrollTo("stack") : go("log", "stack")))}
      {btn("feel", "Feel", lastFeel ? `last ${clock(lastFeel.at)}` : "check in", svg("var(--mood)", <><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5c1 1.2 2.1 1.8 3.5 1.8s2.5-.6 3.5-1.8" /><path d="M9 9.5h.01M15 9.5h.01" /></>), () => scrollTo("feel"))}
      {btn("weigh", "Weigh", weight?.kind === "weight" ? `${weight.kg} today` : "not yet", svg("var(--wt)", <><rect x="3" y="4" width="18" height="16" rx="4" /><path d="M8.5 10a5 5 0 0 1 7 0" /><path d="M12 10l1.2-1.6" /></>), () => go("log", "body"))}
    </section>
  );
}

/** Pick the drink the Coffee button logs (it stays until you ✕ it on the caffeine card). */
export function UsualPicker({ onDone }: { onDone: () => void }) {
  const custom = useStore((s) => s.drinks);
  const pick = (d: Drink) => { act.setSettings({ usualDrink: d }); onDone(); };
  return (
    <div className="card t2-usual">
      <h3>Choose your usual drink <span>the Coffee button logs it</span></h3>
      <div className="drinks">
        {[...custom, ...DRINKS].filter((d) => d.caffeineMg > 0).map((d) => (
          <button key={d.id} type="button" onClick={() => pick(d)}><b>{d.name}</b><span>{d.caffeineMg} mg caffeine</span></button>
        ))}
      </div>
      <div className="row2">
        <button type="button" className="pill-btn" onClick={onDone}>Cancel</button>
        <button type="button" className="pill-btn" onClick={() => go("log", "drink")}>Make your own…</button>
      </div>
    </div>
  );
}

/** Below the fold: what the data says, in one card. */
export function DataCard({ children }: { children: ReactNode }) {
  return (
    <section className="card t2-data" aria-label="From your data">
      <h3>From your data</h3>
      {children}
    </section>
  );
}
