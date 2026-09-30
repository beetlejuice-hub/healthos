/**
 * The Today screen's "Now" list: only what needs you, and it empties as you act.
 *
 * Every item is arithmetic over what you logged — no guesses. An item names what it's about and
 * offers the one action that settles it.
 */

import type { Entry, Goals, Supplement } from "./types";
import { SLOTS, slotOf } from "./types";
import { caffeineAt, latestDoseFor, type Dose } from "./caffeine";
import { atMinute, clock, localDay, minuteOfDay } from "./time";

export type NowItem =
  | { id: string; kind: "supp-missed" | "supp-due"; suppIds: string[]; title: string; body: string }
  | { id: string; kind: "caffeine"; title: string; body: string }
  | { id: string; kind: "food"; title: string; body: string };

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

  // Supplements, grouped by their usual time: one card for "the morning stack", not one per pill
  // (owner, first look: "really complex right out of the gate"). A skip is an answer too.
  const open = c.supplements.filter((s) => s.active && !todays.some((e) => e.kind === "supp" && e.suppId === s.id));
  const slots = [...new Set(open.map((s) => s.at))].sort((a, b) => a - b);
  for (const at of slots) {
    const group = open.filter((s) => s.at === at);
    const names = group.map((s) => s.name).join(", ");
    const slotName = SLOTS.find((x) => x.id === slotOf(at))!.name;
    const title = group.length === 1 ? `${group[0].name} ${group[0].dose}`.trim() : `${slotName} stack: ${names}`;
    if (nowMin > at + MISSED_AFTER_MIN) out.push({ id: `supp:${at}`, kind: "supp-missed", suppIds: group.map((s) => s.id), title, body: `Not ticked yet — usually ${clockOf(at)}.` });
    else if (nowMin >= at - DUE_WITHIN_MIN) out.push({ id: `supp:${at}`, kind: "supp-due", suppIds: group.map((s) => s.id), title, body: `Due at ${clockOf(at)}.` });
  }

  // Caffeine cut-off: only on a day you've had caffeine, and only while bedtime is still ahead.
  // Warning about a coffee you haven't had and may not want is noise.
  const bed = atMinute(day, c.bedMinute);
  const hadCaffeine = todays.some((e) => e.kind === "drink" && e.caffeineMg > 0 && e.at <= c.now);
  if (hadCaffeine && c.now < bed) {
    const doses: Dose[] = c.entries.filter((e): e is Extract<Entry, { kind: "drink" }> => e.kind === "drink" && e.caffeineMg > 0 && e.at <= c.now).map((e) => ({ at: e.at, mg: e.caffeineMg }));
    const atBed = caffeineAt(doses, bed, c.halfLifeMin);
    const latest = latestDoseFor(doses, bed, c.coffeeMg, c.caffeineTargetMg, c.halfLifeMin);
    const withOne = Math.round(caffeineAt([...doses, { at: c.now, mg: c.coffeeMg }], bed, c.halfLifeMin));
    if (latest === null) {
      out.push({ id: "caffeine", kind: "caffeine", title: `About ${Math.round(atBed)} mg still in you at bedtime`, body: `That's by your planned bedtime, ${clockOf(c.bedMinute)}. Another one would make it ${withOne} mg.` });
    } else if (latest < c.now) {
      out.push({ id: "caffeine", kind: "caffeine", title: `Coffee cut-off was ${clock(latest)}`, body: `Another one now (${c.coffeeMg} mg) leaves about ${withOne} mg in you at your planned bedtime, ${clockOf(c.bedMinute)}.` });
    } else if (latest - c.now < 90 * 60_000) {
      out.push({ id: "caffeine", kind: "caffeine", title: `Last coffee by ${clock(latest)}`, body: `After that, another one (${c.coffeeMg} mg) leaves over ${c.caffeineTargetMg} mg in you at your planned bedtime, ${clockOf(c.bedMinute)}.` });
    }
  }

  // Food: nothing logged by late morning is worth a nudge; otherwise say where you stand after lunch.
  const foods = todays.filter((e) => e.kind === "food");
  if (!foods.length && nowMin >= 11 * 60) out.push({ id: "food", kind: "food", title: "Nothing eaten logged yet", body: "Log what you've had so today's totals mean something." });

  return out;
}

const clockOf = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
