/**
 * Today → the two-week check-in (owner, 6 Oct: "ok" to his ±150 kcal rule run for him). Shows only when
 * it's due and there's an answer; one tap sets the new calorie goal or keeps it. lib/checkin decides.
 */

import { useMemo } from "react";
import { act, useStore } from "../lib/store";
import { checkIn } from "../lib/checkin";

const n = (v: number) => Math.round(v).toLocaleString("en-GB");
/** Calories move with carbs (150 kcal ≈ 38 g); the label and the saved goal use this one number. */
const carbsG = (delta: number) => Math.sign(delta) * Math.round(Math.abs(delta) / 4);

export function CheckInCard({ now }: { now: number }) {
  const entries = useStore((s) => s.entries), goals = useStore((s) => s.goals), settings = useStore((s) => s.settings);
  const last = settings.checkins?.at(-1)?.at;
  const c = useMemo(() => {
    const weights = entries.flatMap((e) => (e.kind === "weight" ? [{ at: e.at, kg: e.kg }] : []));
    const sets = entries.flatMap((e) => (e.kind === "set" ? [e] : []));
    return checkIn(weights, sets, now, goals.kcal, last);
  }, [entries, goals.kcal, now, last]);
  if (!c.due || "need" in c) return null;
  const answer = (apply: boolean) => {
    const kcalAfter = apply ? c.newKcal : c.kcal;
    // Calories move with carbs; protein and fat stay where you set them.
    if (apply && c.delta) act.setGoals({ ...goals, kcal: kcalAfter, c: Math.max(0, goals.c + carbsG(c.delta)) });
    act.setSettings({ checkins: [...(settings.checkins ?? []), { at: Date.now(), lossPerWeek: Math.round(c.lossPerWeek * 100) / 100, kcalBefore: c.kcal, kcalAfter }] });
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
          : <button type="button" className="pill-btn pri" onClick={() => answer(false)}>OK</button>}
      </span>
    </div>
  );
}
