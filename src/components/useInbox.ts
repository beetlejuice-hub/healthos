/**
 * The app writes to you (PLAN 102): runs in the app shell. After each band sync or log it looks for a heart-rate stretch
 * worth asking about (and closes asks something since explained); once a day, with the last 30 nights loaded, it reads the
 * Sleep and Heart grids for cells that just turned clear. What to send and the words: lib/inbox.
 */

import { useEffect, useRef } from "react";
import { bandLatest, bandNow, loadBandBefore, useBand } from "../lib/band-client";
import { awakeByDay, heartOutcomes, loggedAround, raisedStretches, whyRaised } from "../lib/heart";
import { usualByHour } from "../lib/hrusual";
import { askable, findings, pickNew, raisedNotice, type Notice } from "../lib/inbox";
import { lanes } from "../lib/insights";
import { tagFactors } from "../lib/lastnight";
import { FACTORS, goesWith, OUTCOMES, suppFactors } from "../lib/sleep";
import { act, getState, useStore } from "../lib/store";
import { addDays, atMinute, localDay, DAY } from "../lib/time";
import { nightsAndEvenings } from "./useNights";

/** The grids' nights: the Sleep and Heart pages open on 30, so a finding is what they show. */
const SPAN = 30;

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
  post(cands, now);
}

export function scanFindings(now: number) {
  const band = bandNow();
  if (!band) return;
  const s = getState(), data = lanes(s.entries.filter((e) => e.at >= now - (SPAN + 3) * DAY), s.workouts, s.supplements, s.settings, now);
  const { ns, evs } = nightsAndEvenings(band, data, s.entries, s.settings.halfLifeMin, now, SPAN);
  act.setAi({ findingsDay: localDay(now) });
  if (ns.length < 10) return;
  // the Heart grid's HRV is the Sleep grid's (the same morning value): one message, not two
  const factors = [...FACTORS, ...suppFactors(s.supplements, evs), ...tagFactors(evs)], heart = heartOutcomes(awakeByDay(band.hr, band.sleep, data.workouts)).filter((o) => o.id !== "hrv");
  post([...findings("sleep", goesWith(ns, evs, { factors, outcomes: OUTCOMES }), factors, OUTCOMES, now), ...findings("heart", goesWith(ns, evs, { factors, outcomes: heart }), factors, heart, now)], now);
}

export function useInbox() {
  const band = useBand().data;
  const entries = useStore((s) => s.entries);
  const findingsDay = useStore((s) => s.ai.findingsDay);
  const asked = useRef(false);
  // asks: shortly after the band syncs or you log something (that may explain one)
  useEffect(() => {
    if (!band) return;
    const t = setTimeout(() => scanAsks(Date.now()), 1500);
    return () => clearTimeout(t);
  }, [band, entries]);
  // findings: once a day, with a month of the band's minutes in (the nights' lowest heart rate needs them)
  useEffect(() => {
    if (!band) return;
    const now = Date.now();
    if (findingsDay === localDay(now)) return;
    if ((band.hr[0]?.[0] ?? now) > now - (SPAN - 1) * DAY && !asked.current) { asked.current = true; void loadBandBefore(now - (SPAN + 2) * DAY); return; }
    const t = setTimeout(() => scanFindings(Date.now()), 4000);
    return () => clearTimeout(t);
  }, [band, findingsDay]);
}
