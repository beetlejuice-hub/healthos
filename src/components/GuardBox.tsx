/**
 * The typo guard's question (PLAN 145): what looks off, and three ways on — the likely fix, keep what was typed, or change
 * it. Asked once; never blocks.
 */

import type { Guard } from "../lib/sanity";

export function GuardBox({ g, keep, onFix, onKeep, onChange }: { g: Guard; keep: string; onFix: () => void; onKeep: () => void; onChange: () => void }) {
  return (
    <div className="guard" role="alert">
      <p>{g.msg}{g.fix ? ` Did you mean ${g.fix.label}?` : " Is that right?"}</p>
      <div className={g.fix ? "grid3" : "grid2"}>
        {g.fix && <button type="button" className="kbtn pri" onClick={onFix}>Use {g.fix.label}</button>}
        <button type="button" className="kbtn" onClick={onKeep}>Keep {keep}</button>
        <button type="button" className="kbtn" onClick={onChange}>Change it</button>
      </div>
    </div>
  );
}
