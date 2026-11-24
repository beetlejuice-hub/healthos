/**
 * Steps and strain, for the AI (PLAN 229; owner, 24 Nov: "2" — the morning read can mention them). Lines for "What the app's
 * own maths found": each step a measure took in the last 45 days (lib/changepoint) with what moved around it
 * (lib/aroundstep), and HRV against its normal band, resting heart rate, this week's load and "strain building" (lib/strain).
 * The AI quotes these; it doesn't work its own. Pure.
 */

import type { BandData } from "../band";
import { aroundStep, OUTCOME_KEYS } from "../aroundstep";
import { changePoints } from "../changepoint";
import type { DayFacts } from "../insights";
import { hrvStatus, strainBuilding, weekLoad } from "../strain";
import { addDays } from "../time";
import type { Measure } from "../trends";
import type { Supplement, Workout } from "../types";

const dm = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const num = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-GB") : String(Math.round(v * 10) / 10));

export function stepLines(measures: Measure[], days: DayFacts[], supps: Pick<Supplement, "id" | "name">[], today: string): string[] {
  return measures.filter((m) => !["strength", "vo2"].includes(m.key)).flatMap((m) => changePoints(m.series, { from: addDays(today, -90), to: today })
    .filter((c) => c.day >= addDays(today, -45))
    .map((c) => {
      const u = m.unit && !["/10", "a day"].includes(m.unit) ? ` ${m.unit}` : "", way = m.better === 0 ? "" : c.step * m.better > 0 ? " (the better way)" : " (the worse way)";
      const moved = c.day <= addDays(today, -5) && OUTCOME_KEYS.includes(m.key) ? aroundStep(c.day, days, supps, m.key) : [];
      return `${m.name} stepped ${c.step > 0 ? "up" : "down"} ${num(Math.abs(c.step))}${u}${way} on ${dm(c.day)} — about ${num(c.before)} the week before, ${num(c.after)} the week after (a change point: a step, not a slope; carry-over allowed for)${moved.length ? `. Around it (the fortnight before against the fortnight from it — goes with, not causes): ${moved.map((x) => x.say).join("; ")}` : ""}`;
    }));
}

export function strainLines(band: BandData | null, workouts: Workout[], today: string, now: number): string[] {
  const s = band ? hrvStatus(band.hrv ?? {}, band.rhr ?? {}, today) : null, st = strainBuilding(s), load = weekLoad(workouts, now), out: string[] = [];
  if (s) out.push(`HRV 7-day average ${Math.round(s.today.avg)} ms — ${s.today.where === "below" ? "under" : s.today.where === "above" ? "over" : "within"} its normal band ${Math.round(s.today.lo)}–${Math.round(s.today.hi)} ms${s.below > 1 ? ` for ${s.below} days` : ""}${s.rhr ? `; resting heart rate 7-day ${Math.round(s.rhr.now)}, normal ${Math.round(s.rhr.usual)}` : ""}`);
  if (st) out.push(`Strain building: HRV under its normal ${s!.below} days${st.rhrUp != null ? `, resting heart rate ${Math.round(st.rhrUp)} bpm over its normal` : ""}${st.swing ? ", swinging more than in the last two months" : ""} — a soft note, never "overtrained"`);
  if (load.week || load.usual) out.push(`Training load this week ${load.week.toLocaleString("en-GB")} (how hard 1–10 × minutes)${load.usual ? `, usual week ${Math.round(load.usual).toLocaleString("en-GB")}` : ""}${load.unrated ? `; ${load.unrated} workouts without "how hard"` : ""}`);
  return out;
}
