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

export type Reminder = { at: number; title: string; body: string; url: string; tag: string };
export type NotifyPrefs = { checkins: boolean; supps: boolean; weigh: boolean };
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
  mergeMin: 30,
  perDay: 6,
};

type Ctx = { now: number; entries: Entry[]; supplements: Supplement[]; bedMinute: number; prefs: NotifyPrefs };

export function plan(c: Ctx): Reminder[] {
  const out: Reminder[] = [];
  const today = localDay(c.now);
  const end = c.now + PLAN.horizonH * 3_600_000;
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
      const open = c.supplements.filter((s) => s.active && slotsOf(s).includes(slot.id) && !todays.some((e) => e.kind === "supp" && e.suppId === s.id && answerSlot(e, s) === slot.id));
      if (open.length) add(slot.at + PLAN.suppAfterMin, { title: `${slot.name} stack`, body: `${open.map((s) => `${s.name}${s.dose ? ` ${s.dose}` : ""}`).join(", ")}: tick it once you've had it.`, url: "/#today", tag: `supp-${slot.id}` });
    }

    if (c.prefs.weigh && !todays.some((e) => e.kind === "weight")) add(PLAN.weighAt, { title: "Morning weigh-in", body: "Before food, after the toilet, same as always.", url: "/#today", tag: "weigh" });
  }

  // Quiet hours: nothing before 08:00 or from 15 min before bedtime (a bedtime after midnight counts for the evening before).
  const quiet = (t: number) => {
    const d = new Date(t), min = d.getHours() * 60 + d.getMinutes();
    const bed = c.bedMinute < 6 * 60 ? c.bedMinute + 24 * 60 : c.bedMinute;
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
