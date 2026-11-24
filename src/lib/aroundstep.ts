/**
 * What changed around a step (PLAN 229; owner, 24 Nov: "2,3" — when a measure stepped to a new level, what else changed
 * then, and test it). For a step from lib/changepoint: the 14 days before it against the 14 days from it (at least 5
 * days a side), for the things you do — drinks, caffeine after 14:00, caffeine, training days, training volume, calories,
 * protein, steps, sleep, bedtime, each supplement. Those that moved most (an effect size of 0.8+, Cohen's "large", and a
 * change worth naming) are listed, biggest first, as "goes with": two things changing the same fortnight is a lead, not a
 * cause — which is what "Test it" is for (an experiment in blocks on the measure that stepped). Pure.
 */

import type { DayFacts } from "./insights";
import { addDays } from "./time";
import type { Supplement } from "./types";

export const AROUND = { days: 14, minSide: 5, d: 0.8, show: 4 } as const;
export type Moved = { key: string; name: string; before: number; after: number; d: number; say: string;
  /** An experiment that tests it on the measure that stepped, when it's a thing you can leave out. */
  test?: { name: string; how: string } };

type Thing = { key: string; name: string; of: (d: DayFacts) => number | null; min: number; fmt: (v: number) => string; unit: string; leaveOut?: { name: string; how: string } };

const n1 = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-GB") : (Math.round(v * 10) / 10).toString());
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}`;

function things(supps: Pick<Supplement, "id" | "name">[]): Thing[] {
  return [
    { key: "drinks", name: "drinks", of: (d) => (d.logged ? d.alcoholG / 14 : null), min: 0.3, fmt: (v) => `${n1(v * 7)} a week`, unit: "", leaveOut: { name: "No drinks for 14 days", how: "No alcohol — everything else as usual" } },
    { key: "lateCaf", name: "caffeine after 14:00", of: (d) => (d.logged ? d.lateCaffeineMg : null), min: 40, fmt: (v) => `${Math.round(v)} mg a day`, unit: "mg", leaveOut: { name: "No caffeine after 14:00 for 14 days", how: "Last coffee by 14:00" } },
    { key: "caf", name: "caffeine", of: (d) => (d.logged ? d.caffeineMg : null), min: 80, fmt: (v) => `${Math.round(v)} mg a day`, unit: "mg" },
    { key: "trained", name: "training days", of: (d) => (d.trained ? 1 : 0), min: 0.15, fmt: (v) => `${n1(v * 7)} a week`, unit: "" },
    { key: "volume", name: "training volume", of: (d) => d.volumeKg ?? 0, min: 1500, fmt: (v) => `${Math.round(v * 7).toLocaleString("en-GB")} kg a week`, unit: "kg" },
    // without the drinks' own calories: two beers a night are already "drinks" (the early-patterns engine does the same)
    { key: "kcal", name: "calories", of: (d) => (d.kcal == null ? null : d.kcal - (d.alcKcal ?? 0)), min: 250, fmt: (v) => `${Math.round(v).toLocaleString("en-GB")} kcal a day`, unit: "kcal" },
    { key: "protein", name: "protein", of: (d) => d.proteinG, min: 20, fmt: (v) => `${Math.round(v)} g a day`, unit: "g" },
    { key: "steps", name: "steps", of: (d) => d.steps ?? null, min: 1500, fmt: (v) => `${Math.round(v).toLocaleString("en-GB")} a day`, unit: "" },
    { key: "asleep", name: "sleep", of: (d) => d.asleepMin ?? null, min: 30, fmt: (v) => `${hm(v)} a night`, unit: "min" },
    { key: "bed", name: "bedtime", of: (d) => d.bedLateH ?? null, min: 0.5, fmt: (v) => (Math.abs(v) < 0.1 ? "your usual" : `${Math.round(Math.abs(v) * 60)} min ${v > 0 ? "later" : "earlier"} than usual`), unit: "h" },
    ...supps.map((s): Thing => ({ key: `supp-${s.id}`, name: s.name, of: (d) => (d.taken.has(s.id) ? 1 : d.skipped.has(s.id) ? 0 : null), min: 0.4, fmt: (v) => `${Math.round(v * 7)} days a week`, unit: "",
      leaveOut: { name: `No ${s.name} for 14 days`, how: `Leave out ${s.name} — everything else as usual` } })),
  ];
}

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v: number[]) => { const m = mean(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1)); };

/** What moved most between the fortnight before `day` and the fortnight from it. */
/** The measures a step in is worth explaining: how you are, not what you do (a step in drinks around drinks is circular). */
export const OUTCOME_KEYS = ["rhr", "hrv", "score", "asleep", "regular", "bed", "weight", "mood", "energy", "focus"];
/** A measure's own thing among the candidates (sleep around a sleep step) is left out. */
const SELF: Record<string, string> = { asleep: "asleep", bed: "bed", score: "asleep" };

export function aroundStep(day: string, days: DayFacts[], supps: Pick<Supplement, "id" | "name">[], measure?: string): Moved[] {
  const before = days.filter((d) => d.day >= addDays(day, -AROUND.days) && d.day < day), after = days.filter((d) => d.day >= day && d.day < addDays(day, AROUND.days));
  const out: Moved[] = [];
  for (const t of things(supps)) {
    if (measure && SELF[measure] === t.key) continue;
    const a = before.map(t.of).filter((x): x is number => x != null && Number.isFinite(x)), b = after.map(t.of).filter((x): x is number => x != null && Number.isFinite(x));
    if (a.length < AROUND.minSide || b.length < AROUND.minSide) continue;
    const ma = mean(a), mb = mean(b), pooled = Math.sqrt((sd(a) ** 2 + sd(b) ** 2) / 2);
    const diff = mb - ma, dz = pooled > 1e-9 ? diff / pooled : diff !== 0 ? Math.sign(diff) * 10 : 0;
    if (Math.abs(dz) < AROUND.d || Math.abs(diff) < t.min) continue;
    // a supplement taken before and not after (or the other way) reads as started / stopped
    const say = t.key.startsWith("supp-") && (ma < 0.15 || mb < 0.15)
      ? `${t.name} ${mb > ma ? "started" : "stopped"}`
      : `${t.name} ${t.fmt(ma)} → ${t.fmt(mb)}`;
    // only a thing you can leave out is testable — and only when it went up (leaving it out tests the change)
    out.push({ key: t.key, name: t.name, before: ma, after: mb, d: dz, say, ...(t.leaveOut && diff > 0 ? { test: t.leaveOut } : {}) });
  }
  return out.sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, AROUND.show);
}
