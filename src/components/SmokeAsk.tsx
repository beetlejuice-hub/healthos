/**
 * Today: cigarettes, one question (PLAN 177; owner, 27 Oct: "cigarettes lets do B" — "i may not log them immediately").
 * Before bed it asks about today; in the morning, if it was missed, about yesterday. One tap, Undo; then it's gone till
 * tomorrow. No judgement in the words — it's data, like the rest.
 */

import { useMemo } from "react";
import { act, offerUndo, useStore } from "../lib/store";
import { SMOKE_BANDS, SMOKE_LABEL, SMOKE_UNSURE, smokeAsk, smokeEntry, type SmokeBand } from "../lib/smoke";

export function SmokeAsk({ now }: { now: number }) {
  const entries = useStore((s) => s.entries);
  const ask = useMemo(() => smokeAsk(entries, now), [entries, now]);
  if (!ask) return null;
  const answer = (b: SmokeBand | typeof SMOKE_UNSURE) => { const e = act.addEntry(smokeEntry(ask.day, b)); offerUndo([e.id], `Cigarettes ${ask.when === "tonight" ? "today" : "yesterday"}: ${b === SMOKE_UNSURE ? b : SMOKE_LABEL[b].toLowerCase()}`); };
  return (
    <div className="card catchup smokeask" role="region" aria-label="Cigarettes">
      <h3>Cigarettes <span>{ask.when === "tonight" ? "today" : "yesterday"}?</span></h3>
      <div className="cu-btns fg-btns">
        {SMOKE_BANDS.map((b) => <button key={b} type="button" className={`pill-btn${b === "0" ? " pri" : ""}`} onClick={() => answer(b)}>{SMOKE_LABEL[b]}</button>)}
      </div>
      <p className="fg-more"><button type="button" className="linkish" onClick={() => answer(SMOKE_UNSURE)}>Don't remember</button></p>
    </div>
  );
}
