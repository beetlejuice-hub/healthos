/**
 * Tonight's bet, and how it did (PLAN 187 phase 2; owner, 3 Nov, on the canvas: "i like the b forecast design, simpler,
 * cleaner"). From 20:00: "The app bets on a 74 tonight · usual 80 · mostly 2 drinks (−6)", and why when tapped. In the
 * morning, next to the sleep score: "72 · the app bet 74 · Called it ±2", or "Missed by 13 — something it didn't see?" —
 * the answer is a last-night tag, so the finder and the Sleep grid test it, and the bet learns it. The week of bets under
 * it. Maths in lib/forecast; the nights and their evenings as the Sleep page reads them.
 */

import { useMemo, useState } from "react";
import { useBand } from "../lib/band-client";
import { evenings, nights, type Night } from "../lib/sleep";
import { eveningInputs } from "../lib/eveninputs";
import { sleepScore } from "../lib/sleepscore";
import { betBefore, betOn, featuresOf, FORECAST, forecastModel, lastBets, mostly, usualBedH, type Scored } from "../lib/forecast";
import { useStore } from "../lib/store";
import { addDays, atMinute, DAY, localDay } from "../lib/time";
import { tagMorning } from "./Inbox";

/** What a miss may have been: tags the finder already reads ("out", "worklate") and a few more. */
const MISSES = [{ tag: "stressed", label: "Stressed" }, { tag: "ill", label: "Getting ill" }, { tag: "hot-room", label: "Hot room" }, { tag: "worklate", label: "Worked late" }, { tag: "out", label: "Out late" }];

export function ForecastCard({ now }: { now: number }) {
  const band = useBand().data;
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), halfLife = useStore((s) => s.settings.halfLifeMin);
  const [why, setWhy] = useState(false), [told, setTold] = useState<string | null>(null);
  const h = new Date(now).getHours(), today = localDay(now);
  const mode = h >= 20 || h < 4 ? "evening" : h < 12 ? "morning" : null;
  const scored = useMemo((): Scored[] => {
    if (!band || !mode) return [];
    const ns = nights(band.sleep, band.hr, band.rhr, band.hrv).filter((n) => n.up <= now && n.up >= now - (FORECAST.back + 10) * DAY).sort((a, b) => a.bed - b.bed);
    const evs = evenings(ns, eveningInputs(entries, workouts, halfLife));
    return ns.map((n, i) => ({ n, e: evs[i], score: sleepScore(n, evs[i].rating, ns).score }));
  }, [band, mode, now, entries, workouts, halfLife]);

  const tonight = useMemo(() => {
    if (mode !== "evening" || !scored.length) return null;
    const eve = h < 4 ? addDays(today, -1) : today, past = scored.filter((s) => s.n.eve < eve && s.n.bed >= now - FORECAST.back * DAY);
    const bedH = usualBedH(past.map((s) => s.n));
    const m = forecastModel(past.map((s) => ({ x: featuresOf(s.n, s.e, bedH), y: s.score })), bedH);
    if (!m) return null;
    // tonight as a night that hasn't happened: in bed at your usual time
    const bed = atMinute(eve, Math.round(bedH * 60)), night = { id: "tonight", day: addDays(eve, 1), eve, bed, up: bed + 8 * 3_600_000 } as unknown as Night;
    const e = evenings([night], eveningInputs(entries, workouts, halfLife))[0];
    return betOn(m, featuresOf(night, e, bedH, true));
  }, [mode, scored, h, today, now, entries, workouts, halfLife]);

  const morning = useMemo(() => {
    if (mode !== "morning" || !scored.length) return null;
    const i = scored.length - 1, last = scored[i];
    if (last.n.day !== today) return null;
    const b = betBefore(scored, i);
    return b ? { bet: b.bet, real: last.score, off: last.score - b.bet, week: lastBets(scored) } : null;
  }, [mode, scored, today]);

  if (tonight) {
    const m = mostly(tonight);
    return (
      <section className="card fc" aria-label="Tonight's bet">
        <div className="fc-row">
          <span className="fc-ring" aria-hidden="true">{tonight.bet}</span>
          <div className="fc-words">
            <b>The app bets on a {tonight.bet} tonight</b>
            <small>usual {tonight.usual}{m ? ` · ${m}` : ""}</small>
          </div>
        </div>
        <button type="button" className="linkish" aria-expanded={why} onClick={() => setWhy(!why)}>{why ? "Less" : "Why, and what would move it ›"}</button>
        {why && <div className="fc-why">
          <p className="note">Likely {tonight.low}–{tonight.high}, with you in bed at your usual time. From your own nights — what each has gone with, not a rule:</p>
          {tonight.pushes.length ? <ul>{tonight.pushes.map((q) => <li key={q.id}><span>{q.say}</span><b>{q.pts > 0 ? "+" : "−"}{Math.abs(q.pts)}</b></li>)}</ul>
            : <p className="note">Nothing tonight moves it much from your usual.</p>}
        </div>}
      </section>
    );
  }
  if (morning) {
    const hit = Math.abs(morning.off) <= FORECAST.hit, n = morning.week.filter((c) => c.hit).length;
    return (
      <section className="card fc" aria-label="Last night's bet">
        <div className="fc-row fc-morning">
          <span className="fc-big">{morning.real}</span>
          <small>sleep score · the app bet {morning.bet}</small>
          <span className={`fc-chip ${hit ? "hit" : "miss"}`}>{hit ? `Called it ±${Math.abs(morning.off)}` : `Missed by ${Math.abs(morning.off)}`}</span>
        </div>
        {morning.week.length > 1 && <div className="fc-week" role="img" aria-label={`Last ${morning.week.length} bets: ${n} within ${FORECAST.hit} points`}>
          <small>Lately</small>
          {morning.week.map((c) => <i key={c.day} className={c.hit ? "hit" : "miss"} title={`${c.day}: bet ${c.bet}, came ${c.real}`} />)}
          <small>{n} of {morning.week.length}</small>
        </div>}
        {!hit && (told
          ? <p className="note">Noted — {told}. The bet learns from it, and the Sleep page tests it.</p>
          : <div className="fc-ask"><span>{morning.off < 0 ? "Worse" : "Better"} than it bet — something it didn't see?</span>
            <div className="chips">{MISSES.map((m) => <button key={m.tag} type="button" className="pill-btn" onClick={() => { tagMorning(today, m.tag); setTold(m.label.toLowerCase()); }}>{m.label}</button>)}
              <button type="button" className="pill-btn fc-none" onClick={() => setTold("nothing different")}>Nothing</button></div></div>)}
      </section>
    );
  }
  return null;
}
