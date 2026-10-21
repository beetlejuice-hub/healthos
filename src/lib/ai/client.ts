/**
 * The app's side of the AI: send a request to the Worker with your session, keep the latest usage
 * (calls today, cost) for Settings, and build the context the AI is told — on demand, at call time.
 */
import { MONTHLY_USD } from "./tasks";
import { gridLines, todayLines, trainingLines } from "./sections";
import { readiness } from "../readiness";
import { heartSigns, nightCheck, nightCheckLines } from "../nightcheck";
import { kgByDay, vo2Trend } from "../vo2";
import { nights } from "../sleep";
import { mainLifts, muscleStrength, sessions, thisWeek } from "../liftstrength";
import type { LoggedSet } from "../training";
import type { EntryOf } from "../types";

import { useSyncExternalStore } from "react";
import { supabase } from "../supabase";
import { getState, type State } from "../store";
import { dailyFacts } from "../insights";
import { notice } from "../findings";
import { scout } from "../scout";
import { bodyDays, weightTrend } from "../tdee";
import { addDays, atMinute, localDay } from "../time";
import { nightsForAi } from "./nights";
import { bandNow } from "../band-client";
import { buildContext, onTodayLines, timeline, totalsLine } from "./context";
import { dayWindow, dayWord } from "./nightread";
import { plateLines } from "../foodscore";
import { workoutLines } from "../workoutread";
import { cardioLine, cardioSpans, cardioWeekLines, maxHrOf, zoneLine } from "../cardio";
import type { AiAnswer, AiRequest, Task, UsageDoc } from "./tasks";
import { currentKg } from "../body";

export type AiStatus = { on: boolean | null; usage: UsageDoc | null; cap: number; budget: number; busy: number };
let status: AiStatus = { on: null, usage: null, cap: 50, budget: MONTHLY_USD, busy: 0 };
const subs = new Set<() => void>();
const set = (p: Partial<AiStatus>) => { status = { ...status, ...p }; subs.forEach((f) => f()); };
export const useAiStatus = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => status);

const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "Europe/Budapest"; } };
async function auth(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { authorization: `Bearer ${data.session.access_token}` } : {};
}

export async function refreshAiStatus() {
  try {
    const r = await fetch(`/api/ai/usage?tz=${encodeURIComponent(tz())}`, { headers: await auth() });
    if (!r.ok) return set({ on: false });
    const b = (await r.json()) as { usage: UsageDoc; cap: number; budget?: number; on: boolean };
    set({ on: b.on, usage: b.usage, cap: b.cap, budget: b.budget ?? MONTHLY_USD });
  } catch { set({ on: false }); }
}

export type AiResult<T> = { ok: true; answer: T; costUsd: number } | { ok: false; error: string; message: string };

