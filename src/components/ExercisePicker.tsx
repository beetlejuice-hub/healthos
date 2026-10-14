/**
 * Typing an exercise (PLAN 94; owner, 14 Oct: "when typing it should appear not make a completely new exercise thats the
 * same"). As you type, matches from the exercises you've done and the app's library — by name, equipment, muscle or a
 * nickname, English or Hungarian (lib/exsearch). Tap one to take it. What you typed counts as an exercise you already have
 * when it's the same name however written ("bench press", "Pullups"), so a second one is never made; a really new name
 * says so before it's added. The browser's own suggestion list did this before and barely shows on an iPhone.
 */

import { useMemo, useState } from "react";
import { exerciseSearch, nameFor, pickFor, sameName } from "../lib/exsearch";
import { useMyExercises } from "./useMyExercises";

export function ExercisePicker({ value, onChange, onPick, label, placeholder, autoFocus, className }: {
  value: string; onChange: (v: string) => void; onPick: (name: string) => void; label: string; placeholder?: string; autoFocus?: boolean; className?: string;
}) {
  const mine = useMyExercises();
  const [focus, setFocus] = useState(!!autoFocus);
  const typed = value.trim();
  const found = useMemo(() => (typed ? exerciseSearch(typed, mine, 6) : []), [typed, mine]);
  const same = typed ? sameName(typed, mine) : null;
  const show = focus && typed.length > 0 && !(found.length === 1 && found[0].name === value);
  return (
    <div className={`exp${className ? ` ${className}` : ""}`}>
      <input value={value} placeholder={placeholder} aria-label={label} autoFocus={autoFocus} autoComplete="off" autoCapitalize="sentences"
        role="combobox" aria-expanded={show} aria-autocomplete="list"
        // closing waits for the tap that caused it to land: closed at once, the list's rows vanish, what's under the finger
        // moves up, and the tap meant for "+ Add exercise" lands on nothing (found in testing)
        onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 200)} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && typed) { e.preventDefault(); onPick(pickFor(typed, mine)); } }} />
      {show && (
        <div className="exp-list" role="listbox" aria-label={`Exercises matching ${typed}`}>
          {found.map((f) => (
            // mousedown, not click: the input keeps its focus long enough for the tap to land
            <button type="button" role="option" aria-selected={f.name === same} key={f.name} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(f.name)}>
              <b>{f.name}</b><small>{[f.muscle?.toLowerCase(), f.mine ? "yours" : null].filter(Boolean).join(" · ")}</small>
            </button>
          ))}
          {!same && <button type="button" role="option" aria-selected={false} className="exp-new" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(nameFor(typed, mine))}>
            <b>+ “{typed.replace(/\s+/g, " ")}”</b><small>new exercise</small>
          </button>}
        </div>
      )}
    </div>
  );
}
