/**
 * "Noticed something?" on Today (PLAN 135; owner, 20 Oct: "a small text box where i can write things like I went
 * downstairs to do something, something else distracted me, came back up and realized i didnt do what i wanted … mental
 * and physical notices i see and realize"). Since 22 Oct, anything at face value (owner: "just face value, so i can input
 * whatever, a finding, a new supp that makes me feel good, ai can understand everything and make changes/ sort things/
 * start ivestigating based on what i say"): kept as a note as before, and the AI reads it now — proposes the change (tap
 * Apply), remembers what lasts, looks into it — and says so under the box. Undo for a slip.
 */

import { useState } from "react";
import { act, offerUndo } from "../lib/store";
import { ABOUT_NOTICE, askChat, type ChatReply } from "../lib/ai/chat";
import { useAiStatus } from "../lib/ai/client";
import { Md } from "./Md";
import { Proposals } from "./Proposal";

export function NoticeBox() {
  const { on } = useAiStatus();
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [said, setSaid] = useState<ChatReply | null>(null);
  const save = async () => {
    const t = text.trim(); if (!t || busy) return;
    const e = act.addEntry({ kind: "notice", at: Date.now(), text: t }); setText(""); setSaid(null);
    if (!on) { offerUndo([e.id], "Noted — the AI will look into it with you"); return; }
    offerUndo([e.id], "Noted");
    setBusy(true);
    setSaid(await askChat(`Noticed: ${t}`, ABOUT_NOTICE));
    setBusy(false);
  };
  return (
    <div className="card notice-box">
      <h3>Noticed something? <span>tell the AI anything</span></h3>
      <div className="row-add">
        <input value={text} placeholder="A finding, a supplement that feels good, how you slept…" aria-label="Something you noticed" maxLength={500} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void save(); }} />
        <button type="button" className="pill-btn" disabled={!text.trim() || busy} onClick={() => void save()}>Save</button>
      </div>
      {busy && <p className="ask-reply typing" aria-live="polite">…</p>}
      {said && (said.ok ? <div className="ask-reply" aria-live="polite"><Md text={said.reply} />
        {said.proposals.length > 0 && <Proposals at={said.at} list={said.proposals} now={said.at} />}
        <a className="linkish" href="#ai">More in the AI tab ›</a></div>
        : <p className="err">Kept as a note. {said.message}</p>)}
    </div>
  );
}
