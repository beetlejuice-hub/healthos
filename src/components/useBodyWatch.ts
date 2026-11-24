/** This morning's body watch (PLAN 210, lib/bodywatch) for the card and the night check that steps aside for it. */

import { useMemo } from "react";
import { useBand } from "../lib/band-client";
import { bodyWatch, illDays, recordWords, watchRecord, whyOn, type Why } from "../lib/bodywatch";
import { useStore } from "../lib/store";
import { addDays, localDay } from "../lib/time";
import { useDayTable } from "./useDayTable";

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

/** Your answers on the card (PLAN 227): "watch:<day>" → "ill" or "fine". */
export const watchKey = (day: string) => `watch:${day}`;

/** This morning's body watch, or null without the band; with what the log holds (`why`) and its record on you (PLAN 227). */
export function useBodyWatch(now: number) {
  const band = useBand().data, entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), { days, rows, today } = useDayTable(now);
  return useMemo(() => {
    if (!band) return null;
    const out = new Set(days.filter((d) => d.logged && d.alcoholG >= 42).map((d) => d.day));
    const said = new Map(entries.flatMap((e) => (e.kind === "answer" && e.key.startsWith("watch:") ? [[e.key.slice(6), e.answer] as const] : [])));
    const ill = illDays(entries, localDay);
    for (const [d, a] of said) if (a === "ill") ill.add(d);
    const fine = new Set([...said].filter(([, a]) => a === "fine").map(([d]) => d));
    // a big training day: volume in the top quarter of your training days, or an hour or more of cardio
    const vols = days.filter((d) => d.trained && (d.volumeKg ?? 0) > 0).map((d) => d.volumeKg!), q3 = vols.length >= 4 ? [...vols].sort((a, b) => a - b)[Math.floor(vols.length * 0.75)] : Infinity;
    const byDay = new Map(days.map((d) => [d.day, d])), byRow = new Map(rows.map((r) => [r.day, r])), cardio = new Map<string, number>();
    for (const w of workouts) if (w.kind === "cardio" && w.endedAt) cardio.set(localDay(w.startedAt), (cardio.get(localDay(w.startedAt)) ?? 0) + (w.endedAt - w.startedAt) / 60_000);
    const usualAsleep = median(rows.filter((r) => r.day < today && r.asleep != null).slice(-28).map((r) => r.asleep!));
    const why = (d: string): Why[] => { const y = byDay.get(addDays(d, -1)); return whyOn(byRow.get(d), usualAsleep, !!y && ((y.volumeKg ?? 0) >= q3 || (cardio.get(addDays(d, -1)) ?? 0) >= 60)); };
    const w = bodyWatch(band, today, ill, out);
    const rec = watchRecord(band, today, ill, why, fine);
    return { ...w, why: why(today), record: recordWords(rec), answer: said.get(today) ?? null };
  }, [band, entries, workouts, days, rows, today]);
}
