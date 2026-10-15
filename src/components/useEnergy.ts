/**
 * The calorie goal that follows what you burn (PLAN 95; lib/energy decides). Once a day — on the first open, or when the
 * pace, the check-ins' offset or where the burn comes from changes — it writes the goal into Daily goals, carbs moving
 * with it, so Today, Noticed and the AI all read the same number. Never mid-day: logging lunch doesn't move the goal.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { act, getState, useStore } from "../lib/store";
import { useBand } from "../lib/band-client";
import { energyPlan, withKcal, DEFAULT_ENERGY, type EnergyPlan } from "../lib/energy";
import { localDay } from "../lib/time";

/** Today's date, kept current across midnight while the app stays open. */
function useToday(): string {
  const [day, setDay] = useState(() => localDay(Date.now()));
  useEffect(() => {
    const on = () => setDay(localDay(Date.now()));
    const t = setInterval(on, 60_000);
    document.addEventListener("visibilitychange", on);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", on); };
  }, []);
  return day;
}

/** The plan as Settings shows it (computed whatever the mode, so "From what you burn" can say what it would be). */
export function useEnergyPlan(): EnergyPlan & { today: string } {
  const entries = useStore((s) => s.entries), energy = useStore((s) => s.settings.energy) ?? DEFAULT_ENERGY;
  const bandKcal = useBand().data?.kcal, today = useToday();
  const plan = useMemo(() => energyPlan(entries, bandKcal, today, energy), [entries, bandKcal, today, energy]);
  return { ...plan, today };
}

/** In the shell: writes the goal while the mode is "from what you burn". */
export function useEnergyGoal(): void {
  const energy = useStore((s) => s.settings.energy);
  const plan = useEnergyPlan();
  const done = useRef("");
  const on = energy?.mode === "burn";
  const key = on && plan.goal && plan.burn ? `${plan.today}|${energy.pace}|${energy.offset}|${plan.burn.from}` : "";
  const kcal = plan.goal?.kcal;
  useEffect(() => {
    if (!key || kcal == null || done.current === key) return;
    done.current = key;
    const next = withKcal(getState().goals, kcal);
    if (next) act.setGoals(next);
  }, [key, kcal]);
}
