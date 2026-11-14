/**
 * The Sunday story (owner, 14 Nov, item 12 of the open list; canvas https://claude.ai/artifact/XsZti37mimSykHoAWk7fJU, A
 * "full-screen cards"). Sunday from 18:00 to the end of Monday: the week in up to six cards — the week, strength, cardio,
 * sleep, the strongest link, one thing to try (a button starts it as an experiment). Each card only when there's something
 * true to say. Numbers from engines that exist (lib/weekreport, lib/zone2, lib/sleepscore, lib/connect, lib/linkmap);
 * this only picks and words them. Pure.
 */

import type { WeekReport } from "./weekreport";
import { weekParts } from "./weekreport";
import type { LookAt } from "./linkmap";

export const STORY = { fromHour: 18 } as const;
export type StoryCard = { key: string; k: string; h: string; big: string; line: string; act?: { label: string; protocol: { name: string; how: string; days: number; measure: "energy" | "mood" | "focus" | "stress" | "sleep" | "weight" } } };

/** Which week the story is about: this one on Sunday from 18:00, last one on Monday; null otherwise (no story). */
export function storyWeek(now: number): 0 | 1 | null {
  const d = new Date(now), dow = d.getDay();
  if (dow === 0 && d.getHours() >= STORY.fromHour) return 0;
  if (dow === 1) return 1;
  return null;
}

const dm = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}`;

export type StoryIn = {
  report: WeekReport;
  /** the week's nights: asleep (min), score, the morning's day name, bedtime as minutes from 18:00, and weekend or not */
  nights: { asleep: number; score: number; dayName: string; bedEve: number; weekend: boolean }[];
  zone2: { min: number; aim: number } | null;
  link: string | null;
  look: LookAt | null;
  bestBed: string | null;
};

export function storyCards(s: StoryIn): StoryCard[] {
  const r = s.report, p = weekParts(r), out: StoryCard[] = [];
  const a = new Date(r.from), z = new Date(r.to - 1);
  const range = a.getMonth() === z.getMonth() ? `${a.getDate()}–${dm(r.to - 1)}` : `${dm(r.from)}–${dm(r.to - 1)}`;
  // 1 · the week
  const n = r.sessions.length, of = r.planned ? ` of ${r.planned}` : "";
  out.push({ key: "week", k: `Your week · ${range}`, h: n && r.planned && n >= r.planned ? "A full week" : r.pbs ? "A week of new bests" : n ? "A steady week" : "A quiet week", big: String(n),
    line: `session${n === 1 ? "" : "s"}${of}.${p.lifts ? ` ${p.lifts}.` : ""}${p.pbs ? ` ${p.pbs}.` : ""}` });
  // 2 · strength — only with a lift moving
  if (p.lifts || r.pbs) out.push({ key: "strength", k: "Strength", h: r.pbs ? `${r.pbs} new best${r.pbs > 1 ? "s" : ""}` : "Stronger", big: r.pbs ? String(r.pbs) : "↑",
    line: `${p.lifts ?? "Your lifts held"}.${r.next ? ` Next: ${r.next.text}` : ""}` });
  // 3 · cardio — minutes and zone 2
  if (r.cardio.min || s.zone2) {
    const z = s.zone2 ? `${s.zone2.min} of a ${s.zone2.aim}-minute zone-2 aim.` : "";
    out.push({ key: "cardio", k: "Cardio", h: r.cardio.min ? `${r.cardio.min} minutes` : "Zone 2", big: s.zone2 ? String(s.zone2.min) : String(r.cardio.min),
      line: `${r.cardio.min ? `cardio, ${r.cardio.before ? `${r.cardio.min >= r.cardio.before ? "up" : "down"} from ${r.cardio.before} the week before. ` : ""}` : ""}${z}${p.rhr ? ` Resting heart rate ${p.rhr.replace(/^resting HR /, "")}.` : ""}`.trim() });
  }
  // 4 · sleep — the average, the best night, weekends against weekdays
  if (s.nights.length >= 3) {
    const avg = s.nights.reduce((a, x) => a + x.score, 0) / s.nights.length, slept = s.nights.reduce((a, x) => a + x.asleep, 0) / s.nights.length;
    const best = s.nights.reduce((a, x) => (x.score > a.score ? x : a)), we = s.nights.filter((x) => x.weekend), wd = s.nights.filter((x) => !x.weekend);
    const shift = we.length && wd.length ? we.reduce((a, x) => a + x.bedEve, 0) / we.length - wd.reduce((a, x) => a + x.bedEve, 0) / wd.length : 0;
    out.push({ key: "sleep", k: "Sleep", h: `${hm(slept)} a night`, big: String(Math.round(avg)),
      line: `average score. ${best.dayName} was your best (${Math.round(best.score)}).${Math.abs(shift) >= 30 ? ` Weekends started ${hm(Math.abs(shift))} ${shift > 0 ? "later" : "earlier"}.` : ""}` });
  }
  // 5 · the strongest link
  if (s.link) out.push({ key: "link", k: "What went with what", h: "The strongest link", big: "↔", line: `${s.link}.` });
  // 6 · one thing to try: what goes with the slipping outcome, else your best nights' bedtime
  const try1 = s.look?.inputs.find((i) => i.lately === "more" || i.lately == null);
  if (s.look && try1 && /drink/i.test(try1.name)) out.push({ key: "try", k: "Next week, try", h: "Fewer drinks", big: "0", line: `drinks on 5 nights of 7: ${s.look.outcome.name} has been slipping, and drinks go with it.`,
    act: { label: "Start it", protocol: { name: "No drinks on 5 nights", how: "no alcohol on 5 nights of the 7", days: 7, measure: "energy" } } });
  else if (s.bestBed) out.push({ key: "try", k: "Next week, try", h: `In bed by ${s.bestBed}`, big: "5", line: `nights of 7. Your best nights all started by then; the app checks it for you.`,
    act: { label: "Start it", protocol: { name: `In bed by ${s.bestBed}`, how: `in bed by ${s.bestBed} on 5 nights of 7`, days: 7, measure: "sleep" } } });
  return out.slice(0, 6);
}
