import { useMemo } from "react";
import type { BandData } from "../lib/band";
import { caffeineAt } from "../lib/caffeine";
import type { Lanes } from "../lib/insights";
import { evenings, nights, type Evening, type Night } from "../lib/sleep";
import { stepsByDay } from "../lib/steps";
import { DAY, localDay } from "../lib/time";
import type { Entry } from "../lib/types";
import { suppAnswers } from "../lib/suppdays";

/** The band's nights in the last `span` days and what each evening before held, and each worn day's steps — the Sleep, Heart and Mind pages share them. */
export function useNights(band: BandData | null, data: Lanes, entries: Entry[], halfLifeMin: number, now: number, span: number): { ns: Night[]; evs: Evening[]; steps: Map<string, number> } {
  const today = localDay(now);
  const steps = useMemo(() => (band ? stepsByDay(band.steps ?? [], band.hr, today) : new Map<string, number>()), [band, today]);
  const all = useMemo(() => (band ? nights(band.sleep, band.hr, band.rhr, band.hrv) : []), [band]);
  const ns = useMemo(() => all.filter((n) => n.up >= now - span * DAY && n.up <= now), [all, now, span]);
  const evs = useMemo(() => eveningsOf(ns, data, entries, halfLifeMin, steps), [ns, data, entries, halfLifeMin, steps]);
  return { ns, evs, steps };
}

/** The same, without React (the inbox's daily look at the grids, PLAN 102). */
export function nightsAndEvenings(band: BandData, data: Lanes, entries: Entry[], halfLifeMin: number, now: number, span: number): { ns: Night[]; evs: Evening[]; steps: Map<string, number> } {
  const steps = stepsByDay(band.steps ?? [], band.hr, localDay(now));
  const ns = nights(band.sleep, band.hr, band.rhr, band.hrv).filter((n) => n.up >= now - span * DAY && n.up <= now);
  return { ns, evs: eveningsOf(ns, data, entries, halfLifeMin, steps), steps };
}

function eveningsOf(ns: Night[], data: Lanes, entries: Entry[], halfLifeMin: number, steps: Map<string, number>): Evening[] {
  return evenings(ns, {
    drinks: data.drinks, caffeineAt: (t) => caffeineAt(data.doses.map((d) => ({ at: d.at, mg: d.mg })), t, halfLifeMin),
    workouts: data.workouts, meals: entries.filter((e) => e.kind === "food"), ratings: entries.flatMap((e) => (e.kind === "sleep" ? [{ at: e.at, rating: e.rating }] : [])), steps,
    sleeps: entries.filter((e) => e.kind === "sleep"),
    // PLAN 88: the evening's food, a late workout, evening stress, supplement answers
    foods: entries.flatMap((e) => (e.kind === "food" ? [{ at: e.at, kcal: e.macros.kcal, c: e.macros.c }] : [])),
    sessions: data.workouts.map((w) => ({ start: w.start, end: w.end })),
    checks: entries.flatMap((e) => (e.kind === "feel" && e.stress != null ? [{ at: e.at, stress: e.stress }] : [])),
    supps: suppAnswers(entries), // not logged = not taken (owner, 20 Oct)
  });
}
