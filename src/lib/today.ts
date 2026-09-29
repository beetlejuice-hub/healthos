/**
 * The Today screen's "Now" list: only what needs you, and it empties as you act.
 *
 * Every item is arithmetic over what you logged — no guesses. An item names what it's about and
 * offers the one action that settles it.
 */

import type { Entry, Goals, Supplement } from "./types";
import { caffeineAt, latestDoseFor, type Dose } from "./caffeine";
import { atMinute, clock, localDay, minuteOfDay } from "./time";

export type NowItem =
  | { id: string; kind: "supp-missed" | "supp-due"; suppId: string; title: string; body: string }
  | { id: string; kind: "caffeine"; title: string; body: string }
  | { id: string; kind: "food"; title: string; body: string }
  | { id: string; kind: "feel"; title: string; body: string };

export type NowContext = {
  now: number;
  entries: Entry[];
  supplements: Supplement[];
  goals: Goals;
  /** Bedtime, minutes from midnight. */
  bedMinute: number;
  /** Most caffeine you want left at bedtime. */
  caffeineTargetMg: number;
  halfLifeMin: number;
  /** The drink the cut-off is phrased around — your usual coffee. */
  coffeeMg: number;
};

const MISSED_AFTER_MIN = 30, DUE_WITHIN_MIN = 60;

export function nowItems(c: NowContext): NowItem[] {
  const day = localDay(c.now), nowMin = minuteOfDay(c.now);
  const todays = c.entries.filter((e) => localDay(e.at) === day);
  const out: NowItem[] = [];

  // Supplements: missed ones first, then ones due soon. A skip is an answer too.
  for (const s of c.supplements.filter((s) => s.active).sort((a, b) => a.at - b.at)) {
    const answered = todays.some((e) => e.kind === "supp" && e.suppId === s.id);
    if (answered) continue;
    if (nowMin > s.at + MISSED_AFTER_MIN) out.push({ id: `supp:${s.id}`, kind: "supp-missed", suppId: s.id, title: `${s.name} ${s.dose}`.trim(), body: `Not ticked yet — usually ${clockOf(s.at)}.` });
    else if (nowMin >= s.at - DUE_WITHIN_MIN) out.push({ id: `supp:${s.id}`, kind: "supp-due", suppId: s.id, title: `${s.name} ${s.dose}`.trim(), body: `Due at ${clockOf(s.at)}.` });
  }

  // Caffeine cut-off, only while bedtime is still ahead.
  const bed = atMinute(day, c.bedMinute);
  if (c.now < bed) {
    const doses: Dose[] = c.entries.filter((e): e is Extract<Entry, { kind: "drink" }> => e.kind === "drink" && e.caffeineMg > 0 && e.at <= c.now).map((e) => ({ at: e.at, mg: e.caffeineMg }));
    const atBed = caffeineAt(doses, bed, c.halfLifeMin);
    const latest = latestDoseFor(doses, bed, c.coffeeMg, c.caffeineTargetMg, c.halfLifeMin);
    const withOne = Math.round(caffeineAt([...doses, { at: c.now, mg: c.coffeeMg }], bed, c.halfLifeMin));
    if (latest === null) {
      out.push({ id: "caffeine", kind: "caffeine", title: "Over your caffeine target for tonight", body: `About ${Math.round(atBed)} mg will still be in you at ${clockOf(c.bedMinute)} (target ${c.caffeineTargetMg} mg). Another coffee would make it ${withOne} mg.` });
    } else if (latest < c.now) {
      out.push({ id: "caffeine", kind: "caffeine", title: `Coffee cut-off was ${clock(latest)}`, body: `A ${c.coffeeMg} mg coffee now leaves about ${withOne} mg at ${clockOf(c.bedMinute)}, over your ${c.caffeineTargetMg} mg target.` });
    } else if (latest - c.now < 90 * 60_000) {
      out.push({ id: "caffeine", kind: "caffeine", title: `Last coffee by ${clock(latest)}`, body: `After that, a ${c.coffeeMg} mg coffee puts you over ${c.caffeineTargetMg} mg at ${clockOf(c.bedMinute)}.` });
    }
  }

  // Food: nothing logged by late morning is worth a nudge; otherwise say where you stand after lunch.
  const foods = todays.filter((e) => e.kind === "food");
  if (!foods.length && nowMin >= 11 * 60) out.push({ id: "food", kind: "food", title: "Nothing eaten logged yet", body: "Log what you've had so today's totals mean something." });

  if (nowMin >= 12 * 60 && !todays.some((e) => e.kind === "feel")) out.push({ id: "feel", kind: "feel", title: "How do you feel?", body: "Ten seconds: energy, mood, focus, stress." });

  return out;
}

const clockOf = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
