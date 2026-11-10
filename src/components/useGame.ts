/**
 * The game's inputs from the store and the band, once for Today's week card and the game page (PLAN 204): the week, its
 * history, the boss, the ghosts, the season — lib/play — and the player card now and 4 weeks ago — lib/card. Only reads.
 */

import { useMemo } from "react";
import { useBand } from "../lib/band-client";
import { cardOf, middle, type Card } from "../lib/card";
import { fitAge } from "../lib/fitage";
import type { Inputs } from "../lib/game";
import { gameOf, type Game, type Past } from "../lib/play";
import { clockH, nights, type Night } from "../lib/sleep";
import { stepsByDay } from "../lib/steps";
import { useStore } from "../lib/store";
import { overallStrength } from "../lib/strength";
import { addDays, DAY, localDay } from "../lib/time";
import type { LoggedSet } from "../lib/training";
import type { EntryOf } from "../lib/types";

export type GameView = { game: Game | null; inp: Inputs; card: Card; was: Card; ns: Night[] };

const within = (rec: Record<string, number>, end: string, n: number) => Object.entries(rec).filter(([d]) => d <= end && d > addDays(end, -n)).map(([, v]) => v);
/** The points you kept over your last 4 finished weeks, before `end`. */
const keptBy = (past: Past[], end: string) => { const ws = past.filter((w) => addDays(w.from, 6) < end).slice(-4); return ws.length ? ws.reduce((a, w) => a + w.points, 0) / ws.length : null; };

export function useGame(now: number): GameView {
  const entries = useStore((s) => s.entries), supplements = useStore((s) => s.supplements), workouts = useStore((s) => s.workouts), goalP = useStore((s) => s.goals.p);
  const age = useStore((s) => s.settings.age), sex = useStore((s) => s.settings.sex);
  const band = useBand().data, today = localDay(now);
  const ns = useMemo(() => (band ? nights(band.sleep, band.hr, band.rhr, band.hrv) : []), [band]);
  const inp = useMemo<Inputs>(() => ({ entries, supplements, workouts, beds: ns.map((n) => ({ eve: n.eve, h: clockH(n.bed, n.eve) })), proteinGoal: goalP }), [entries, supplements, workouts, ns, goalP]);
  const game = useMemo(() => gameOf(today, inp), [today, inp]);
  const sets = useMemo(() => entries.filter((e): e is EntryOf<"set"> => e.kind === "set") as LoggedSet[], [entries]);
  const steps = useMemo(() => (band ? stepsByDay(band.steps ?? [], band.hr, today) : new Map<string, number>()), [band, today]);
  const cardAt = useMemo(() => (end: string, at: number) => {
    const vo2 = band ? fitAge(band.vo2, end, sex ?? "male")?.vo2 ?? null : null;
    const asleep = middle(ns.filter((n) => n.day <= end && n.day > addDays(end, -7)).map((n) => n.asleep));
    // steps from whole days: yesterday back, today's still going
    const st = middle([...steps.entries()].filter(([d, v]) => d < end && d >= addDays(end, -7) && v > 0).map(([, v]) => v));
    return cardOf({ vo2, age: age ?? null, sex: sex ?? null, rhr: band ? middle(within(band.rhr, end, 7)) : null, asleepMin: asleep, steps: st,
      strPerWeek: overallStrength(sets, at).perWeek, kept: game ? keptBy(game.past, end) : null });
  }, [band, ns, steps, sets, age, sex, game]);
  const card = useMemo(() => cardAt(today, now), [cardAt, today, now]);
  const was = useMemo(() => cardAt(addDays(today, -28), now - 28 * DAY), [cardAt, today, now]);
  return { game, inp, card, was, ns };
}
