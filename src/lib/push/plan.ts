/**
 * Which reminders to send, and when: the next 48 hours, worked out on the phone from what's logged
 * and sent to the server (worker/push.ts), which fires each one at its minute. Re-planned whenever
 * something changes, so a check-in at 12:50 cancels the 13:00 nudge and ticking theanine cancels its
 * reminder. 48 h rather than 24, so a day you don't open the app still gets its reminders.
 * Rules: quiet before 08:00 and from 15 minutes before bedtime; reminders within 30 minutes of each
 * other become one; at most 6 a day.
 */

import type { Entry, Supplement } from "../types";
import { SLOTS, answerSlot, slotsOf } from "../types";
import { atMinute, localDay, addDays } from "../time";
import { dueOn } from "../schedule";
import { slumpOf } from "../bodyclock";
import { caffeineAt } from "../caffeine";
import { caffeineDoses } from "../insights";

export type Reminder = { at: number; title: string; body: string; url: string; tag: string };
/** `slump` (PLAN 177): 15 minutes before your afternoon dip, once your check-ins show one — off unless you turn it on. */
/** `winddown` (owner, 14 Nov, item 9 of the open list): 30 minutes before bedtime — on unless turned off. */
/** `story` (item 12, 14 Nov): Sunday 19:00, your week in six cards — on unless turned off. */
export type NotifyPrefs = { checkins: boolean; supps: boolean; weigh: boolean; slump?: boolean; winddown?: boolean; story?: boolean };
export const DEFAULT_NOTIFY: NotifyPrefs = { checkins: true, supps: true, weigh: true };

export const PLAN = {
  horizonH: 48,
  quietUntil: 8 * 60,
  beforeBed: 15,
  /** How now? nudges, and the evening one. Skipped if you rated in the 2 hours before. */
  checkins: [13 * 60, 17 * 60 + 30, 21 * 60],
  ratedWithinMin: 120,
  /** A slot's reminder comes this long after its time, if anything in it is still unticked. */
  suppAfterMin: 30,
  weighAt: 9 * 60 + 30,
  /** The slump ping comes this long before the slump hour; skipped if you rated in the hour before it. */
  slumpEarly: 15,
  /** The wind-down comes this long before bedtime (the quiet starts 15 minutes before it). */
  windDown: 30,
  storyAt: 19 * 60,
  /** …and says the caffeine still in you at bedtime from this much. */
  windCafMg: 30,
  mergeMin: 30,
  perDay: 6,
};

type Ctx = { now: number; entries: Entry[]; supplements: Supplement[]; bedMinute: number; prefs: NotifyPrefs; halfLifeMin?: number };

