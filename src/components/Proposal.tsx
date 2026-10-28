/**
 * The AI's proposed changes under its reply (PLAN 98): a card each, with Apply and Not now. Apply makes the change through
 * lib/ai/propose against the app as it is at that moment; a change that no longer fits says why instead. Nothing is
 * changed until you tap.
 */

import { useState } from "react";
import { act, getState, newId } from "../lib/store";
import { applyProposal, type Proposal } from "../lib/ai/propose";
import type { Entry, Supplement } from "../lib/types";
import { clock, dayLabel, localDay } from "../lib/time";

const WHERE: Record<Proposal["change"], [string, string]> = {
  add_supplement: ["#log/stack", "Stack"], dose: ["#log/stack", "Stack"], supplement_status: ["#log/stack", "Stack"], log_supplement: ["#today", "Today"],
  goals: ["#settings", "Settings"], experiment: ["#insights/training", "Insights → Training"], delete_entry: ["#log", "Log"],
  log_food: ["#log/food", "Log"], log_drink: ["#log/drink", "Log"], log_feel: ["#today", "Today"], log_weight: ["#log/body", "Log"], edit_entry: ["#log", "Log"],
  watch: ["#ai", "the AI tab"],
};
const LOGS = new Set<Proposal["change"]>(["log_supplement", "log_food", "log_drink", "log_feel", "log_weight"]);

/** Mark one card on one chat message. */
function mark(at: number, id: string, patch: Partial<Proposal>, more: Partial<ReturnType<typeof getState>["ai"]> = {}) {
  act.setAi((a) => ({ ...more, chat: a.chat.map((m) => (m.at === at && m.proposals ? { ...m, proposals: m.proposals.map((p) => (p.id === id ? { ...p, ...patch } : p)) } : m)) }));
}

/** Tap Apply: the change against the app as it is now, or why it can't be made any more. */
function applyNow(at: number, p: Proposal, onAdded?: (s: Supplement) => void): { text: string; bad?: boolean } {
  const now = Date.now(), r = applyProposal(p, getState(), now, newId());
  if (typeof r === "string") return { text: r, bad: true };
  if (r.supplements) act.setSupplements(r.supplements);
  if (r.goals) act.setGoals(r.goals);
  if (r.energy) act.setSettings({ energy: r.energy });
  if (r.intake?.op === "add") act.addEntry(r.intake.entry);
  else if (r.intake) act.updateEntry(r.intake.id, r.intake.patch as Partial<Entry>);
  if (r.remove) act.removeEntry(r.remove);
  if (r.add) act.addEntry(r.add);
  if (r.patch) act.updateEntry(r.patch.id, r.patch.patch);
  mark(at, p.id, { applied: now, dismissed: undefined }, { ...(r.experiments ? { experiments: r.experiments } : {}), ...(r.watches ? { watches: r.watches } : {}) });
  const added = p.change === "add_supplement" ? r.supplements?.at(-1) : undefined;
  if (added && onAdded) onAdded(added);
  return { text: r.text };
}

export function Proposals({ at, list, now, onAdded }: { at: number; list: Proposal[]; now: number; onAdded?: (s: Supplement) => void }) {
  const [said, setSaid] = useState<Record<string, { text: string; bad?: boolean }>>({});
  // what was tapped here too: a card under a read's item or the Noticed box isn't re-read from the chat (22 Oct: it kept
  // showing Apply after it was applied)
  const [mine, setMine] = useState<Record<string, Partial<Proposal>>>({});
  const tap = (p: Proposal, patch: Partial<Proposal>) => { mark(at, p.id, patch); setMine((x) => ({ ...x, [p.id]: { ...x[p.id], ...patch } })); };
  const apply = (p: Proposal) => { const r = applyNow(at, p, onAdded); setSaid((x) => ({ ...x, [p.id]: r })); if (!r.bad) setMine((x) => ({ ...x, [p.id]: { ...x[p.id], applied: Date.now(), restored: undefined } })); };
  // a deleted entry, back as it was
  // a deleted entry, back as it was — and the card back to Delete, in case
  const putBack = (p: Proposal) => {
    if (p.entry && !getState().entries.some((e) => e.id === p.entry!.id)) act.restoreEntry(p.entry);
    if (p.edit && getState().entries.some((e) => e.id === p.edit!.before.id)) act.updateEntry(p.edit.before.id, p.edit.before);
    tap(p, { applied: undefined, restored: Date.now() }); setSaid((x) => ({ ...x, [p.id]: { text: "Put back." } }));
  };
  return (
    <div className="proposals">
      {list.map((q) => {
        const p = { ...q, ...mine[q.id] }, s = said[p.id], [href, where] = WHERE[p.change];
        return (
          <div key={p.id} className="propose" data-state={p.applied ? "applied" : p.dismissed ? "dismissed" : "open"}>
            <b>{p.label}</b>
            {p.why && !p.applied && !p.dismissed && <small className="pr-why">{p.why}</small>}
            {/* a watch: what's out there, each with how sure (owner, 28 Oct: "peoples opinions on forums like reddit, and scientific papers") */}
            {p.watch && p.watch.found.length > 0 && !p.dismissed && <ul className="pr-found">{p.watch.found.map((f, i) => <li key={i}><span>{f.text}</span> <i className={`sure sure-${f.sure}`}>{f.sure}</i>{f.source && <> <a href={f.source.url} target="_blank" rel="noreferrer">{f.source.title} ↗</a></>}</li>)}</ul>}
            {p.applied && (p.change === "delete_entry" || p.change === "edit_entry") ? <small className="pr-done">✓ {s && !s.bad ? s.text : `${p.change === "edit_entry" ? "Changed" : "Deleted"} ${localDay(p.applied) === localDay(now) ? clock(p.applied) : dayLabel(p.applied)}`} · <button type="button" className="linkish" onClick={() => putBack(p)}>Put it back</button></small>
              : p.applied ? <small className="pr-done">✓ {s && !s.bad ? s.text : `Applied ${localDay(p.applied) === localDay(now) ? clock(p.applied) : dayLabel(p.applied)}`} · <a href={href}>see it in {where}</a></small>
              : <div className="pr-acts">
                  <button type="button" className={`pill-btn pri${p.change === "delete_entry" ? " danger" : ""}`} onClick={() => apply(p)}>{LOGS.has(p.change) ? "Log it" : p.change === "delete_entry" ? "Delete" : p.change === "edit_entry" ? "Change it" : p.change === "watch" ? "Watch it" : "Apply"}</button>
                  {!p.dismissed && <button type="button" className="pill-btn" onClick={() => tap(p, { dismissed: now })}>Not now</button>}
                  {p.dismissed && <small className="pr-skip">not applied</small>}
                </div>}
            {s?.bad && <small className="err">{s.text}</small>}
            {!p.applied && p.restored && s?.text === "Put back." && <small className="pr-done">Put back.</small>}
          </div>
        );
      })}
    </div>
  );
}
