/** Start a read's protocol as an experiment you run (the app compares before and during). */

import { act, newId, type Experiment } from "../store";
import type { DigestItem } from "./tasks";
import { localDay } from "../time";

export function startExperiment(p: NonNullable<DigestItem["protocol"]>) {
  const x: Experiment = { id: newId(), name: p.name, how: p.how, days: p.days, measure: p.measure, start: localDay(Date.now()) };
  act.setAi((a) => ({ experiments: [...a.experiments, x] }));
}
