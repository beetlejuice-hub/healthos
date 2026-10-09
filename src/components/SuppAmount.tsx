/**
 * How much of a supplement you took this time (owner, 9 Oct: "i set up 1 capsule as 200mg, i should be either change to
 * 300mg when im logging, or just +1 to add +1 caps, so its 400mg taken"): − / + one capsule, or tap the amount and type
 * it. Saved on that intake only — the plan's dose stays as it is (Log → Stack changes that). Numbers from lib/dose.
 */

import { useState } from "react";
import { act } from "../lib/store";
import { capsulesIn, doseAt, perCapsule, stepAmount, takenAmount, typedAmount } from "../lib/dose";
import type { Entry, EntryOf, Supplement } from "../lib/types";

export function SuppAmount({ s, e }: { s: Supplement; e: EntryOf<"supp"> }) {
  const [typing, setTyping] = useState(false), [text, setText] = useState("");
  const amt = takenAmount(s, e), per = perCapsule(s, e.at), caps = capsulesIn(s, e.at, amt);
  // The plan's dose isn't stored again: an intake carries an amount only when it differs.
  const save = (next: string | null) => { if (next) act.updateEntry(e.id, { amount: next === doseAt(s, e.at) ? undefined : next } as Partial<Entry>); };
  const done = () => { save(typedAmount(s, e.at, text)); setTyping(false); };
  if (!per) return <small>{amt}</small>;
  const less = stepAmount(s, e.at, amt, -1);
  return (
    <span className="samt" data-amount={amt}>
      <button type="button" aria-label={`One capsule less of ${s.name}`} disabled={!less || less === amt} onClick={() => save(less)}>−</button>
      {typing
        ? <input aria-label={`How much ${s.name} you took`} inputMode="decimal" autoFocus value={text} onChange={(x) => setText(x.target.value)} onBlur={done} onKeyDown={(x) => { if (x.key === "Enter") (x.target as HTMLInputElement).blur(); if (x.key === "Escape") setTyping(false); }} />
        : <button type="button" className="samt-v" aria-label={`${s.name}: ${amt} taken — tap to type an amount`} onClick={() => { setText(amt); setTyping(true); }}>
          {amt}{caps && caps !== 1 ? <em> · {caps} caps</em> : null}</button>}
      <button type="button" aria-label={`One capsule more of ${s.name}`} onClick={() => save(stepAmount(s, e.at, amt, 1))}>+</button>
    </span>
  );
}
