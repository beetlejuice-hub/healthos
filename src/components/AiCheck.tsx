/**
 * The overall check on a finding (PLAN 137; owner: "just name these, not delete"): what the month read said about it —
 * "looks like noise" or "plain sense" and why — with Hide and Keep. Hidden ones are listed under the findings and come
 * back with a tap.
 */

import { useMemo } from "react";
import { act, useStore } from "../lib/store";
import { verdictWords, type Check } from "../lib/overall";

const set = (id: string, patch: Partial<Check>) => act.setAi((a) => ({ checks: (a.checks ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
const hideCheck = (id: string) => set(id, { hidden: true, kept: undefined });
const keepCheck = (id: string) => set(id, { kept: true, hidden: undefined });
const bringBack = (id: string) => set(id, { hidden: undefined, kept: true });

/** The label on a finding the check named, while he hasn't answered it. */
export function AiCheckLabel({ id, onHide }: { id: string; onHide?: () => void }) {
  const c = useStore((s) => (s.ai.checks ?? []).find((x) => x.id === id && !x.kept && !x.hidden));
  if (!c) return null;
  return (
    <div className="aicheck" role="note">
      <p><b>The AI's check:</b> {verdictWords(c.verdict)} — {c.why}</p>
      <div className="sacts">
        <button type="button" className="ibtn" onClick={() => { hideCheck(id); onHide?.(); }}>Hide it</button>
        <button type="button" className="ibtn" onClick={() => keepCheck(id)}>Keep it</button>
      </div>
    </div>
  );
}

/** Findings he hid after the check: listed, each one tap from coming back. */
export function HiddenByYou({ prefix, onBack }: { prefix: string; onBack?: (id: string) => void }) {
  const checks = useStore((s) => s.ai.checks);
  const hidden = useMemo(() => (checks ?? []).filter((c) => c.hidden && c.id.startsWith(prefix)), [checks, prefix]);
  if (!hidden.length) return null;
  return (
    <details className="checking none hidden-by-you">
      <summary>Hidden by you <span>{hidden.length}</span></summary>
      <ul className="notes">{hidden.map((c) => <li key={c.id}>{c.title ?? c.id.slice(prefix.length)} <small>({verdictWords(c.verdict)})</small> <button type="button" className="ibtn" onClick={() => { bringBack(c.id); onBack?.(c.id); }}>Bring back</button></li>)}</ul>
    </details>
  );
}
