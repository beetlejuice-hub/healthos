/**
 * Today, first in "For you": your own tip when that feeling is low (owner, 28 Oct: "whenever my focus is low it should
 * recommend to put on my focus music"). From what you typed in "Noticed something?" (lib/tips): "Focus 3 — what you
 * said helps", your words, "Doing it". Nothing when nothing's low or there's no tip for it; Skip (For you's) for not now.
 */

import { useMemo } from "react";
import { act, offerUndo, useStore } from "../lib/store";
import { FEELING_NAME, tipAsk, tipEntry } from "../lib/tips";

export function TipAsk({ now }: { now: number }) {
  const entries = useStore((s) => s.entries);
  const a = useMemo(() => tipAsk(entries, now), [entries, now]);
  if (!a) return null;
  return (
    <section className="card tipask" aria-label="Your own tip">
      <h3>{FEELING_NAME[a.for]} {a.value} <span>what you said helps</span></h3>
      <ul>{a.tips.map((t) => (
        <li key={t.key}>
          <q>{t.said}</q>
          <button type="button" className="pill-btn pri" onClick={() => { const e = act.addEntry(tipEntry(a, t, Date.now())); offerUndo([e.id], `Doing it: ${t.what}`); }}>Doing it</button>
        </li>
      ))}</ul>
    </section>
  );
}
