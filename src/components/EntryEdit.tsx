/**
 * Change what one logged food or drink holds (PLAN 71; owner, 13 Oct: "i should be able to click on the logged food or
 * drink and modify its macros if it wont cause a big database problem"). It doesn't: every entry keeps its own numbers,
 * so this changes that one entry only — the food in the database, and everything else you logged, stay as they were.
 */

import { useEffect, useRef, useState } from "react";
import { act } from "../lib/store";
import type { EntryOf } from "../lib/types";
import { editable, LABEL, numIn, patchOf, type Field } from "../lib/entryedit";

export function EntryEdit({ e, onDone }: { e: EntryOf<"food"> | EntryOf<"drink">; onDone: () => void }) {
  const start = editable(e);
  const fields = (Object.keys(LABEL) as Field[]).filter((k) => start[k] != null);
  const [vals, setVals] = useState<Record<Field, string>>(() => Object.fromEntries(fields.map((k) => [k, String(Math.round(start[k]! * 10) / 10)])) as Record<Field, string>);
  const bad = fields.some((k) => numIn(vals[k] ?? "") == null);
  // the last item on the page opens under the tab bar: bring the form (and its Save) into view
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { ref.current?.scrollIntoView?.({ block: "center", behavior: "smooth" }); }, []);
  const save = () => { act.updateEntry(e.id, patchOf(e, Object.fromEntries(fields.map((k) => [k, numIn(vals[k])])) as Record<Field, number | null>)); onDone(); };
  return (
    <form ref={ref} className="entry-edit" aria-label={`Change ${e.name}`} onSubmit={(ev) => { ev.preventDefault(); if (!bad) save(); }}>
      <div className="ee-grid">
        {fields.map((k) => <label key={k} className="field">{LABEL[k]}<input inputMode="decimal" value={vals[k]} onChange={(ev) => setVals({ ...vals, [k]: ev.target.value })} /></label>)}
      </div>
      <p className="note">Changes this entry only — the food in the database stays as it is.</p>
      <div className="ee-btns"><button type="button" className="pill-btn" onClick={onDone}>Cancel</button><button type="submit" className="pill-btn pri" disabled={bad}>Save</button></div>
    </form>
  );
}
