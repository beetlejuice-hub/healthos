/**
 * Settings → Daily goals, with the calorie goal set by hand or from what you burn at a pace (PLAN 95; owner, 15 Oct:
 * "lose fat and gain some muscles why being lean, in like 2-3 months? or faster even"). Numbers from lib/energy via
 * useEnergyPlan; the shell's useEnergyGoal writes the goal. This file only draws.
 */

import { useState } from "react";
import { act, useStore } from "../lib/store";
import { latestWeighIn } from "../lib/body";
import { DEFAULT_ENERGY, PACES, ENERGY, EAT, type Energy, type EatWeek } from "../lib/energy";
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
  const e = st.energy ?? DEFAULT_ENERGY, burnMode = e.mode === "burn", eatMode = e.mode === "eat";
  const plan = useEnergyPlan();
  const num = (v: string) => Number(v.replace(",", ".")) || 0;
  // a pick here is yours: the one-time move to "from what you eat" (27 Oct) never undoes it
  const setE = (patch: Partial<Energy>) => act.setSettings({ energy: { ...e, ...patch, moved: true } });
  const kg = plan.burn?.from === "measured" ? plan.burn.burn.trend.nowKg : weighIn?.kg ?? st.bodyKg;
  const g = plan.goal;

  return (
    <div className="card en">
      <h3>Daily goals <span>used on Today and Insights</span></h3>
      <div className="seg en-seg" role="group" aria-label="Calorie goal">
        <button type="button" aria-pressed={e.mode === "fixed"} onClick={() => setE({ mode: "fixed" })}>By hand</button>
        <button type="button" aria-pressed={eatMode} onClick={() => setE({ mode: "eat", since: eatMode ? e.since : plan.today })}>From what you eat</button>
        <button type="button" aria-pressed={burnMode} onClick={() => setE({ mode: "burn" })}>From your burn</button>
      </div>
      {burnMode && (
        <div className="seg en-seg en-pace" role="group" aria-label="Pace">
          {PACES.map((p) => <button key={p.kg} type="button" aria-pressed={e.pace === p.kg} onClick={() => setE({ pace: p.kg })}>{p.name}<small>{p.kg} kg/wk</small></button>)}
        </div>
      )}
      <div className="row4">
        {(burnMode && g) || (eatMode && plan.eat)
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
      {eatMode && (plan.eat ? <EatWhy weeks={plan.eat.weeks} today={plan.today} />
        : <p className="note">It starts once it knows what you usually eat: needs {plan.need}. Your goal stays {n(goals.kcal)} until then.</p>)}
      {eatMode && <p className="note"><small>Protein {n(goals.p)} g ≈ {(goals.p / kg).toFixed(1)} g per kg of you ({kg.toFixed(1)} kg) — 1.6–2.2 g/kg and lifting go with keeping and building muscle while losing fat.</small></p>}
      {e.mode === "fixed" && g && <p className="note">From what you burn ({n(plan.burn!.kcal)} kcal a day) it would be {n(g.kcal)} at {e.pace} kg a week.</p>}
    </div>
  );
}

const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const kgWeek = (loss: number) => `${loss >= 0 ? "losing" : "gaining"} ${Math.abs(loss).toFixed(2)} kg a week`;

/**
 * Why this week's goal is what it is (PLAN 173; owner, 27 Oct: "learn what i actually eat and try to help do a managable
 * goal"): what you usually eat, what the scale did, the step, and the weeks so far.
 */
function EatWhy({ weeks, today }: { weeks: EatWeek[]; today: string }) {
  const w = weeks.at(-1)!, [lo, hi] = EAT.hold;
  const step = {
    start: <>This week <b>{n(w.kcal)}</b> — what you eat now. Each Monday it steps {EAT.down} lower while the scale isn't dropping {lo} kg a week.</>,
    down: <>This week <b>{n(w.kcal)}</b>, {EAT.down} under last week's: {w.loss == null ? "too few weigh-ins to see you losing" : <>you're {kgWeek(w.loss)}</>} — under your {lo}–{hi}.</>,
    hold: <>This week <b>{n(w.kcal)}</b>, held: you're {kgWeek(w.loss!)}, inside your {lo}–{hi}. What you eat is working.</>,
    up: <>This week <b>{n(w.kcal)}</b>, {EAT.up} up: you're {kgWeek(w.loss!)}, faster than your {hi}.</>,
    "no-data": <>This week <b>{n(w.kcal)}</b>, held: too little logged in the two weeks before to tell what you eat.</>,
  }[w.move];
  const kept = w.kept === "under" ? ` Kept at ${EAT.under} under what you eat, so it's one you can hit.` : w.kept === "over" ? ` Kept at ${EAT.over} over what you eat.` : w.kept === "floor" ? ` Not under ${n(ENERGY.floor)}.` : "";
  const next = addDays(weeks[0].from, 7 * weeks.length);
  return (
    <div className="en-why" aria-label="How the calorie goal is worked out">
      {w.usual != null && <p>You usually eat <b>{n(w.usual)}</b> kcal <small>— the middle of your {w.full} fully logged days in the two weeks before Monday. A day you didn't log is a gap, not a fast: left out.</small></p>}
      <p>{step}{kept && <small>{kept}</small>}</p>
      <p><small>{weeks.length > 1 ? <>Since {day(weeks[0].from)}: {weeks.slice(-6).map((x) => n(x.kcal)).join(" → ")}. </> : null}Next step {day(next <= today ? addDays(today, 7) : next)}.</small></p>
    </div>
  );
}
