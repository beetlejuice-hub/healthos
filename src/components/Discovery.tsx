/**
 * A read's discovery (PLAN 187 phase 1; owner, 3 Nov: "finding new studies, random ones … or reddit forums that talk ab
 * things that changed their lives … one or 2 for each day. completely random. like it sent me the kiwi study and i am
 * trying it rn"): what was found, why it might be worth it for you, its source, how sure. "Try it" starts a watch — the
 * evening question for its days, your data, what it showed at the end; "Not for me" puts it away.
 */

import { useState } from "react";
import { act, getState, newId, useStore } from "../lib/store";
import { watchInput, type KeptDiscovery } from "../lib/ai/discover";
import { applyProposal, makeProposal } from "../lib/ai/propose";
import { SURE_WORDS } from "./ReadItems";

const NONE: KeptDiscovery[] = [];
const KIND_WORDS = { study: "a study", forum: "a forum post", classic: "an older study" } as const;

/** Its watch, made and started as the AI's own "watch" proposal would be — without the data link if that part doesn't fit. */
export function tryDiscovery(d: KeptDiscovery, now = Date.now()): { ok: true; text: string; watchId: string } | { ok: false; text: string } {
  const s = getState(), id = newId();
  let p = makeProposal(watchInput(d) ?? {}, s, id, now);
  if (typeof p === "string" && watchInput(d, true)) p = makeProposal(watchInput(d, true)!, s, id, now);
  if (typeof p === "string") return { ok: false, text: p };
  const r = applyProposal(p, s, now, id);
  if (typeof r === "string") return { ok: false, text: r };
  if (r.watches) act.setAi({ watches: r.watches });
  const w = r.watches?.at(-1);
  act.setAi((a) => ({ discoveries: (a.discoveries ?? []).map((x) => (x.id === d.id ? { ...x, tried: now, ...(w ? { watchId: w.id } : {}) } : x)) }));
  return { ok: true, text: r.text, watchId: w?.id ?? id };
}

export function DiscoveryCard({ day, slot, open, onOpen }: { day: string; slot: "morning" | "evening"; open: boolean; onOpen: () => void }) {
  const d = useStore((s) => (s.ai.discoveries ?? []).find((x) => x.day === day && x.slot === slot));
  const [said, setSaid] = useState<{ text: string; bad?: boolean } | null>(null);
  if (!d || d.no) return null;
  // folded: one line that opens the read
  if (!open) return <button type="button" className="disc-line" onClick={onOpen}><small>Found for you</small>{d.title}</button>;
  const tried = d.tried != null;
  return (
    <section className="disc" aria-label="Found for you">
      <small className="disc-k">Found for you · {KIND_WORDS[d.kind]}</small>
      <b className="disc-t">{d.title}</b>
      <p><i className={`sure sure-${d.sure}`}>{SURE_WORDS[d.sure]}</i>{d.text}</p>
      {d.why && <p className="disc-why">{d.why}</p>}
      <a className="disc-src" href={d.source.url} target="_blank" rel="noreferrer">{d.source.title}{d.source.checked ? " ✓" : ""}</a>
      <div className="disc-btns">
        {d.try && !tried && <button type="button" className="pill-btn pri" onClick={() => { const r = tryDiscovery(d); setSaid({ text: r.text, bad: !r.ok }); }}>Try it for {d.try.days} days</button>}
        {tried && <p className="note disc-on">Trying it — {d.try?.question ? `"${d.try.question}" each evening` : "watching"} · Watching in the AI tab</p>}
        {!tried && <button type="button" className="pill-btn" onClick={() => act.setAi((a) => ({ discoveries: (a.discoveries ?? []).map((x) => (x.id === d.id ? { ...x, no: Date.now() } : x)) }))}>Not for me</button>}
      </div>
      {said && <p className={`note${said.bad ? " err" : ""}`}>{said.text}</p>}
    </section>
  );
}

/** The AI tab: what the reads found lately, newest first, so one can be tried later (a read is only on Today for a day). */
export function DiscoveryList() {
  // the list itself (a fresh [] each time loops the store's subscription and blanks the tab — 3 Nov, e2e watch)
  const list = useStore((s) => s.ai.discoveries) ?? NONE;
  const [open, setOpen] = useState<string | null>(null);
  const shown = [...list].filter((d) => !d.no).reverse().slice(0, 20);
  if (!shown.length) return null;
  return (
    <details className="card disc-list">
      <summary>Found for you lately <span>{shown.length}</span></summary>
      {shown.map((d) => (
        <div key={d.id} className="disc-li">
          {open === d.id ? <DiscoveryCard day={d.day} slot={d.slot} open onOpen={() => setOpen(d.id)} />
            : <button type="button" className="disc-line" onClick={() => setOpen(d.id)}><small>{d.day.slice(5).replace("-", "/")} · {KIND_WORDS[d.kind]}{d.tried ? " · trying it" : ""}</small>{d.title}</button>}
        </div>
      ))}
    </details>
  );
}
