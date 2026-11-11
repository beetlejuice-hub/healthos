/**
 * Tonight's bet, and how it did (PLAN 187 phase 2; owner, 3 Nov, on the canvas: "i like the b forecast design, simpler,
 * cleaner"). By bedtime since PLAN 198 (owner, 5 Nov: "it cant predict when im gonna go to sleep"; canvas
 * https://claude.ai/artifact/1MxwG6ynPZq6parXeTgUxA, A built while he picks): from 20:00, a score for each bedtime ahead
 * ("by 23:00 74 · by 00:00 70"), what each hour later costs him, and what today has already set; when his nights say
 * bedtime barely matters, one number "whenever you go". In the morning, next to the sleep score: "67 · in bed 00:40, for
 * that it said 68 · Called it ±1", or "Missed by 13 — something it didn't see?" — the answer is a last-night tag, so the
 * finder and the Sleep grid test it, and the bet learns it — or in his own words (owner, 11 Nov: "should be able to input
 * custom reason"). What a bet was based on opens under it (owner, 11 Nov: "can i see what sleep score predict is based
 * on"): his usual, each thing that moved it and by how much, what it weighs and what it can't see. The week of bets
 * under it. Maths in lib/forecast; the nights and their evenings as the Sleep page reads them.
 */

import { useMemo, useState } from "react";
import { useBand } from "../lib/band-client";
import { clockH, evenings, nights, type Night } from "../lib/sleep";
import { eveningInputs } from "../lib/eveninputs";
import { sleepScore } from "../lib/sleepscore";
import { betBefore, featuresOf, FEATURES, FORECAST, forecastModel, hhmm, lastBets, mostly, perHour, tonight as tonightOf, usualBedH, type Scored } from "../lib/forecast";
import { useStore } from "../lib/store";
import { addDays, atMinute, DAY, localDay } from "../lib/time";
import { tagMorning } from "./Inbox";
import { tagsOf } from "../lib/feel";

/** What the bet weighs, by name. */
const WATCH: Record<string, string> = { drinks: "drinks", caf: "caffeine left at bed", trained: "training", lateTrain: "training late", lateMeal: "eating close to bed", stress: "a stressful evening", bedLate: "bedtime" };

/** What a miss may have been: tags the finder already reads ("out", "worklate") and a few more. */
const MISSES = [{ tag: "stressed", label: "Stressed" }, { tag: "ill", label: "Getting ill" }, { tag: "hot-room", label: "Hot room" }, { tag: "worklate", label: "Worked late" }, { tag: "out", label: "Out late" }];

