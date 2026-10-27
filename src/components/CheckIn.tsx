/**
 * Today → the two-week check-in (owner, 6 Oct: "ok" to his ±150 kcal rule run for him). Shows only when
 * it's due and there's an answer; one tap sets the new calorie goal or keeps it. lib/checkin decides.
 */

import { useMemo } from "react";
import { act, useStore } from "../lib/store";
import { checkIn, creatineFrom } from "../lib/checkin";
import { bodyFat } from "../lib/bodyfat";
import { carbsG } from "../lib/energy";

const n = (v: number) => Math.round(v).toLocaleString("en-GB");

export function CheckInCard({ now }: { now: number }) {
  const entries = useStore((s) => s.entries), goals = useStore((s) => s.goals), settings = useStore((s) => s.settings), supps = useStore((s) => s.supplements);
  const last = settings.checkins?.at(-1)?.at;
  const c = useMemo(() => {
    const weights = entries.flatMap((e) => (e.kind === "weight" ? [{ at: e.at, kg: e.kg }] : []));
    const sets = entries.flatMap((e) => (e.kind === "set" ? [e] : []));
    // water from creatine, or muscle the scale's body fat can see, isn't read as fat (PLAN 134)
    return checkIn(weights, sets, now, goals.kcal, last, { creatineFrom: creatineFrom(entries, supps), fat: bodyFat(entries, now).change });
  }, [entries, goals.kcal, now, last, supps]);
  // from what you eat, the weekly step is the check-in (PLAN 173)
  if (!c.due || "need" in c || settings.energy?.mode === "eat") return null;
  // a held cut (PLAN 134: creatine's water or muscle on the scale) is still his to make
  const answer = (apply: boolean) => {
    const step = c.delta || c.held || 0, kcalAfter = apply ? c.kcal + step : c.kcal;
    // Calories move with carbs; protein and fat stay where you set them.
    if (apply && step) act.setGoals({ ...goals, kcal: kcalAfter, c: Math.max(0, goals.c + carbsG(step)) });
    // With the goal from your burn, the step is kept on top of it (PLAN 95), so tomorrow's goal doesn't undo it.
    const energy = settings.energy?.mode === "burn" && apply && step ? { energy: { ...settings.energy, offset: settings.energy.offset + step } } : {};
    act.setSettings({ ...energy, checkins: [...(settings.checkins ?? []), { at: Date.now(), lossPerWeek: Math.round(c.lossPerWeek * 100) / 100, kcalBefore: c.kcal, kcalAfter }] });
  };
  return (
    <div className="noticed-line checkin" role="region" aria-label="Two-week check-in">
      <span>
        <small>Two-week check-in</small>
        Weekly average {c.from.toFixed(1)} → {c.to.toFixed(1)} kg: {c.why}.{" "}
        {c.delta ? <>Your rule says <b>{c.delta > 0 ? "add" : "cut"} 150</b>: {n(c.kcal)} → {n(c.newKcal)} kcal.</> : <>Your rule says keep <b>{n(c.kcal)} kcal</b>.</>}
        <small className="sub">{c.delta ? `Carbs move with it (${c.delta > 0 ? "+" : "−"}${Math.abs(carbsG(c.delta))} g); change any goal in Settings. ` : ""}Next check-in in 2 weeks.</small>
      </span>
      <span className="acts">
        {c.delta
          ? <><button type="button" className="pill-btn" onClick={() => answer(false)}>Keep {n(c.kcal)}</button><button type="button" className="pill-btn pri" onClick={() => answer(true)}>Set {n(c.newKcal)}</button></>
          : c.held ? <><button type="button" className="pill-btn" onClick={() => answer(true)}>Cut 150 anyway</button><button type="button" className="pill-btn pri" onClick={() => answer(false)}>Keep {n(c.kcal)}</button></>
          : <button type="button" className="pill-btn pri" onClick={() => answer(false)}>OK</button>}
      </span>
    </div>
  );
}
