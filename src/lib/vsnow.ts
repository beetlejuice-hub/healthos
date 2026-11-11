/**
 * How you compare, worked out once (PLAN 211, 214): the bars (lib/card) from this week's band and lifts, the line for a
 * small space (lib/norms vsBest), and where you stand out or are behind (lib/vsfix) over 14 days of logging — for the
 * Today card and for the AI's context alike, so both say the same. Pure.
 */

import type { BandData } from "./band";
import { currentKg } from "./body";
import { compareOf, middle, type Stat } from "./card";
import { fitAge, type Sex } from "./fitage";
import type { DayFacts } from "./insights";
import { vsBest } from "./norms";
import { nights } from "./sleep";
import { stepsByDay } from "./steps";
import { overallStrength } from "./strength";
import { addDays } from "./time";
import type { LoggedSet } from "./training";
import type { Entry, EntryOf } from "./types";
import { standOut, type StandItem } from "./vsfix";

export type VsNow = { stats: Stat[]; vs: string | null; stand: { good: StandItem[]; bad: StandItem[] } };

export function vsNow(o: { band: BandData | null; entries: Entry[]; days: DayFacts[]; age?: number | null; sex?: Sex | null; bodyKg: number; today: string; now: number }): VsNow {
  const { band, entries, days, today, now } = o;
  const ns = band ? nights(band.sleep, band.hr, band.rhr, band.hrv) : [];
  const sets = entries.filter((e): e is EntryOf<"set"> => e.kind === "set") as LoggedSet[];
  const steps = band ? stepsByDay(band.steps ?? [], band.hr, today) : new Map<string, number>();
  const week = (d: string) => d <= today && d > addDays(today, -7);
  const stats = compareOf({
    vo2: band ? fitAge(band.vo2, today, o.sex ?? "male")?.vo2 ?? null : null, age: o.age ?? null, sex: o.sex ?? null,
    rhr: band ? middle(Object.entries(band.rhr).filter(([d]) => week(d)).map(([, v]) => v)) : null,
    asleepMin: middle(ns.filter((n) => week(n.day)).map((n) => n.asleep)),
    steps: middle([...steps.entries()].filter(([d, v]) => d < today && d >= addDays(today, -7) && v > 0).map(([, v]) => v)),
    strPerWeek: overallStrength(sets, now).perWeek,
  });
  const night = ns.find((n) => n.day === today);
  const vs = band ? vsBest({ steps: steps.get(addDays(today, -1)) ?? null, sleepMin: night?.asleep ?? null, rhr: band.rhr[today] ?? null }) : null;
  const two = days.filter((d) => d.day < today && d.day >= addDays(today, -14)), logged = two.filter((d) => d.logged), kg = currentKg(entries, o.bodyKg, now);
  const pro = two.map((d) => d.proteinG).filter((v): v is number => v != null && v > 0);
  const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  const stand = standOut(stats, { loggedDays: logged.length, drinksG: logged.length ? (logged.reduce((a, d) => a + d.alcoholG, 0) / logged.length) * 7 : null,
    proteinGkg: pro.length >= 7 && kg ? mean(pro)! / kg : null, kg, caffeineMg: mean(logged.map((d) => d.caffeineMg)) });
  return { stats, vs, stand };
}
