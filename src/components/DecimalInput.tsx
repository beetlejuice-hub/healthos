/**
 * A number box that keeps what you type (PLAN 141; owner, 20 Oct: "Cant put things like 40,5 kg duh…pls fix"). The weight
 * box turned each keystroke into a number and showed that back, so "40," became 40 and the comma was gone before the 5.
 * This keeps the text as typed — comma or dot — and passes on the number it means; a change from outside (+/−, a
 * suggestion) replaces the text unless the text already says that number.
 */

import { useState, type InputHTMLAttributes } from "react";
import { parseDecimal } from "../lib/decimal";

export function DecimalInput({ value, onValue, ...rest }: { value: number; onValue: (n: number) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [txt, setTxt] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) { setSeen(value); if (parseDecimal(txt) !== value) setTxt(String(value)); }
  return <input inputMode="decimal" {...rest} value={txt} data-len={Math.min(6, txt.length)}
    onChange={(e) => { const t = e.target.value; const n = parseDecimal(t); if (n == null) return; setTxt(t); setSeen(n); onValue(n); }} />;
}
