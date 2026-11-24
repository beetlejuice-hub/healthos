/**
 * What changed around a step (PLAN 229; owner, 24 Nov: "2,3"). On Trends: each step a measure took in the last 45 days
 * (lib/changepoint) with what else moved that fortnight (lib/aroundstep), "goes with", and — for a thing you can leave out,
 * when the step is in something an experiment can measure (resting heart rate, HRV, mood, energy, focus) — "Test it": an
 * experiment in ON/OFF blocks on that measure. Nothing stepped, or nothing moved with it → nothing drawn.
 */

import { useMemo } from "react";
import { aroundStep, OUTCOME_KEYS } from "../lib/aroundstep";
import { startExperiment } from "../lib/ai/experiment";
import { changePoints } from "../lib/changepoint";
import { useStore } from "../lib/store";
import { addDays, localDay } from "../lib/time";
import { useDayTable } from "./useDayTable";
import { useMeasures } from "./TrendWall";

/** Measures a step in can be tested by an experiment (lib/ai/apply MEASURES). */
const TESTABLE: Record<string, "rhr" | "hrv" | "mood" | "energy" | "focus"> = { rhr: "rhr", hrv: "hrv", mood: "mood", energy: "energy", focus: "focus" };
export const STEPS = { lookback: 45, minAfter: 5 } as const;

export type StepAround = { key: string; name: string; unit: string; day: string; step: number; better: 1 | -1 | 0; moved: ReturnType<typeof aroundStep>; measure: string | null };

/** Recent steps and what moved with them — for the card and the AI's context. */
export function useStepsAround(now: number): StepAround[] {
  const measures = useMeasures(now), { days } = useDayTable(now), supps = useStore((s) => s.supplements), today = localDay(now);
  return useMemo(() => measures.filter((m) => OUTCOME_KEYS.includes(m.key)).flatMap((m) =>
    changePoints(m.series, { from: addDays(today, -90), to: today }).filter((c) => c.day >= addDays(today, -STEPS.lookback) && c.day <= addDays(today, -STEPS.minAfter))
      .map((c) => ({ key: m.key, name: m.name, unit: m.unit, day: c.day, step: c.step, better: m.better, moved: aroundStep(c.day, days, supps, m.key), measure: TESTABLE[m.key] ?? null })))
    .filter((s) => s.moved.length > 0), [measures, days, supps, today]);
}

const dm = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const amt = (s: StepAround) => `${s.step > 0 ? "up" : "down"} ${Math.abs(s.step) >= 10 ? Math.round(Math.abs(s.step)) : Math.round(Math.abs(s.step) * 10) / 10}${s.unit && !["/10", "a day"].includes(s.unit) ? ` ${s.unit}` : ""}`;

export function AroundSteps({ now }: { now: number }) {
  // the stored list, then what's running from it: a selector that builds a new array each call loops React (error 185)
  const steps = useStepsAround(now), xs = useStore((s) => s.ai.experiments), running = useMemo(() => xs.filter((x) => !x.ended && !x.verdict).map((x) => x.name), [xs]);
  if (!steps.length) return null;
  return (
    <section className="p w12 around" aria-label="What changed around a step" data-sec="week">
      <h2>What changed around it <span>when a measure stepped to a new level, what else moved that fortnight · goes with, not causes</span></h2>
      {steps.map((s) => (
        <div key={`${s.key}${s.day}`} className="around-step" data-key={s.key} data-tone={s.better === 0 ? "none" : s.step * s.better > 0 ? "better" : "worse"}>
          <b>{s.name} stepped {amt(s)} on {dm(s.day)}</b>
          <ul>{s.moved.map((m) => (
            <li key={m.key} data-moved={m.key}><span>{m.say}</span>
              {s.measure && m.test && (running.includes(m.test.name) ? <small> · being tested</small>
                : <button type="button" className="pill-btn" onClick={() => startExperiment({ name: m.test!.name, how: m.test!.how, days: 14, measure: s.measure as never })}>Test it on {s.name.toLowerCase()}</button>)}</li>))}</ul>
        </div>
      ))}
      <p className="note">The fortnight before each step against the fortnight from it. Two things changing together is a lead; "Test it" runs ON and OFF in alternating blocks so the answer is yours.</p>
    </section>
  );
}
