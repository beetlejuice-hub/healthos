/**
 * Settings → Daily goals, with the calorie goal set by hand or from what you burn at a pace (PLAN 95; owner, 15 Oct:
 * "lose fat and gain some muscles why being lean, in like 2-3 months? or faster even"). Numbers from lib/energy via
 * useEnergyPlan; the shell's useEnergyGoal writes the goal. This file only draws.
 */

import { useState } from "react";
import { act, useStore } from "../lib/store";
import { latestWeighIn } from "../lib/body";
import { DEFAULT_ENERGY, PACES, ENERGY, type Energy } from "../lib/energy";
import { addDays } from "../lib/time";
import { useEnergyPlan } from "./useEnergy";

const n = (v: number) => Math.round(v).toLocaleString("en-GB");
/** The middle of "2-3 months". */
const WEEKS = 10;
const dateIn = (day: string, days: number) => new Date(`${addDays(day, days)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function DailyGoals() {
  const goals = useStore((s) => s.goals), st = useStore((s) => s.settings);
  const [now] = useState(() => Date.now());
  const weighIn = latestWeighIn(useStore((s) => s.entries), now);
  const e = st.energy ?? DEFAULT_ENERGY, burnMode = e.mode === "burn";
  const plan = useEnergyPlan();
  const num = (v: string) => Number(v.replace(",", ".")) || 0;
  const setE = (patch: Partial<Energy>) => act.setSettings({ energy: { ...e, ...patch } });
  const kg = plan.burn?.from === "measured" ? plan.burn.burn.trend.nowKg : weighIn?.kg ?? st.bodyKg;
  const g = plan.goal;

  return (
    <div className="card en">
      <h3>Daily goals <span>used on Today and Insights</span></h3>
      <div className="seg en-seg" role="group" aria-label="Calorie goal">
        <button type="button" aria-pressed={!burnMode} onClick={() => setE({ mode: "fixed" })}>Set by hand</button>
        <button type="button" aria-pressed={burnMode} onClick={() => setE({ mode: "burn" })}>From your burn</button>
      </div>
      {burnMode && (
        <div className="seg en-seg en-pace" role="group" aria-label="Pace">
          {PACES.map((p) => <button key={p.kg} type="button" aria-pressed={e.pace === p.kg} onClick={() => setE({ pace: p.kg })}>{p.name}<small>{p.kg} kg/wk</small></button>)}
        </div>
      )}
      <div className="row4">
        {burnMode && g
          ? <div className="field en-auto" data-auto="kcal">kcal<b>{n(goals.kcal)}</b><small>auto</small></div>
          : <label className="field">kcal<input inputMode="numeric" value={goals.kcal} onChange={(ev) => act.setGoals({ ...goals, kcal: num(ev.target.value) })} /></label>}
        <label className="field">Protein g<input inputMode="numeric" value={goals.p} onChange={(ev) => act.setGoals({ ...goals, p: num(ev.target.value) })} /></label>
        <label className="field">Carbs g<input inputMode="numeric" value={goals.c} onChange={(ev) => act.setGoals({ ...goals, c: num(ev.target.value) })} /></label>
        <label className="field">Fat g<input inputMode="numeric" value={goals.f} onChange={(ev) => act.setGoals({ ...goals, f: num(ev.target.value) })} /></label>
      </div>
      {burnMode && (plan.burn && g ? (
        <div className="en-why" aria-label="How the calorie goal is worked out">
          <p>
            You burn about <b>{n(plan.burn.kcal)}</b> kcal a day{" "}
            {plan.burn.from === "measured"
              ? <small>— measured: {plan.burn.burn.days} days of food against your weight trend (90% range {n(plan.burn.burn.lo)}–{n(plan.burn.burn.hi)})</small>
              : <small>— the band's average over {plan.burn.days} days, until your own burn is measured ({ENERGY.measuredDays / 7} weeks of food and weigh-ins). Bands often count high; your check-ins correct it.</small>}
          </p>
          <p>
            Goal <b>{n(g.kcal)}</b>: {n(g.cut)} under it → about <b>{g.perWeek.toFixed(2)} kg a week</b>, ~{(g.perWeek * WEEKS).toFixed(1)} kg by {dateIn(plan.today, WEEKS * 7)}.
            {g.capped && <small> Capped at a quarter of your burn.</small>}
            {g.floored && <small> Not under {n(ENERGY.floor)}.</small>}
          </p>
          {e.offset !== 0 && (
            <p>Check-ins moved it <b>{e.offset > 0 ? "+" : "−"}{Math.abs(e.offset)}</b>.{" "}
              <button type="button" className="linkish" onClick={() => setE({ offset: 0 })}>Reset</button></p>
          )}
          <p><small>Protein {n(goals.p)} g ≈ {(goals.p / kg).toFixed(1)} g per kg of you ({kg.toFixed(1)} kg). Losing fat while keeping and building muscle goes with 1.6–2.2 g/kg and lifting. The two-week check-in still runs your rule: outside 0.3–0.7 kg a week, or lifts dropping, it moves the goal 150.</small></p>
        </div>
      ) : (
        <p className="note">No burn to work from yet: needs {plan.need}. Your goal stays {n(goals.kcal)} until then.</p>
      ))}
      {!burnMode && g && <p className="note">From what you burn ({n(plan.burn!.kcal)} kcal a day) it would be {n(g.kcal)} at {e.pace} kg a week.</p>}
    </div>
  );
}