export async function askAi<T extends Task>(req: Extract<AiRequest, { task: T }>): Promise<AiResult<AiAnswer<T>>> {
  set({ busy: status.busy + 1 });
  try {
    const r = await fetch(`/api/ai?tz=${encodeURIComponent(tz())}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(await auth()) },
      body: JSON.stringify({ ...req, models: getState().ai.models }),
    });
    const b = (await r.json().catch(() => ({}))) as { answer?: AiAnswer<T>; usage?: UsageDoc; costUsd?: number; error?: string; message?: string };
    if (b.usage) set({ usage: b.usage });
    if (r.status === 503) set({ on: false });
    if (!r.ok || !b.answer) return { ok: false, error: b.error ?? String(r.status), message: b.message ?? b.error ?? "The AI couldn't answer right now." };
    set({ on: true });
    return { ok: true, answer: b.answer, costUsd: b.costUsd ?? 0 };
  } catch {
    return { ok: false, error: "network", message: "Couldn't reach the AI — are you online?" };
  } finally {
    set({ busy: Math.max(0, status.busy - 1) });
  }
}

/** The text the AI is told about you right now (also shown in Settings → AI → What the AI sees). */
export function contextNow(state: State = getState(), now = Date.now(), { slim = false, todaySoFar = true } = {}): string {
  // the chat sees what Today shows from the AI: it isn't posted in the chat any more (owner, 16 Oct)
  const onToday = slim ? onTodayLines(state.ai, now) : [];
  const today = localDay(now), from = addDays(today, -90), to = addDays(today, -1);
  const days = dailyFacts(state.entries, state.workouts, state.settings, from, to);
  const report = notice(state.entries, state.goals, now, currentKg(state.entries, state.settings.bodyKg, now), { workouts: state.workouts, supplements: state.supplements, settings: state.settings });
  const patterns = scout(days, state.supplements, (id) => !!state.scout[id]?.dismissed);
  const t = weightTrend(bodyDays(state.entries, addDays(today, -27), today));
  // the band's nights, when the band has sent some (PLAN 88): the AI used to see the ratings but not one night
  const band = bandNow(), nightsSeen = band && !slim ? nightsForAi({ ...state, halfLifeMin: state.settings.halfLifeMin }, band, now) : [];
  // this morning's readiness, training, and what the grids found (owner, 15 Oct: "make sure app sees all data, organized")
  const sets = state.entries.filter((e): e is EntryOf<"set"> => e.kind === "set") as LoggedSet[];
  const rating = (state.entries.find((e) => e.kind === "sleep" && localDay(e.at) === today && e.rating != null) as { rating?: number } | undefined)?.rating;
  const ready = band ? readiness(today, nights(band.sleep, band.hr, band.rhr, band.hrv), rating, sets, now, { hrv: band.hrv, rhr: band.rhr }) : null;
  const ss = sessions(state.workouts, sets);
  return buildContext({ state, now, days, findings: report.found, patterns, weight: t ? { kg: t.nowKg, perWeek: t.perDay * 7 } : null, nights: nightsSeen,
    // last night's skin temperature, breathing and blood oxygen against your usual, and the night check's line (PLAN 52)
    today: [...todayLines(ready), ...(band && ready ? nightCheckLines(nightCheck(today, band, heartSigns(ready))) : [])], training: [...trainingLines(ss, mainLifts(sets), thisWeek(ss, now), 6, muscleStrength(sets, now)),
      // cardio (PLAN 130): this week's minutes against the weeks before, the last sessions with the band's heart rate
      ...cardioWeekLines(cardioSpans(state.workouts, now), band?.hr ?? [], currentKg(state.entries, 0, now) || null, now, 4, 3, maxHrOf(state.settings)?.bpm),
      // cardio fitness from the band, and which way it's going — split from the kilos while you lose weight (PLAN 52)
      ...[vo2Trend(band?.vo2, today, kgByDay(state.entries))?.line].filter((l): l is string => !!l)], grids: gridLines(state.ai.inbox ?? []), slim, onToday,
    // today from midnight; before 04:00 it was still last night's evening, and says so (#107)
    // the app's own totals first: the AI never adds up the lines itself (PLAN 149)
    ...(todaySoFar ? { todaySoFar: [totalsLine(state.entries, dayWindow(today)[0], now + 1, state.goals), ...timeline(state, atMinute(today, 0), now + 1, (at) => (at < dayWindow(today)[0] ? " (last night, after midnight)" : ""))].filter((l): l is string => !!l) } : {}) });
}

/** The chat's context (PLAN 67 phase 3): the overview only — the AI asks the app's tools for nights, days and the rest. */
export const chatContext = (state: State = getState(), now = Date.now()) => contextNow(state, now, { slim: true });

/** The nightly read-back's context: everything above, plus that day in order with your notes. */
export function nightContext(day: string, state: State = getState(), now = Date.now()): string {
  // the day runs to 04:00: a beer at 00:40 is that evening's; the header says whether it's today, past midnight or
  // yesterday (read back the next morning) — it used to say "Today" for yesterday (#107)
  const [from, to] = dayWindow(day), w = dayWord(day, now);
  // the day's totals as the app counts them, first (PLAN 149: the AI added up the food lines and missed a protein coffee)
  const tot = totalsLine(state.entries, from, Math.min(to, now + 1), state.goals);
  const tl = [...(tot ? [tot] : []), ...timeline(state, from, Math.min(to, now + 1), (at) => (localDay(at) !== day ? " (after midnight)" : ""))];
  // the day's plates with their food scores (PLAN 139): what fit the goal best, and the one swap that would help most
  const plates = plateLines(state.entries, state.foods, day, [from, Math.min(to, now + 1)], state.settings.bedMinute);
  // a workout that day: each lift against the last time, so the read-back can coach it — no call of its own (PLAN 129)
  // …with its heart-rate zones from the band (PLAN 52; owner, 21 Oct: "3 per workout")
  const zhr = bandNow()?.hr ?? [], zmax = maxHrOf(state.settings)?.bpm;
  const lifts = workoutLines(state.workouts ?? [], state.entries.filter((e): e is EntryOf<"set"> => e.kind === "set"), [from, Math.min(to, now + 1)], (a, z) => zoneLine(zhr, a, z, zmax));
  // …and the day's cardio with the band's heart rate, and the week's minutes so far (PLAN 130)
  const spans = cardioSpans(state.workouts ?? [], now), kg = currentKg(state.entries, 0, now) || null, hr = bandNow()?.hr ?? [];
  const today = spans.filter((s) => !s.running && s.start >= from && s.start < Math.min(to, now + 1));
  if (today.length) lifts.push(...today.map((s) => `Cardio: ${cardioLine(s, spans, hr, kg, maxHrOf(state.settings)?.bpm)}`), cardioWeekLines(spans, hr, kg, today[today.length - 1].end, 4, 0)[0]);
  return `${contextNow(state, now, { todaySoFar: false })}\n## The day being read back: ${w.label} (${w.when}), as it happened — it runs to 04:00 the next morning\n${tl.length ? tl.map((l) => `- ${l}`).join("\n") : "- nothing logged"}${plates.length ? `\n## Plates that day, with the app's food score (0–100: goal 45 — protein per 100 kcal; quality 35 — Nutri-Score; timing 20 — hours before bed)\n${plates.map((l) => `- ${l}`).join("\n")}` : ""}${lifts.length ? `\n## The workout that day (each lift against the last time it was done; working sets only)\n${lifts.map((l) => (l.startsWith("- ") ? `  ${l}` : `- ${l}`)).join("\n")}` : ""}`;
}

/** Downscale a photo to ≤1024 px JPEG before sending: cheaper, faster, and plenty to see a plate. */
export async function shrinkImage(file: File, max = 1024): Promise<{ mediaType: "image/jpeg"; data: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return { mediaType: "image/jpeg", data: c.toDataURL("image/jpeg", 0.8).split(",")[1] };
  } finally { URL.revokeObjectURL(url); }
}
