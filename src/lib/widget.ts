/**
 * The lock-screen widget (owner, 14 Nov, item 10 of the open list: "can we do 10? Can we do lock screen widget?"). A web
 * app can't put anything on the lock screen; Scriptable (free, iOS) can, from a URL. So the app leaves a small snapshot
 * on the server whenever it's open — readiness, last night's score, the stack, today's caffeine doses, the session up
 * next — and the widget reads it with its own key. Caffeine is worked out when the widget asks, so it keeps falling with
 * the app closed. A snapshot from before today says only what still holds. Pure; the script is a string the app shows.
 */

import { caffeineAt, caffeineInBlood, type Dose } from "./caffeine";
import { localDay } from "./time";

export type WidgetSnap = {
  at: number; day: string;
  readiness: { score: number; word: string } | null;
  sleep: number | null;
  stack: { taken: number; total: number } | null;
  doses: Dose[]; halfLifeMin: number;
  /** tonight's bedtime (ms) */ bed: number;
  next: string | null;
  /** the phone's Date.getTimezoneOffset() when it was made (−60 in Budapest in winter): the server runs in UTC */ tz?: number;
};
export type WidgetView = {
  /** minutes since the app last left a snapshot */ ageMin: number; today: boolean;
  readiness: number | null; word: string | null; sleep: number | null;
  stack: string | null; cafNow: number; cafBed: number | null; bedClock: string | null; next: string | null;
};

/** The day and the clock where the phone is (its offset kept in the snapshot), or here when there's none. */
const local = (t: number, tz: number | undefined) => (tz == null ? new Date(t) : new Date(t - tz * 60_000));
const dayOf = (t: number, tz: number | undefined) => (tz == null ? localDay(t) : local(t, tz).toISOString().slice(0, 10));
const hm = (t: number, tz: number | undefined) => { const d = local(t, tz), h = tz == null ? d.getHours() : d.getUTCHours(), m = tz == null ? d.getMinutes() : d.getUTCMinutes(); return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; };

/** What the widget shows at `now` from the last snapshot. Yesterday's readiness, stack and next aren't today's: left out. */
export function widgetView(s: WidgetSnap, now: number): WidgetView {
  const today = s.day === dayOf(now, s.tz), doses = s.doses.filter((d) => d.at <= now);
  const cafNow = Math.round(caffeineInBlood(doses, now, s.halfLifeMin));
  const cafBed = today && s.bed > now ? Math.round(caffeineAt(doses, s.bed, s.halfLifeMin)) : null;
  return {
    ageMin: Math.max(0, Math.round((now - s.at) / 60_000)), today,
    readiness: today ? s.readiness?.score ?? null : null, word: today ? s.readiness?.word ?? null : null, sleep: today ? s.sleep : null,
    stack: today && s.stack && s.stack.total ? `${s.stack.taken}/${s.stack.total}` : null,
    cafNow, cafBed, bedClock: today && s.bed > now ? hm(s.bed, s.tz) : null, next: today ? s.next : null,
  };
}

/** The lines the widget draws, short enough for the lock screen's rectangle: up to three. */
export function widgetLines(v: WidgetView): string[] {
  const a = [v.readiness != null ? `Ready ${v.readiness}` : null, v.sleep != null ? `Sleep ${v.sleep}` : null, v.stack ? `Stack ${v.stack}` : null].filter(Boolean).join(" · ");
  const caf = v.cafBed != null && v.cafBed >= 10 ? `☕ ${v.cafNow} mg · ${v.cafBed} at ${v.bedClock}` : v.cafNow >= 10 ? `☕ ${v.cafNow} mg now` : null;
  return [a || "HealthOS", caf, v.next ? `Next: ${v.next}` : null].filter((x): x is string => !!x).slice(0, 3);
}

/** The Scriptable script, with its URL and key in it. Lock screen: a rectangle of the lines; home screen: the same, larger. */
export function widgetScript(url: string, key: string): string {
  return `// HealthOS on the lock screen — made by HealthOS → Settings → Lock-screen widget. Keep the key private.
const URL_ = ${JSON.stringify(url)};
const KEY = ${JSON.stringify(key)};
let lines = ["HealthOS"], age = "";
try {
  const r = new Request(URL_); r.headers = { authorization: "Bearer " + KEY };
  const j = await r.loadJSON();
  lines = j.lines && j.lines.length ? j.lines : ["HealthOS", j.error || "no data yet — open the app once"];
  age = j.ageMin > 90 ? "app not opened for " + Math.round(j.ageMin / 60) + " h" : "";
} catch (e) { lines = ["HealthOS", "offline"]; }
const w = new ListWidget();
const lock = config.widgetFamily && config.widgetFamily.startsWith("accessory");
lines.forEach((l, i) => { const t = w.addText(l); t.font = i === 0 ? Font.semiboldSystemFont(lock ? 13 : 17) : Font.systemFont(lock ? 12 : 14); t.lineLimit = 1; t.minimumScaleFactor = 0.7; });
if (age && !lock) { const t = w.addText(age); t.font = Font.systemFont(11); t.textOpacity = 0.6; }
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
w.url = "https://healthos.lukacsarnold9.workers.dev/#today";
if (config.runsInWidget) Script.setWidget(w); else await w.presentMedium();
Script.complete();
`;
}
