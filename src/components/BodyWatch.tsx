/**
 * Body watch (PLAN 210; owner, 11 Nov: "1 love (all)", board P). On Today, above "For you": when three of the
 * five (resting heart rate, HRV, skin temperature, breathing, blood oxygen) are off your usual — or two, two mornings
 * running — one card: each against your usual, and what came after the same pattern in your own past. Otherwise the night
 * check stays one of the asks, as before (it steps aside when this shows). Numbers from lib/bodywatch; it never says what to do.
 */

import { act, getState } from "../lib/store";
import { useBodyWatch, watchKey } from "./useBodyWatch";

const STEP = { rhr: 3, hrv: 10, skin: 0.5, breath: 1, spo2: 1.5 } as const;

const answerIdOf = (day: string) => getState().entries.find((e) => e.kind === "answer" && e.key === watchKey(day))?.id ?? null;

/** A standing card above "For you" on the mornings it alerts (not one of the asks that wait their turn); nothing otherwise. */
export function BodyWatch({ now }: { now: number }) {
  const w = useBodyWatch(now);
  if (!w?.alert) return null;
  const day = w.day;
  // one answer a morning, changeable: it's what scores the watch on you (PLAN 227)
  const setAnswer = (a: "ill" | "fine") => {
    const prev = answerIdOf(day);
    if (prev) act.updateEntry(prev, { answer: a } as never);
    else act.addEntry({ kind: "answer", at: Date.now(), key: watchKey(day), question: "Feeling ill? (body watch)", answer: a });
  };
  const names = w.off.map((s) => (s.id === "rhr" ? "resting heart rate" : s.id === "hrv" ? "HRV" : s.name.toLowerCase()));
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  return (
    <section className="card bodywatch" aria-label="Body watch" data-off={w.off.length} data-running={w.running}>
      <h3>Body watch <span className="bw-count">{w.off.length} of {w.signals.length} off{w.running > 1 ? ` · ${w.running === 2 ? "2nd" : w.running === 3 ? "3rd" : `${w.running}th`} morning` : ""}</span></h3>
      <p className="bw-say">Your body looks like it's working on something — {list} {w.off.length > 1 ? "are" : "is"} off your usual{w.running > 1 ? `, ${w.running} mornings running` : ""}.</p>
      <ul className="bw-rows">{w.signals.map((s) => {
        // each bar in its own "off" steps: 1 step = the line where it starts to count (3 bpm, 10 %, 0.5 °C, 1/min, 1.5 pts)
        const bad = s.off, size = Math.min(48, (Math.abs(s.diff) / STEP[s.id]) * 16);
        const right = s.diff > 0;
        return (
          <li key={s.id} data-id={s.id} className={bad ? "off" : ""}>
            <span>{s.name}</span>
            <span className="bw-bar" aria-hidden="true"><i style={right ? { left: "50%", width: `${size}%` } : { right: "50%", width: `${size}%` }} /></span>
            <b>{bad ? s.say : "usual"}</b>
          </li>
        );
      })}</ul>
      {/* PLAN 227: what the log holds for the evening and day before — most such mornings are these, not a bug */}
      {w.why.length > 0 && <p className="bw-why" data-why={w.why.map((x) => x.id).join(" ")}><b>Goes with:</b> {w.why.map((x) => x.say).join(", ")} — mornings like this often follow that.</p>}
      <div className="bw-ask" role="group" aria-label="Feeling ill?">
        {w.answer ? <span className="bw-said">{w.answer === "ill" ? "Noted: feeling ill — it counts toward its record." : "Noted: you feel fine — it counts toward its record."}
          {" "}<button type="button" className="linkish" onClick={() => setAnswer(w.answer === "ill" ? "fine" : "ill")}>{w.answer === "ill" ? "I'm fine after all" : "I'm ill after all"}</button></span>
          : <><span>Feeling ill?</span><button type="button" className="pill-btn" onClick={() => setAnswer("ill")}>Yes, a bit or more</button><button type="button" className="pill-btn" onClick={() => setAnswer("fine")}>No, fine</button></>}
      </div>
      {(w.record ?? w.track) && <p className="bw-track"><b>Its record on you:</b> {w.record ?? w.track}</p>}
      <small className="note">Not a diagnosis. In band studies, resting heart rate and skin temperature often rose 1–3 days before cold or flu symptoms — but most such mornings followed drinks, a hard day or a short night (only about 1 in 10 alerts came before an infection).</small>
    </section>
  );
}
