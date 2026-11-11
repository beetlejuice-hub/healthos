/**
 * New in your data this week (PLAN 209; owner, 11 Nov: "3, 4" — when a ripple, a best-against-worst row or a pair becomes
 * clear, one line on the AI tab; no AI call). Everything the app finds in your days (lib/ripple, lib/bestdays,
 * lib/combos) worked out twice — with every day, and with only the days up to a week ago — and the difference said
 * plainly: New (clear now, wasn't), Stronger (somewhat apart → far apart), Together (a pair that doesn't add up), Faded
 * (was, isn't). Each line says where it lives. Pure.
 */

import { bestDays } from "./bestdays";
import { combos } from "./combos";
import { dayTable, FACTORS, OUTCOMES, type OutcomeKey } from "./daytable";
import type { DayFacts } from "./insights";
import { EVENTS, eventDays, MEASURES, ripple, RIPPLE, RIPPLE_DAYS, rippleFmt, seriesOf, type EventKey, type RippleMeasure } from "./ripple";
import { addDays } from "./time";

type Band = { rhr?: Record<string, number>; hrv?: Record<string, number> } | null;
export type NewKind = "New" | "Stronger" | "Together" | "Faded";
export type NewItem = { kind: NewKind; key: string; say: string; where: "Ripples" | "What makes a day" | "Two things together"; anchor: string };
type Seen = { level: number; say: string; where: NewItem["where"]; anchor: string; pair?: boolean; apart?: number };

const OUTS: OutcomeKey[] = ["focus", "mood", "energy", "sleepRating"];
const upTo = <T,>(o: Record<string, T> | undefined, day: string) => Object.fromEntries(Object.entries(o ?? {}).filter(([d]) => d <= day));

/** What's clear in the days up to `day`, keyed: 2 far apart / clear, 1 somewhat apart, 0 not. */
export function findingsUpTo(days: DayFacts[], band: Band, day: string): Map<string, Seen> {
  const ds = days.filter((d) => d.day <= day), b = band ? { rhr: upTo(band.rhr, day), hrv: upTo(band.hrv, day) } : null, rows = dayTable(ds, b), out = new Map<string, Seen>();
  for (const e of Object.keys(EVENTS) as EventKey[]) {
    const ev = eventDays(ds, e);
    for (const m of Object.keys(MEASURES) as RippleMeasure[]) {
      const r = ripple(ev, seriesOf(ds, b, m), m);
      if (!r) continue;
      const at = r.peak ? RIPPLE_DAYS[RIPPLE.offsets.indexOf(r.peak.at as never)] : "";
      out.set(`ripple:${e}:${m}`, { level: r.clear ? 2 : 0, where: "Ripples", anchor: "ripples",
        say: r.peak ? `After ${EVENTS[e].the}, ${MEASURES[m].name.replace(/^HRV in the morning$/, "HRV").toLowerCase().replace(/^hrv/, "HRV")} ${rippleFmt(m, r.peak.v)} at ${at} (from ${r.n})` : "" });
    }
  }
  for (const o of OUTS) {
    const bd = bestDays(rows, o);
    for (const c of bd?.rows ?? []) out.set(`best:${o}:${c.key}`, { level: c.says === "strongly" ? 2 : c.says === "some" ? 1 : 0, apart: c.apart, where: "What makes a day", anchor: "what-makes-a-day",
      say: `${FACTORS[c.key].name} ${FACTORS[c.key].when} ${c.says === "not" ? "no longer sets" : c.says === "strongly" ? "sets" : "somewhat sets"} your best ${OUTCOMES[o].name.toLowerCase()} days apart` });
    for (const c of combos(rows, o) ?? []) out.set(`pair:${o}:${c.a}:${c.b}`, { level: c.clear ? 2 : 0, where: "Two things together", anchor: "two-things", pair: true, say: c.say.replace(/\.$/, "") });
  }
  return out;
}

/** How far "how far apart" (lib/bestdays, by rank) must move for a best-against-worst row to count as changed — one
 * sitting near a cut would otherwise flip New / Faded from week to week. */
export const MOVE = 0.08;
const moved = (a?: Seen, b?: Seen) => a?.apart == null || b?.apart == null || Math.abs(a.apart - b.apart) >= MOVE;

/** What changed between a week ago and today, the clearest first; at most `max`. */
export function newThisWeek(days: DayFacts[], band: Band, today: string, max = 5): NewItem[] {
  const now = findingsUpTo(days, band, today), then = findingsUpTo(days, band, addDays(today, -7)), items: NewItem[] = [];
  for (const [key, s] of now) {
    const was = then.get(key)?.level ?? 0;
    if (!moved(s, then.get(key))) continue;
    if (s.level === 2 && was < 2 && s.pair) items.push({ kind: "Together", key, say: `${s.say}.`, where: s.where, anchor: s.anchor });
    else if (s.level >= 1 && was === 0) items.push({ kind: "New", key, say: `${s.say}${key.startsWith("ripple") ? " — clear now" : ""}.`, where: s.where, anchor: s.anchor });
    else if (s.level === 2 && was === 1) items.push({ kind: "Stronger", key, say: `${s.say} — far apart now (was: somewhat).`, where: s.where, anchor: s.anchor });
  }
  for (const [key, s] of then) {
    const is = now.get(key);
    if (!moved(s, is)) continue;
    if (s.level >= 1 && (is?.level ?? 0) === 0) items.push({ kind: "Faded", key, where: s.where, anchor: s.anchor,
      say: key.startsWith("best") && is ? `${is.say}.` : key.startsWith("ripple") ? `${s.say.split(" — ")[0]} — no longer clear.` : key.startsWith("pair") ? `${s.say.split(" together")[0]} — now about what the two add up to.` : `${s.say} — no longer.` });
  }
  const order: NewKind[] = ["New", "Together", "Stronger", "Faded"];
  return items.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).slice(0, max);
}

