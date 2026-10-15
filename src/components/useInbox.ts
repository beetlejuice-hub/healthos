/**
 * The app writes to you (PLAN 102): runs in the app shell. After each band sync or log it looks for a heart-rate stretch
 * worth asking about (and closes asks something since explained) and, in the morning, a low readiness to ask about; once
 * a day, with the band's last month loaded, it reads the Sleep, Heart, Mind and Training grids for cells that just turned
 * clear, a grid at a time so a phone doesn't freeze. What to send and the words: lib/inbox.
 */

import { useEffect, useRef } from "react";
import { bandFrom, bandLatest, bandNow, loadBandBefore, useBand } from "../lib/band-client";
import { awakeByDay, heartOutcomes, loggedAround, raisedStretches, whyRaised } from "../lib/heart";
import { usualByHour } from "../lib/hrusual";
import { askable, findings, pickNew, raisedNotice, readinessNotice, type Notice } from "../lib/inbox";
import { AFTER_FACTORS, AFTER_OUTCOMES, afterDays } from "../lib/aftertraining";
import { glanceDays } from "../lib/glance";
import { lanes } from "../lib/insights";
import { tagFactors } from "../lib/lastnight";
import { sessions } from "../lib/liftstrength";
import { mindFactors, mindOutcomes } from "../lib/mind";
import { readiness } from "../lib/readiness";
import { sessionFacts, sessionFactors, SESSION_OUTCOMES } from "../lib/sessionfacts";
import { FACTORS, goesWith, nights, OUTCOMES, suppFactors } from "../lib/sleep";
import { sleepScore } from "../lib/sleepscore";
import { standout } from "../lib/standout";
import type { EntryOf } from "../lib/types";
import { act, getState, useStore } from "../lib/store";
import { addDays, atMinute, localDay, DAY } from "../lib/time";
import { nightsAndEvenings } from "./useNights";

/** The grids' nights: the Sleep, Heart and Mind pages open on 30, so a finding is what they show… */
const SPAN = 30;
/**
 * …and their nights' lowest heart rate needs the band's minutes, so a month of them is loaded. Not the Training page's 90
 * days: held all session, three times the minutes slowed every chart that reads them (found in the e2e). Training's grids
 * read the nights the server always sends (40 days) and the daily HRV and resting HR — no minutes.
 */
const LOAD_DAYS = 32;
/** A breath between grids (each ~60 ms on a laptop, a few times that on a phone). */
const pause = () => new Promise<void>((r) => setTimeout(r, 30));
/** A low morning is asked about until this hour (the morning question's window). */
const READY_UNTIL_H = 14;

/** Adds what's new to the AI doc (synced: the phone and the laptop share it), each id remembered so none comes twice. */
function post(cands: Notice[], now: number) {
  const ai = getState().ai, add = pickNew(cands, ai.inbox ?? [], ai.sent ?? [], now);
  if (add.length) act.setAi((a) => ({ inbox: [...(a.inbox ?? []), ...add].slice(-60), sent: [...(a.sent ?? []), ...add.map((n) => n.id)].slice(-400) }));
}

export function scanAsks(now: number) {
  const band = bandNow();
  if (!band?.hr.length) return;
  const s = getState(), data = lanes(s.entries.filter((e) => e.at >= now - 3 * DAY), s.workouts, s.supplements, s.settings, now);
  const logged = loggedAround(data), latest = Math.min(now, bandLatest() ?? band.hr[band.hr.length - 1][0]), today = localDay(now);
  const cands: Notice[] = [], explained = new Set<string>();
  // yesterday and today, each against its own usual — as the Heart page draws them
  for (const day of [addDays(today, -1), today]) {
    const t0 = atMinute(day, 0), t1 = atMinute(addDays(day, 1), 0), u = usualByHour(band.hr, data.workouts, day);
    for (const r of raisedStretches(band.hr, band.sleep, data.workouts, u, t0, Math.min(t1, now))) {
      const why = whyRaised(r, logged, band.steps ?? [], band.sleep);
      if (why.length) explained.add(`raised:${r.start}`);
      if (askable(r, why, latest, now)) cands.push(raisedNotice(r, now));
    }
  }
  const stale = (n: Notice) => n.kind === "raised" && !n.reply && !n.closed && explained.has(n.id);
  if ((s.ai.inbox ?? []).some(stale)) act.setAi((a) => ({ inbox: (a.inbox ?? []).map((n) => (stale(n) ? { ...n, closed: true } : n)) }));
  // a low morning (owner, 15 Oct): readiness as Today shows it, with what stood out about last night
  if (new Date(now).getHours() < READY_UNTIL_H) {
    const ns = nights(band.sleep, band.hr, band.rhr, band.hrv), n = ns.find((x) => x.day === today);
    const rating = s.entries.find((e) => e.kind === "sleep" && localDay(e.at) === today && e.rating != null) as { rating?: number } | undefined;
    const sets = s.entries.filter((e): e is EntryOf<"set"> => e.kind === "set");
    const r = n ? readiness(today, ns, rating?.rating, sets, now, { hrv: band.hrv, rhr: band.rhr }) : null;
    if (r && n) {
      const evs = nightsAndEvenings(band, data, s.entries, s.settings.halfLifeMin, now, 2), i = evs.ns.findIndex((x) => x.id === n.id);
      const note = readinessNotice(r, i >= 0 ? standout(n, evs.evs[i], ns, sleepScore(n, rating?.rating, ns)) : null, now);
      if (note) cands.push(note);
    }
  }
  post(cands, now);
}

