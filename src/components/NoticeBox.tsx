/**
 * "Noticed something?" on Today (PLAN 135; owner, 20 Oct: "a small text box where i can write things like I went
 * downstairs to do something, something else distracted me, came back up and realized i didnt do what i wanted … mental
 * and physical notices i see and realize"). One line, in your words; the AI gets it with what the day held around it and
 * may ask about it. Undo for a slip.
 */

import { useState } from "react";
import { act, offerUndo } from "../lib/store";

export function NoticeBox() {
  const [text, setText] = useState("");
  const save = () => { const t = text.trim(); if (!t) return; const e = act.addEntry({ kind: "notice", at: Date.now(), text: t }); setText(""); offerUndo([e.id], "Noted — the AI will look into it with you"); };
  return (
    <div className="card notice-box">
      <h3>Noticed something? <span>mind or body</span></h3>
      <div className="row-add">
        <input value={text} placeholder="Went downstairs, forgot why…" aria-label="Something you noticed" maxLength={300} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
        <button type="button" className="pill-btn" disabled={!text.trim()} onClick={save}>Save</button>
      </div>
    </div>
  );
}
