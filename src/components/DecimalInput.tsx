/**
 * A number box that keeps what you type (PLAN 141; owner, 20 Oct: "Cant put things like 40,5 kg duh…pls fix"). The weight
 * box turned each keystroke into a number and showed that back, so "40," became 40 and the comma was gone before the 5.
 * This keeps the text as typed — comma or dot — and passes on the number it means; a change from outside (+/−, a
 * suggestion) replaces the text unless the text already says that number.
 */

import { useState, type InputHTMLAttributes } from "react";

/** "40,5" → 40.5, "40," → 40, "" → 0; null for anything that isn't a number. */
export function parseDecimal(t: string): number | null {
  const s = t.trim().replace(",", ".");
  if (s === "" || s === ".") return 0; // on the way to ".5"
  if (!/^\d*\.?\d*$/.test(s)) return null;
  return Number(s);
}

export function DecimalInput({ value, onValue, ...rest }: { value: number; onValue: (n: number) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [txt, setTxt] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) { setSeen(value); if (parseDecimal(txt) !== value) setTxt(String(value)); }
  return <input inputMode="decimal" {...rest} value={txt} data-len={Math.min(6, txt.length)}
    onChange={(e) => { const t = e.target.value; const n = parseDecimal(t); if (n == null) return; setTxt(t); setSeen(n); onValue(n); }} />;
}