export function plan(c: Ctx): Reminder[] {
  const out: Reminder[] = [];
  const today = localDay(c.now);
  const end = c.now + PLAN.horizonH * 3_600_000;
  // the afternoon slump from your energy check-ins (lib/bodyclock), only when it's at least likely
  const slump = c.prefs.slump ? slumpOf(c.entries, today) : null;
  for (let i = 0; i <= 2; i++) {
    const day = addDays(today, i);
    const at = (min: number) => atMinute(day, min);
    const todays = c.entries.filter((e) => localDay(e.at) === day);
    const add = (min: number, r: Omit<Reminder, "at">) => { const t = at(min); if (t > c.now && t <= end) out.push({ ...r, at: t }); };

    if (c.prefs.checkins) for (const m of PLAN.checkins) {
      const t = at(m);
      const rated = c.entries.some((e) => e.kind === "feel" && e.at > t - PLAN.ratedWithinMin * 60_000 && e.at <= t);
      if (!rated) add(m, m >= 20 * 60
        ? { title: "How was today?", body: "Mood, energy, focus, stress: one tap each.", url: "/now", tag: "feel" }
        : { title: "How now?", body: "Mood, energy, focus, stress: one tap each.", url: "/now", tag: "feel" });
    }

    if (c.prefs.supps) for (const slot of SLOTS) {
      const open = c.supplements.filter((s) => s.active && dueOn(s, day) && slotsOf(s).includes(slot.id) && !todays.some((e) => e.kind === "supp" && e.suppId === s.id && answerSlot(e, s) === slot.id));
      if (open.length) add(slot.at + PLAN.suppAfterMin, { title: `${slot.name} stack`, body: `${open.map((s) => `${s.name}${s.dose ? ` ${s.dose}` : ""}`).join(", ")}: tick it once you've had it.`, url: "/#today", tag: `supp-${slot.id}` });
    }

    if (c.prefs.weigh && !todays.some((e) => e.kind === "weight")) add(PLAN.weighAt, { title: "Morning weigh-in", body: "Before food, after the toilet, same as always.", url: "/#today", tag: "weigh" });

    // the Sunday story, 19:00
    if (c.prefs.story !== false && new Date(at(12 * 60)).getDay() === 0) add(PLAN.storyAt, { title: "Your week", body: "Six cards, a minute: strength, cardio, sleep, what went with what, and one thing to try.", url: "/#today/story", tag: "story" });

    // wind down: 30 minutes before bedtime (a bedtime after midnight is the evening before's), with the caffeine left then
    if (c.prefs.winddown !== false) {
      const bed = c.bedMinute < 6 * 60 ? c.bedMinute + 24 * 60 : c.bedMinute, caf = caffeineAt(caffeineDoses(c.entries).filter((d) => d.at <= c.now), at(bed), c.halfLifeMin);
      const hm = `${String(Math.floor(bed / 60) % 24).padStart(2, "0")}:${String(bed % 60).padStart(2, "0")}`;
      add(bed - PLAN.windDown, { title: "Wind down", body: `Bed at ${hm}: lights low, phone away.${caf >= PLAN.windCafMg ? ` About ${Math.round(caf / 10) * 10} mg of caffeine will still be in you then.` : ""}`, url: "/#insights/sleep", tag: "winddown" });
    }

    if (slump) {
      const m = slump.from * 60 - PLAN.slumpEarly, t = at(m), hh = (h: number) => String(h).padStart(2, "0");
      if (!c.entries.some((e) => e.kind === "feel" && e.at > t - 60 * 60_000 && e.at <= t))
        add(m, { title: "Slump in 15 min", body: `Your energy usually dips ${hh(slump.from)}:00–${hh(slump.to)}:00 (${slump.mean.toFixed(1)} vs ${slump.rest.toFixed(1)} the rest of the day).`, url: "/#insights/lab", tag: "slump" });
    }
  }

  // Quiet hours: nothing before 08:00 or from 15 min before bedtime (a bedtime after midnight counts for the evening before).
  const quiet = (t: number) => {
    const d = new Date(t), clock = d.getHours() * 60 + d.getMinutes();
    const bed = c.bedMinute < 6 * 60 ? c.bedMinute + 24 * 60 : c.bedMinute;
    // 00:00–06:00 is still the evening before when bedtime is after midnight (a 00:00 wind-down for 00:30 was dropped as "before 08:00")
    const min = bed >= 24 * 60 && clock < 6 * 60 ? clock + 24 * 60 : clock;
    return min < PLAN.quietUntil || min >= bed - PLAN.beforeBed;
  };
  const kept = out.filter((r) => !quiet(r.at)).sort((a, b) => a.at - b.at);

  // Close ones merge into the earlier one.
  const merged: Reminder[] = [];
  for (const r of kept) {
    const last = merged[merged.length - 1];
    if (last && r.at - last.at <= PLAN.mergeMin * 60_000) merged[merged.length - 1] = { ...last, title: `${last.title} · ${r.title}`, body: `${last.body} ${r.body}`, tag: `${last.tag}+${r.tag}` };
    else merged.push(r);
  }

  // At most 6 a day.
  const perDay = new Map<string, number>();
  return merged.filter((r) => { const d = localDay(r.at), n = (perDay.get(d) ?? 0) + 1; perDay.set(d, n); return n <= PLAN.perDay; });
}
