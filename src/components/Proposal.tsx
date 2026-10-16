/**
 * The AI's proposed changes under its reply (PLAN 98): a card each, with Apply and Not now. Apply makes the change through
 * lib/ai/propose against the app as it is at that moment; a change that no longer fits says why instead. Nothing is
 * changed until you tap.
 */

import { useState } from "react";
import { act, getState, newId } from "../lib/store";
import { applyProposal, type Proposal } from "../lib/ai/propose";
import type { Supplement } from "../lib/types";
import { clock, dayLabel, localDay } from "../lib/time";

const WHERE: Record<Proposal["change"], [string, string]> = {
  add_supplement: ["#log/stack", "Stack"], dose: ["#log/stack", "Stack"], supplement_status: ["#log/stack", "Stack"],
  goals: ["#settings", "Settings"], experiment: ["#insights/training", "Insights → Training"],
};

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
  mark(at, p.id, { applied: now, dismissed: undefined }, r.experiments ? { experiments: r.experiments } : {});
  const added = p.change === "add_supplement" ? r.supplements?.at(-1) : undefined;
  if (added && onAdded) onAdded(added);
  return { text: r.text };
}

export function Proposals({ at, list, now, onAdded }: { at: number; list: Proposal[]; now: number; onAdded?: (s: Supplement) => void }) {
  const [said, setSaid] = useState<Record<string, { text: string; bad?: boolean }>>({});
  const apply = (p: Proposal) => { const r = applyNow(at, p, onAdded); setSaid((x) => ({ ...x, [p.id]: r })); };
  return (
    <div className="proposals">
      {list.map((p) => {
        const s = said[p.id], [href, where] = WHERE[p.change];
        return (
          <div key={p.id} className="propose" data-state={p.applied ? "applied" : p.dismissed ? "dismissed" : "open"}>
            <b>{p.label}</b>
            {p.why && !p.applied && !p.dismissed && <small className="pr-why">{p.why}</small>}
            {p.applied ? <small className="pr-done">✓ {s && !s.bad ? s.text : `Applied ${localDay(p.applied) === localDay(now) ? clock(p.applied) : dayLabel(p.applied)}`} · <a href={href}>see it in {where}</a></small>
              : <div className="pr-acts">
                  <button type="button" className="pill-btn pri" onClick={() => apply(p)}>Apply</button>
                  {!p.dismissed && <button type="button" className="pill-btn" onClick={() => mark(at, p.id, { dismissed: now })}>Not now</button>}
                  {p.dismissed && <small className="pr-skip">not applied</small>}
                </div>}
            {s?.bad && <small className="err">{s.text}</small>}
          </div>
        );
      })}
    </div>
  );
}
