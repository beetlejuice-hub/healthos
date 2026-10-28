/**
 * How's your body? — on the check-in, under the sliders (owner, 28 Oct, picked C on the canvas: "chips with how much").
 * Tap a chip once for "a bit" ●, again for "a lot" ●●, a third time clears it. Weak, tired, sore, headache, bloated,
 * dizzy, foggy, and your own words — "exhausted" files under tired, "knee pain" stays yours and gets its own chip. Each
 * becomes a thing the pattern finder can link (lib/scout: "with more alcohol, you felt weak the next day more often"),
 * counting how much, not just whether. Draws and reports taps only; HowNow saves them on the check-in.
 */

import { useState } from "react";
import { bodyKeys, bodyLabel, DOTS, HOW, nextLevel, type Level } from "../lib/bodywords";

/** `onSet` gets every change at once — your own words can be several ("knee pain and cramps"): one save, one check-in. */
export function BodyChips({ body, order, onSet }: { body: Record<string, Level>; order: string[]; onSet: (changes: Record<string, Level | undefined>) => void }) {
  const [own, setOwn] = useState<string | null>(null);
  const keys = [...new Set([...order, ...Object.keys(body)])];
  const addOwn = () => { const add = bodyKeys(own ?? "").filter((k) => !body[k]); if (add.length) onSet(Object.fromEntries(add.map((k) => [k, 1 as Level]))); setOwn(null); };
  return (
    <div className="hn-body">
      <div className="hn-head"><b>How's your body?</b><em>tap again for more</em></div>
      <div className="hn-tags hn-bchips" role="group" aria-label="How's your body">
        {keys.map((k) => {
          const l = body[k];
          return (
            <button key={k} type="button" aria-pressed={!!l} data-level={l} aria-label={`${bodyLabel(k)}${l ? `, ${HOW[l]}` : ""}`} onClick={() => onSet({ [k]: nextLevel(l) })}>
              {bodyLabel(k)}{l && <i aria-hidden="true">{DOTS[l]}</i>}
            </button>
          );
        })}
        {own == null && <button type="button" className="hn-more" onClick={() => setOwn("")}>+ your own</button>}
      </div>
      {own != null && <form className="hn-own" onSubmit={(e) => { e.preventDefault(); addOwn(); }}>
        <input autoFocus value={own} onChange={(e) => setOwn(e.target.value)} placeholder="knee pain, cramps, shaky…" aria-label="How your body feels, your own words" maxLength={80} />
        <button type="submit" className="pill-btn" disabled={!bodyKeys(own).length}>Add</button>
      </form>}
      {Object.keys(body).length > 0 && <p className="hn-blegend">● a bit · ●● a lot · a third tap clears it</p>}
    </div>
  );
}