export function ForecastCard({ now }: { now: number }) {
  const band = useBand().data;
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), halfLife = useStore((s) => s.settings.halfLifeMin);
  const [why, setWhy] = useState(false), [told, setTold] = useState<string | null>(null), [own, setOwn] = useState<string | null>(null);
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
    // tonight as a night that hasn't happened, in bed at h: the caffeine still in you and the time since eating go with it
    const inputs = eveningInputs(entries, workouts, halfLife), mid = atMinute(eve, 0);
    const xAt = (bh: number) => {
      const bed = atMinute(eve, Math.round(bh * 60)), night = { id: "tonight", day: addDays(eve, 1), eve, bed, up: bed + 8 * 3_600_000 } as unknown as Night;
      return featuresOf(night, evenings([night], inputs)[0], bedH);
    };
    return { ...tonightOf(m, xAt, (now - mid) / 3_600_000), n: m.n, band: m.band };
  }, [mode, scored, h, today, now, entries, workouts, halfLife]);

  const morning = useMemo(() => {
    if (mode !== "morning" || !scored.length) return null;
    const i = scored.length - 1, last = scored[i];
    if (last.n.day !== today) return null;
    const b = betBefore(scored, i);
    if (!b) return null;
    // what bedtime did: the bet for your usual one, when you went half an hour or more either side and bedtime counts for you
    const late = clockH(last.n.bed, last.n.eve) - b.model.bedH, usual = Math.abs(late) >= 0.5 && Math.abs(perHour(b.model)) >= FORECAST.flatPerHour ? betBefore(scored, i, true) : null;
    return { bet: b.bet, real: last.score, off: last.score - b.bet, bed: hhmm(clockH(last.n.bed, last.n.eve)), usualBed: hhmm(b.model.bedH), atUsual: usual?.bet ?? null, week: lastBets(scored),
      usual: b.usual, pushes: b.pushes, n: b.model.n, band: b.model.band, watched: FEATURES.filter((_, k) => b.model.use[k]).map((f) => WATCH[f.id] ?? f.id) };
  }, [mode, scored, today]);

  if (tonight) {
    const t = tonight, m = mostly({ ...t.bet, pushes: t.set }), ph = Math.round(Math.abs(t.perHour));
    const sign = (v: number) => `${v > 0 ? "+" : "−"}${Math.abs(v)}`;
    return (
      <section className="card fc" aria-label="Tonight's bet">
        {t.flat ? <>
          <div className="fc-row">
            <span className="fc-ring" aria-hidden="true">{t.bet.bet}</span>
            <div className="fc-words">
              <b>About {t.bet.bet} tonight, whenever you go</b>
              <small>usual {t.usual}{m ? ` · ${m}` : ""}</small>
            </div>
          </div>
          <p className="note">{t.alike ? "Your bedtimes have been too alike to tell what a later one costs — so it's what the day held." : "On your nights, bedtime has moved the score less than a point an hour — it's what the day held that counts."}</p>
        </> : <>
          <div className="fc-words">
            <b>Tonight's sleep score, by when you're in bed</b>
            <small>your usual: {t.usual}, in bed {hhmm(t.bedH)}</small>
          </div>
          {t.rungs.length
            ? <ul className="fc-ladder">{t.rungs.map((r) => <li key={r.h}><span>by {hhmm(r.h)}</span><span className="fc-bar" aria-hidden="true"><i style={{ width: `${r.bet}%` }} /></span><b>{r.bet}</b></li>)}</ul>
            : <p className="note">Later than any night it has learned from — no score for that.</p>}
          <p className="note">Each hour later {t.perHour < 0 ? "costs" : "adds"} you about {ph} — from your own {t.n} nights.</p>
        </>}
        <div className="fc-set">
          <small>Already set by today</small>
          {t.set.length ? <ul>{t.set.map((q) => <li key={q.id}><span>{q.say}</span><b className={q.pts < 0 ? "neg" : "pos"}>{sign(q.pts)}</b></li>)}</ul>
            : <p className="note">Nothing today has moved it much from your usual.</p>}
        </div>
        <button type="button" className="linkish" aria-expanded={why} onClick={() => setWhy(!why)}>{why ? "Less" : "How sure, and how it's done ›"}</button>
        {why && <p className="note fc-why">8 in 10 of the nights it hadn't seen came within {sign(Math.round(t.band[0]))} / {sign(Math.round(t.band[1]))} of what it said. From your own {t.n} nights — what each has gone with, not a rule. The caffeine still in you and the time since your last meal are counted at each bedtime.</p>}
      </section>
    );
  }
  if (morning) {
    const hit = Math.abs(morning.off) <= FORECAST.hit, n = morning.week.filter((c) => c.hit).length;
    return (
      <section className="card fc" aria-label="Last night's bet">
        <div className="fc-row fc-morning">
          <span className="fc-big">{morning.real}</span>
          <small>sleep score · in bed {morning.bed}, for that it said {morning.bet}</small>
          <span className={`fc-chip ${hit ? "hit" : "miss"}`}>{hit ? `Called it ±${Math.abs(morning.off)}` : `Missed by ${Math.abs(morning.off)}`}</span>
        </div>
        {morning.atUsual != null && morning.atUsual !== morning.bet && <p className="note">In bed at your usual {morning.usualBed} it would have said {morning.atUsual}.</p>}
        {morning.week.length > 1 && <div className="fc-week" role="img" aria-label={`Last ${morning.week.length} bets: ${n} within ${FORECAST.hit} points`}>
          <small>Lately</small>
          {morning.week.map((c) => <i key={c.day} className={c.hit ? "hit" : "miss"} title={`${c.day}: bet ${c.bet}, came ${c.real}`} />)}
          <small>{n} of {morning.week.length}</small>
        </div>}
        <button type="button" className="linkish" aria-expanded={why} onClick={() => setWhy(!why)}>{why ? "Less" : "What it was based on ›"}</button>
        {why && <div className="fc-set fc-basis">
          <small>Your usual night: {morning.usual}, in bed {morning.usualBed}. Then last night:</small>
          {morning.pushes.length ? <ul>{morning.pushes.map((q) => <li key={q.id}><span>{q.say}</span><b className={q.pts < 0 ? "neg" : "pos"}>{q.pts > 0 ? "+" : "−"}{Math.abs(q.pts)}</b></li>)}</ul>
            : <p className="note">Nothing about last night moved it from your usual.</p>}
          <p className="note">= {morning.bet}. It learned from your own {morning.n} nights before this one what each thing has gone with: {morning.watched.join(", ")}{morning.watched.length ? "" : "nothing yet — too few nights that differ"}. 8 in 10 nights it hadn't seen came within {Math.round(morning.band[0])} / +{Math.round(morning.band[1])}. It can't see what isn't logged — stress, getting ill, the room, a late screen — that's what the question below is for.</p>
        </div>}
        {!hit && (told
          ? <p className="note">Noted — {told}. The bet learns from it, and the Sleep page tests it.</p>
          : <div className="fc-ask"><span>{morning.off < 0 ? "Worse" : "Better"} than it bet — something it didn't see?</span>
            <div className="chips">{MISSES.map((m) => <button key={m.tag} type="button" className="pill-btn" onClick={() => { tagMorning(today, m.tag); setTold(m.label.toLowerCase()); }}>{m.label}</button>)}
              <button type="button" className="pill-btn" aria-expanded={own != null} onClick={() => setOwn(own == null ? "" : null)}>Something else…</button>
              <button type="button" className="pill-btn fc-none" onClick={() => setTold("nothing different")}>Nothing</button></div>
            {own != null && <div className="fc-own">
              <input aria-label="What it was, in your words" placeholder="e.g. neighbours were loud" value={own} maxLength={80} onChange={(e) => setOwn(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && own.trim()) { for (const t of tagsOf(own)) tagMorning(today, t); setTold(own.trim()); } }} />
              <button type="button" className="pill-btn pri" disabled={!own.trim()} onClick={() => { for (const t of tagsOf(own)) tagMorning(today, t); setTold(own.trim()); }}>Save</button>
            </div>}</div>)}
      </section>
    );
  }
  return null;
}