export async function scanFindings(now: number) {
  const band = bandNow();
  if (!band) return;
  const s = getState(), today = localDay(now), data = lanes(s.entries.filter((e) => e.at >= now - (SPAN + 3) * DAY), s.workouts, s.supplements, s.settings, now);
  const { ns, evs, steps } = nightsAndEvenings(band, data, s.entries, s.settings.halfLifeMin, now, SPAN);
  act.setAi({ findingsDay: today });
  const out: Notice[] = [];
  // each grid as its page builds it (the pages need 10 rows before they show one)
  if (ns.length >= 10) {
    // Sleep and Heart; the Heart grid's HRV is the Sleep grid's (the same morning value): one message, not two
    const factors = [...FACTORS, ...suppFactors(s.supplements, evs), ...tagFactors(evs)], heart = heartOutcomes(awakeByDay(band.hr, band.sleep, data.workouts)).filter((o) => o.id !== "hrv");
    out.push(...findings("sleep", goesWith(ns, evs, { factors, outcomes: OUTCOMES }), factors, OUTCOMES, now));
    await pause();
    out.push(...findings("heart", goesWith(ns, evs, { factors, outcomes: heart }), factors, heart, now));
    await pause();
    // Mind: finished days only, the Mind page's rows
    const days = glanceDays(s.entries, s.workouts, s.settings, addDays(today, -119), today), byDay = new Map(days.map((d) => [d.day, d]));
    const mOut = mindOutcomes(new Map(days.filter((d) => d.day < today).map((d) => [d.day, d])));
    const mFac = [...mindFactors(ns, (d) => byDay.get(d)?.trained ?? false, steps), ...[...FACTORS.filter((f) => f.id === "phone"), ...tagFactors(evs)].map((f) => ({ ...f, when: "last night" as const }))];
    out.push(...findings("mind", goesWith(ns, evs, { factors: mFac, outcomes: mOut }), mFac, mOut, now));
    await pause();
  }
  // Training: every session, against the band's nights held
  const sets = s.entries.filter((e): e is EntryOf<"set"> => e.kind === "set"), ss = sessions(s.workouts, sets), all = nights(band.sleep, band.hr, band.rhr, band.hrv);
  if (ss.length >= 10) {
    const facts = sessionFacts(ss, s.entries, all), sFac = sessionFactors(s.supplements, facts);
    out.push(...findings("strength", goesWith(ss, facts, { factors: sFac, outcomes: SESSION_OUTCOMES }), sFac, SESSION_OUTCOMES, now));
    await pause();
    const after = afterDays(ss, all, s.entries);
    if (after.days.length >= 10) out.push(...findings("after", goesWith(after.ns, after.days, { factors: AFTER_FACTORS, outcomes: AFTER_OUTCOMES }), AFTER_FACTORS, AFTER_OUTCOMES, now));
  }
  post(out, now);
}

export function useInbox() {
  const band = useBand().data;
  const entries = useStore((s) => s.entries);
  const findingsDay = useStore((s) => s.ai.findingsDay);
  const asked = useRef(0), planned = useRef<string | null>(null);
  // asks: shortly after the band syncs or you log something (that may explain one)
  useEffect(() => {
    if (!band) return;
    const t = setTimeout(() => scanAsks(Date.now()), 1500);
    return () => clearTimeout(t);
  }, [band, entries]);
  // findings: once a day, with a month of the band's minutes in (the nights' lowest heart rate needs them)
  useEffect(() => {
    if (!band) return;
    const now = Date.now(), today = localDay(now);
    if (findingsDay === today || planned.current === today) return;
    // a load already running (a page's) drops ours: asked again when the band changes, three times at most. Judged by
    // what's been asked for, not the first minute held — a band worn a week has no month to give, and waiting for one
    // never ended (found in the e2e)
    if (bandFrom() > now - (LOAD_DAYS - 1) * DAY && asked.current < 3) { asked.current++; void loadBandBefore(now - LOAD_DAYS * DAY); return; }
    // set once and left to run: cancelled on each band change, a page loading older weeks kept putting it off (found in the e2e)
    planned.current = today;
    setTimeout(() => void scanFindings(Date.now()), 4000);
  }, [band, findingsDay]);
}
