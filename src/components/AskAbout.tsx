/**
 * Talk to the AI about one thing, right where it is (PLAN 164; owner, 22 Oct: "small chat w ai button next to findings,
 * studies, etc at morning and night digest messages so i can ask or say things like, for me its the opposite, or that can
 * u recommend supps or food for this specific issue"). A line to type in, a few one-tap starters, and the reply under it
 * with any change it proposes (nothing changes until you tap Apply). The exchange is in the AI tab's chat too.
 */

import { useState } from "react";
import { askChat, type ChatReply } from "../lib/ai/chat";
import { useAiStatus } from "../lib/ai/client";
import { Md } from "./Md";
import { Proposals } from "./Proposal";

export function AskAbout({ about, label, starters = [], placeholder }: { about: string; /** Shown before your words in the chat ("Re “…”"). */ label: string; starters?: string[]; placeholder: string }) {
  const { on } = useAiStatus();
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [said, setSaid] = useState<ChatReply | null>(null);
  if (!on) return null;
  const send = async (t: string) => {
    const msg = t.trim();
    if (!msg || busy) return;
    setText(""); setBusy(true); setSaid(null);
    setSaid(await askChat(`${label}: ${msg}`, about));
    setBusy(false);
  };
  return (
    <div className="ask-about">
      {!said && !busy && starters.length > 0 && <div className="chips">{starters.map((s) => <button key={s} type="button" className="pill-btn" onClick={() => void send(s)}>{s}</button>)}</div>}
      <div className="row-add">
        <input value={text} placeholder={placeholder} aria-label={placeholder} maxLength={600} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void send(text); }} />
        <button type="button" className="pill-btn pri" disabled={!text.trim() || busy} onClick={() => void send(text)}>Send</button>
      </div>
      {busy && <p className="ask-reply typing" aria-live="polite">…</p>}
      {said && (said.ok ? <div className="ask-reply" aria-live="polite"><Md text={said.reply} />
        {said.proposals.length > 0 && <Proposals at={said.at} list={said.proposals} now={said.at} />}
        <a className="linkish" href="#ai">More in the AI tab ›</a></div>
        : <p className="err">{said.message}</p>)}
    </div>
  );
}
