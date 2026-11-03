/**
 * A cardio session of its own (PLAN 130; owner, 20 Oct: "a button that i press and it strts w timer, then it logs as
 * cardio sessions, reads and understands the heart bpm and other metrics"). The timer runs from the tap — it lives on the
 * saved start, so leaving the app doesn't stop it. Heart rate is the band's, which syncs a few minutes behind: shown when
 * it's in, never made up. Stop shows what it was — minutes, heart rate, about how many kcal and how that was worked out —
 * then Save, or keep going.
 */

import { useEffect, useMemo, useState } from "react";
import { act, useStore } from "../lib/store";
import { useBand } from "../lib/band-client";
import { cardioHr, cardioKcal, CARDIO_CHIPS, kindOf } from "../lib/cardio";
import { fromKm, nextPhase, paceText, phasesOf, phaseStat, phaseWords, speedText, beatsText, toKm, type DistUnit } from "../lib/cardiostats";
import { currentKg } from "../lib/body";
import { clock } from "../lib/time";
import type { Workout } from "../lib/types";
import { ZoneBar } from "./ZoneBar";

const hms = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`; };

/** The numbers of a stretch, as tiles: minutes, the band's average and peak, about how many kcal. */
export function CardioNumbers({ what, start, end }: { what: string; start: number; end: number }) {
  const band = useBand().data, entries = useStore((s) => s.entries);
  const min = Math.round((end - start) / 60_000);
  const hr = useMemo(() => (band ? cardioHr(band.hr, start, end) : null), [band, start, end]);
  const kg = currentKg(entries, 0, end) || null, kc = cardioKcal(what, min, kg);
  return <>
    <div className="fin-stats">
      <div><b>{min}</b><span>min</span></div>
      <div><b>{hr ? hr.avg : "—"}</b><span>{hr ? `avg bpm · peak ${hr.peak}` : "avg bpm"}</span></div>
      <div><b>{kc ? `~${kc.kcal}` : "—"}</b><span>kcal</span></div>
    </div>
    {hr && band && <ZoneBar hr={band.hr} start={start} end={end} />}
    <p className="s cardio-how">
      {hr ? `Heart rate from the band: ${hr.n} of ${min} minutes. ` : band ? "No heart rate from the band for it yet — it syncs a few minutes behind and fills in by itself. " : "Connect the band (Settings) for heart rate. "}
      {kc ? `Calories: ${kc.is}, ${kc.met} MET × ${kg} kg × ${min} min — an estimate, resting included.` : !kg ? "Calories need your weight — log a weigh-in." : "Calories: not estimated for this kind."}
    </p>
  </>;
}

export function CardioSession({ w }: { w: Workout }) {
  const typed = w.cardio?.what ?? "", what = typed.trim() || "Cardio";
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const [stopAt, setStopAt] = useState<number | null>(null);
  const [discard, setDiscard] = useState(false);
  const band = useBand().data;
  // the newest minute the band has sent from this session, if it's recent enough to call "now"
  const live = useMemo(() => { const m = band?.hr.filter(([t]) => t >= w.startedAt).at(-1); return m && now - m[0] < 6 * 60_000 ? m : null; }, [band, w.startedAt, now]);
  // in phases: the one going now; the kind field and chips rename it (before any "Next", the session's kind)
  const cur = w.phases?.length ? w.phases[w.phases.length - 1] : null;
  const setWhat = (v: string) => (cur ? act.updateWorkout(w.id, { phases: w.phases!.map((p, i) => (i === w.phases!.length - 1 ? { ...p, what: v } : p)) }) : act.updateWorkout(w.id, { cardio: { what: v, startedAt: w.startedAt } }));

  if (stopAt != null) return (
    <div className="cockpit">
      <div className="top"><h1>Save?</h1><div className="meta">{what}</div></div>
      <div className="tile finish">
        <span className="k">{clock(w.startedAt)}–{clock(stopAt)}</span>
        <CardioNumbers what={what} start={w.startedAt} end={stopAt} />
        <PhaseRows w={w} end={stopAt} />
        <label className="kfield">How did it feel?<textarea rows={2} value={w.note ?? ""} placeholder="Easy pace, legs heavy…" onChange={(e) => act.updateWorkout(w.id, { note: e.target.value })} /></label>
      </div>
      <button type="button" className="go" onClick={() => act.updateWorkout(w.id, { endedAt: stopAt, cardio: { what: w.phases?.length ? phaseWords(w.phases) : what, startedAt: w.startedAt, done: true, at: stopAt } })}>Save</button>
      <button type="button" className="kbtn" onClick={() => setStopAt(null)}>Keep going</button>
    </div>
  );
  return (
    <div className="cockpit cardio-run">
      <div className="top"><h1>{what}</h1><div className="meta"><b>Cardio</b>started {clock(w.startedAt)}</div></div>
      <div className="tile cardio-timer">
        <output aria-label="Time">{hms(now - w.startedAt)}</output>
        {cur && <p className="s cardio-phase">{phaseWords(w.phases!)} · phase {w.phases!.length} · this phase {hms(now - cur.start)}</p>}
        <p className="s">{live ? <>♥ <b>{live[1]}</b> bpm · {clock(live[0])}</> : band ? "Heart rate shows when the band syncs — usually a few minutes behind." : "Connect the band for heart rate."}</p>
      </div>
      <div className="tile">
        <label className="kfield">{cur ? "This phase" : "What"}<input value={cur ? cur.what : typed} aria-label="Cardio kind" onChange={(e) => setWhat(e.target.value)} /></label>
        <div className="picks" aria-label="Kind">{CARDIO_CHIPS.filter((c) => c !== (cur?.what ?? what)).map((c) => <button type="button" key={c} onClick={() => setWhat(c)}>{c}</button>)}</div>
        {/* PLAN 191: "incline walk then normal running" — the phase so far ends, the next begins, the timer goes on */}
        <div className="picks next-phase" role="group" aria-label="Next phase"><span className="s">Next:</span>{CARDIO_CHIPS.filter((c) => c !== (cur?.what ?? what)).map((c) => <button type="button" key={c} onClick={() => act.updateWorkout(w.id, { phases: nextPhase(w, c, Date.now()) })}>{c}</button>)}</div>
      </div>
      <button type="button" className="go" onClick={() => setStopAt(Date.now())}>Stop</button>
      {discard
        ? <div className="grid2"><button type="button" className="kbtn" onClick={() => setDiscard(false)}>Keep it</button><button type="button" className="kbtn danger" onClick={() => act.discardCardio(w.id)}>Discard — nothing saved</button></div>
        : <button type="button" className="linkb" onClick={() => setDiscard(true)}>Started by mistake?</button>}
    </div>
  );
}

/**
 * On Save, each phase (one when there were none): its minutes and heart rate, and what the treadmill showed — distance
 * (miles or km, remembered), the incline on an incline walk — with its pace and speed worked out as you type (PLAN 191).
 */
export function PhaseRows({ w, end }: { w: Workout; end: number }) {
  const band = useBand().data, unit: DistUnit = useStore((s) => s.settings.distUnit) ?? "mi";
  const spans = phasesOf({ ...w, endedAt: end }, end);
  const [typed, setTyped] = useState<Record<number, string>>(() => Object.fromEntries(spans.map((p, i) => [i, fromKm(p.km, unit)])));
  const put = (i: number, patch: Partial<{ km: number | undefined; incline: number | undefined }>) => {
    const base = w.phases?.length ? w.phases : spans.map((p) => ({ what: p.what, start: p.start }));
    act.updateWorkout(w.id, { phases: base.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  };
  const setUnit = (u: DistUnit) => { act.setSettings({ distUnit: u }); setTyped(Object.fromEntries(spans.map((p, i) => [i, fromKm(p.km, u)]))); };
  return (
    <div className="phase-rows" aria-label="Each phase">
      <div className="phase-head"><b>{spans.length > 1 ? `${spans.length} phases` : "Distance"}</b><span className="s">from the treadmill — leave it empty if you don't know</span>
        <div className="seg unit" role="group" aria-label="Miles or km">{(["mi", "km"] as const).map((u) => <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)}>{u}</button>)}</div></div>
      {spans.map((p, i) => {
        const st = phaseStat(p, band?.hr ?? []), uphill = kindOf(p.what)?.name === "Incline walk";
        return (
          <div key={p.start} className="phase-row">
            <span><b>{p.what}</b> · {Math.round(st.min)} min{st.hr ? ` · ♥ ${st.hr.avg}` : ""}</span>
            <label className="kfield">{unit === "mi" ? "miles" : "km"}<input inputMode="decimal" value={typed[i] ?? ""} aria-label={`${p.what}: distance in ${unit === "mi" ? "miles" : "km"}`}
              onChange={(e) => { setTyped({ ...typed, [i]: e.target.value }); put(i, { km: toKm(e.target.value, unit) ?? undefined }); }} /></label>
            {uphill && <label className="kfield incline">incline %<input inputMode="decimal" value={p.incline ?? ""} aria-label={`${p.what}: incline %`}
              onChange={(e) => { const v = Number(e.target.value.replace(",", ".")); put(i, { incline: e.target.value.trim() && v >= 0 && v <= 40 ? v : undefined }); }} /></label>}
            <small>{st.pace ? `${paceText(st.pace, unit)} /${unit} · ${speedText(st.kmh!, unit)}${st.beats ? ` · ${beatsText(st.beats, unit)} beats a${unit === "mi" ? " mile" : " km"}` : ""}` : "pace and speed from the distance"}</small>
          </div>
        );
      })}
    </div>
  );
}
