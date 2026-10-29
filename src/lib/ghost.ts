/**
 * Ghost logging (PLAN 177, body lab 9; owner, 27 Oct: "okay?" — and earlier "its still me, still happened … ai should
 * still mostly know what i was doing/eating/drinking", "not really, i eat different stuff"). On days you didn't log
 * (lib/foodgaps: the latest run in the past week), drafts of what you do almost every day: something logged on 7 in 10
 * of your recent logged days — or on 3+ of your last same weekdays — at its usual time; the 2nd coffee counted on its
 * own; supplements grouped by slot. Only what's missing that day. Food you vary never qualifies — by construction, not
 * by guessing. Drafts, not facts: nothing counts until you keep it. Pure.
 */

import { isGap, openGap } from "./foodgaps";
import { bodyDays } from "./tdee";
import { addDays, atMinute, localDay, minuteOfDay } from "./time";
import type { Entry, Supplement } from "./types";

/**
 * history: days looked back from the first day not logged; minLogged: logged days before anything is drafted; share:
 * of those days an item must be on; wdMin / wdShare: or this many of your last same weekdays (looked at: wdLook), and
 * this share of them; maxDays: the last days of the run drafted. A logged day is one whose food isn't a gap (lib/foodgaps)
 * — not "has entries": counting only days with entries would count mostly the days the coffee is on (found by the
 * control test: 11 of 21 days read as 11 of 15).
 */
export const GHOST = { history: 28, minLogged: 7, share: 0.7, wdLook: 6, wdMin: 3, wdShare: 0.75, maxDays: 3 } as const;
export const ghostKey = (day: string) => `ghost:${day}`;
export const GHOST_QUESTION = "Keep the drafts for a day you didn't log?";

/** An entry without its id, kind by kind (a plain Omit over the union loses each kind's own fields). */
type Item = Entry extends infer E ? (E extends Entry ? Omit<E, "id"> : never) : never;
export type Draft = { id: string; day: string; minute: number; title: string; why: string; kcal: number | null; entries: Item[] };

const WD = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b), h = Math.floor(s.length / 2); return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const r5 = (m: number) => Math.round(m / 5) * 5;
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** What an entry is "the same thing" as: a drink or food by name, a supplement by itself and its slot. */
function keyOf(e: Entry, supps: Map<string, Supplement>): string | null {
  if (e.kind === "drink") return `drink:${e.name.toLowerCase()}`;
  if (e.kind === "food") return `food:${e.name.toLowerCase()}`;
  if (e.kind === "supp" && e.status === "taken") { const s = supps.get(e.suppId); return s ? `supp:${e.suppId}:${e.slot ?? s.slot}` : null; }
  return null;
}
const strip = (e: Entry, day: string, minute: number): Item => { const { id: _id, ...rest } = e; return { ...rest, at: atMinute(day, minute) } as Item; };

