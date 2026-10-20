/**
 * What you're working towards (PLAN 131; owner, 20 Oct: "can we let ai … give me suggestions based on my goals (it can ask
 * me what my goals are)"). Asked in the AI tab while none are given: tap the ones that fit, or say your own; saved to About
 * me, where they can be changed. Every AI task then ties its suggestions to them.
 */

import { useState } from "react";
import { act, useStore } from "../lib/store";

const OFFER = ["Lose fat, keep muscle", "Get stronger", "Sleep better", "More energy in the day", "Less stress", "Better focus"];

export function GoalsAsk() {
  const p = useStore((s) => s.profile);
  const [picked, setPicked] = useState<string[]>([]);
  const [own, setOwn] = useState("");
  const [later, setLater] = useState(false);
  if (p.aims?.length || later) return null;
  const all = [...picked, ...(own.trim() ? [own.trim()] : [])];
  return (
    <section className="card goals-ask" aria-label="Your goals">
      <b>What are you working towards?</b>
      <p className="note">Pick what fits, or say it in your words — the AI ties its suggestions to it. Change it any time in Settings → About me.</p>
      <div className="chips">{OFFER.map((o) => <button key={o} type="button" className="pill-btn" aria-pressed={picked.includes(o)} onClick={() => setPicked(picked.includes(o) ? picked.filter((x) => x !== o) : [...picked, o])}>{o}</button>)}</div>
      <input value={own} placeholder="Or your own: run a 10k by June…" aria-label="Your own goal" onChange={(e) => setOwn(e.target.value)} />
      <div className="grid2"><button type="button" className="pill-btn" onClick={() => setLater(true)}>Not now</button>
        <button type="button" className="pill-btn pri" disabled={!all.length} onClick={() => act.setProfile({ ...p, aims: all })}>Save{all.length > 1 ? ` ${all.length}` : ""}</button></div>
    </section>
  );
}
