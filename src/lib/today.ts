/**
 * The Today screen's "Now" list: only what needs you, and it empties as you act.
 *
 * Every item is arithmetic over what you logged — no guesses. An item names what it's about and
 * offers the one action that settles it.
 */

import type { Entry, Goals, Slot, Supplement } from "./types";
import { answerSlot, SLOTS, slotsOf } from "./types";
import { caffeineAt, latestDoseFor, type Dose } from "./caffeine";
import { atMinute, clock, localDay, minuteOfDay } from "./time";

export type NowItem =
  | { id: string; kind: "supp-missed" | "supp-due"; slot: Slot; suppIds: string[]; title: string; body: string }
  | { id: string; kind: "caffeine"; title: string; body: string }
  | { id: string; kind: "food"; title: string; body: string }
  | { id: string; kind: "feel"; title: string; body: string }
  | { id: string; kind: "weight"; title: string; body: string; lastKg: number | null }
  | { id: string; kind: "restock"; title: string; body: string; low: string[]; out: string[] };

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
  // A supplement taken in two slots (theanine with each coffee) is due twice, each answered on its own.
  const answered = new Set(todays.flatMap((e) => (e.kind === "supp" ? [`${e.suppId}|${answerSlot(e, c.supplements.find((x) => x.id === e.suppId))}`] : [])));
  for (const slot of SLOTS) {
    const group = c.supplements.filter((s) => s.active && slotsOf(s).includes(slot.id) && !answered.has(`${s.id}|${slot.id}`));
    if (!group.length) continue;
    const at = slot.at, names = group.map((s) => s.name).join(", ");
    const title = group.length === 1 ? `${group[0].name} ${group[0].dose}`.trim() : `${slot.name} stack: ${names}`;
    if (nowMin > at + MISSED_AFTER_MIN) out.push({ id: `supp:${at}`, kind: "supp-missed", slot: slot.id, suppIds: group.map((s) => s.id), title, body: `Not ticked yet — usually ${clockOf(at)}.` });
    else if (nowMin >= at - DUE_WITHIN_MIN) out.push({ id: `supp:${at}`, kind: "supp-due", slot: slot.id, suppIds: group.map((s) => s.id), title, body: `Due at ${clockOf(at)}.` });
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

  // Running low / ran out: a gentle shopping reminder, and a way to say it's back.
  const low = c.supplements.filter((x) => x.active && x.status === "low");
  const gone = c.supplements.filter((x) => !x.active && x.status === "out");
  const names = (l: Supplement[]) => l.map((x) => x.name).join(", ");
  if (gone.length) out.push({ id: "restock", kind: "restock", title: `Out of ${names(gone)}${low.length ? ` · low on ${names(low)}` : ""}`, body: "Restocked? Tap it and it's back on Today. The days without it are useful: they show what it does.", low: low.map((x) => x.id), out: gone.map((x) => x.id) });
  else if (low.length) out.push({ id: "restock", kind: "restock", title: `Running low: ${names(low)}`, body: "Buy more soon. If it runs out, tap Out — the days off are useful too.", low: low.map((x) => x.id), out: [] });

  // Morning weigh-in: the real-burn and weight-trend cards are built from these.
  if (nowMin >= 5 * 60 && nowMin < 11 * 60 && !todays.some((e) => e.kind === "weight")) {
    const last = c.entries.reduce<{ at: number; kg: number } | null>((b, e) => (e.kind === "weight" && (!b || e.at > b.at) ? { at: e.at, kg: e.kg } : b), null);
    out.push({ id: "weight", kind: "weight", title: "Morning weigh-in", body: "Before breakfast is most comparable. Your real burn and weight trend are built from these.", lastKg: last?.kg ?? null });
  }

  // Evening check-in (owner: "a card on the main page"): the outcome Noticed compares everything with.
  if (nowMin >= FEEL_FROM_MIN && !todays.some((e) => e.kind === "feel")) out.push({ id: "feel", kind: "feel", title: "How was today?", body: "10 seconds: energy, mood, focus, anxiety, stress. It's what Noticed compares food, caffeine and your stack against." });

  return out;
}

export const FEEL_FROM_MIN = 19 * 60;

const clockOf = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
