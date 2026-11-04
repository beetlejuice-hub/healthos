import type { ReactNode } from "react";

/** Open one finding's row from elsewhere — Today's "Noticed" line, a new lead (PLAN 197): the list hears it and opens it. */
export const openFinding = (id: string) => window.dispatchEvent(new CustomEvent("finding:open", { detail: id }));
import { STATE_WORDS, type ClaimState } from "../lib/record";

/**
 * One finding as a row (PLAN 197; owner, 4 Nov: "i like A findings page"): what kind and how sure, the sentence, the
 * number and how it has held, all in its heading — a tap opens the rest (the numbers, the chart, what to do).
 */
export function FindingRow({ id, k, title, value, state, flag, open, onToggle, className, children }: { id: string; k: string; title: string; value?: ReactNode; state?: ClaimState | null; flag?: ReactNode; open: boolean; onToggle: () => void; className: string; children: ReactNode }) {
  return (
    <article className={`${className} fl-row`} id={id} data-open={open || undefined}>
      <h3 className="fl-h"><button type="button" aria-expanded={open} onClick={onToggle}>
        <span className="k">{k}</span>
        <span className="fl-title">{title}</span>
        {value != null && <span className="fl-v">{value}</span>}
        {(state || flag) && <span className="fl-tags">{state && <span className={`rec-chip rec-${state.replace(/\W+/g, "")}`}>{STATE_WORDS[state]}</span>}{!open && flag}</span>}
        <span className="chev" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button></h3>
      {open && <div className="fl-body">{children}</div>}
    </article>
  );
}