/** The days to draft (the run of days not logged, its last 3, minus days you've answered) and their drafts. */
export function ghostDrafts(entries: Entry[], supplements: Supplement[], today: string): { days: string[]; drafts: Draft[] } | null {
  const gap = openGap(entries, today, { answered: true });
  if (!gap) return null;
  const answered = new Set(entries.flatMap((e) => (e.kind === "answer" && e.key.startsWith("ghost:") ? [e.key.slice(6)] : [])));
  const days = gap.days.slice(-GHOST.maxDays).filter((d) => !answered.has(d));
  if (!days.length) return null;
  const supps = new Map(supplements.map((s) => [s.id, s]));
  const first = gap.days[0], from = addDays(first, -GHOST.history);
  // logged days before the run: each day's items, in time order
  const byDay = new Map<string, Entry[]>();
  for (const e of entries) { const d = localDay(e.at); if (d >= from && d < first && e.kind !== "answer") (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(e); }
  const full = new Set(bodyDays(entries, from, addDays(first, -1)).filter((d) => !isGap(d.kcal, gap.usual)).map((d) => d.day));
  const logged = [...byDay.keys()].filter((d) => full.has(d)).sort();
  if (logged.length < GHOST.minLogged) return { days, drafts: [] };
  // occurrences: key + its k-th time that day → [day, minute, entry]
  const occ = new Map<string, { day: string; minute: number; e: Entry }[]>();
  for (const d of logged) {
    const seen = new Map<string, number>();
    for (const e of [...byDay.get(d)!].sort((a, b) => a.at - b.at)) {
      const k = keyOf(e, supps); if (!k) continue;
      const n = (seen.get(k) ?? 0) + 1; seen.set(k, n);
      const kk = `${k}#${n}`; (occ.get(kk) ?? occ.set(kk, []).get(kk)!).push({ day: d, minute: minuteOfDay(e.at), e });
    }
  }
  const drafts: Draft[] = [];
  for (const day of days) {
    const wd = new Date(`${day}T12:00:00`).getDay(), sameWd = logged.filter((d) => new Date(`${d}T12:00:00`).getDay() === wd).slice(-GHOST.wdLook);
    const have = new Map<string, number>();
    for (const e of entries) if (localDay(e.at) === day) { const k = keyOf(e, supps); if (k) have.set(k, (have.get(k) ?? 0) + 1); }
    const items: { key: string; minute: number; why: string; n: number; daily: boolean; e: Entry }[] = [];
    for (const [kk, os] of occ) {
      const [k, nth] = [kk.slice(0, kk.lastIndexOf("#")), +kk.slice(kk.lastIndexOf("#") + 1)];
      if ((have.get(k) ?? 0) >= nth) continue;
      const onDays = new Set(os.map((o) => o.day)), all = onDays.size / logged.length;
      const wdOn = sameWd.filter((d) => onDays.has(d)).length;
      const daily = all >= GHOST.share, weekly = sameWd.length > 0 && wdOn >= GHOST.wdMin && wdOn / sameWd.length >= GHOST.wdShare;
      if (!daily && !weekly) continue;
      // the weekday's own times when it's a weekday thing; else every day's
      const pool = daily ? os : os.filter((o) => sameWd.includes(o.day));
      const why = daily ? `your usual — ${onDays.size} of your last ${logged.length} logged days` : `${wdOn} of your last ${sameWd.length} ${WD[wd]}`;
      items.push({ key: k, minute: r5(median(pool.map((o) => o.minute))), why, n: onDays.size, daily, e: pool.at(-1)!.e });
    }
    // supplements: one line per slot
    const slots = new Map<string, typeof items>();
    for (const it of items) {
      if (it.e.kind !== "supp") { const e = it.e; drafts.push({ id: `${day}|${it.key}|${it.minute}`, day, minute: it.minute, title: `${hm(it.minute)} · ${e.kind === "drink" || e.kind === "food" ? e.name : ""}`, why: it.why, kcal: e.kind === "food" ? Math.round(e.macros.kcal) : null, entries: [strip(e, day, it.minute)] }); continue; }
      const slot = it.key.split(":")[2]; (slots.get(slot) ?? slots.set(slot, []).get(slot)!).push(it);
    }
    for (const [slot, its] of slots) {
      const m = Math.min(...its.map((i) => i.minute)), names = its.map((i) => supps.get((i.e as Extract<Entry, { kind: "supp" }>).suppId)!.name);
      // the stack's line says its weakest: "each on 19+ of your last 21 logged days"
      const low = Math.min(...its.map((i) => i.n)), why = its.length === 1 || !its.every((i) => i.daily) ? its[0].why
        : low === logged.length ? `your usual — all of your last ${logged.length} logged days` : `your usual — each on ${low}+ of your last ${logged.length} logged days`;
      drafts.push({ id: `${day}|supp:${slot}`, day, minute: m, title: `${hm(m)} · ${slot.charAt(0).toUpperCase()}${slot.slice(1)} stack: ${names.join(", ")}`, why, kcal: null, entries: its.map((i) => strip(i.e, day, i.minute)) });
    }
  }
  return { days, drafts: drafts.sort((a, b) => a.day.localeCompare(b.day) || a.minute - b.minute) };
}

/**
 * What "Keep" / "None of it" / "Don't remember" logs (null: reform T1, owner, 29 Oct: "if i dont remember something i can
 * just skip, like foods i ate"): each day answered once (ghost:<day>), so it isn't drafted again; nothing else is logged.
 */
export const ghostAnswers = (days: string[], kept: number | null) => days.map((d) => ({ kind: "answer" as const, at: atMinute(d, 12 * 60), key: ghostKey(d), question: GHOST_QUESTION, answer: kept == null ? "don't remember" : kept ? `kept ${kept}` : "none" }));
