/**
 * Reps in the day editor: one number (10) or a range (8–12; PLAN 144). Keeps what's typed ("8-" on the way to "8-12")
 * and passes on what it means once it means something.
 */

import { useState } from "react";
import { parseReps, repsLabel } from "../lib/progress";

export function RepsInput({ value, onValue, label }: { value: { reps: number; repsMax?: number }; onValue: (v: { reps: number; repsMax?: number }) => void; label: string }) {
  const [txt, setTxt] = useState(repsLabel(value));
  return <input inputMode="text" aria-label={label} value={txt} placeholder="10 or 8-12"
    onChange={(e) => { setTxt(e.target.value); const v = parseReps(e.target.value); if (v) onValue({ reps: v.reps, repsMax: v.repsMax }); }}
    onBlur={() => setTxt(repsLabel(value))} />;
}
