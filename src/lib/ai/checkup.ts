/**
 * A check-up now and then (PLAN 135; owner, 20 Oct: "it should also do a checkup from time to time, like how you been,
 * have u experienced X, also ask based on my health markers that i or the band shares"). Due a week after the last one
 * was answered (an answer whose key starts "checkup"); the daily questions then get this section: the markers of the last
 * 7 days against the 4 weeks before — the band's resting heart rate and HRV, the morning sleep rating — so one question
 * can be "how have you been", or about a marker that moved. No call of its own. Pure.
 */

import type { Entry } from "../types";
import { addDays, localDay } from "../time";

export const CHECKUP = { everyDays: 7, weekDays: 7, baseDays: 28, minDays: 3 };

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

/** The section, or nothing when a check-up was answered in the last 7 days. */
export function checkupLines(entries: Entry[], band: { rhr: Record<string, number>; hrv: Record<string, number> } | null, now: number): string[] {
  const answered = entries.filter((e) => e.kind === "answer" && e.key.startsWith("checkup")).reduce((m, e) => Math.max(m, e.at), 0);
  if (answered && now - answered < CHECKUP.everyDays * 86_400_000) return [];
  const today = localDay(now), weekFrom = addDays(today, -CHECKUP.weekDays), baseFrom = addDays(weekFrom, -CHECKUP.baseDays);
  const split = (byDay: Record<string, number>) => {
    const ds = Object.entries(byDay).filter(([d, v]) => d < today && Number.isFinite(v));
    const wk = ds.filter(([d]) => d >= weekFrom).map(([, v]) => v), base = ds.filter(([d]) => d >= baseFrom && d < weekFrom).map(([, v]) => v);
    return wk.length >= CHECKUP.minDays && base.length >= CHECKUP.minDays ? { wk: mean(wk), base: mean(base) } : null;
  };
  const rating: Record<string, number> = {};
  for (const e of entries) if (e.kind === "sleep" && e.rating != null) rating[localDay(e.at)] = e.rating;
  const sg = (v: number, d = 0) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;
  const m = [
    ["resting heart rate", band ? split(band.rhr) : null, "bpm", 0],
    ["HRV", band ? split(band.hrv) : null, "ms", 0],
    ["sleep rating", split(rating), "/10", 1],
  ] as const;
  const moved = m.flatMap(([name, x, unit, d]) => (x ? [`${name} ${x.wk.toFixed(d)} vs ${x.base.toFixed(d)} ${unit} (${sg(x.wk - x.base, d)})`] : []));
  return [
    `## Check-up due (${answered ? `last one answered ${Math.round((now - answered) / 86_400_000)} days ago` : "none yet"})`,
    `- Markers, the last 7 days against the 4 weeks before: ${moved.length ? moved.join("; ") : "not enough data yet"}`,
  ];
}
