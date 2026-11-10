/**
 * "Noticed something?" on Today (PLAN 135; owner, 20 Oct: "a small text box where i can write things like I went
 * downstairs to do something, something else distracted me, came back up and realized i didnt do what i wanted … mental
 * and physical notices i see and realize"). Since 22 Oct, anything at face value (owner: "just face value, so i can input
 * whatever, a finding, a new supp that makes me feel good, ai can understand everything and make changes/ sort things/
 * start ivestigating based on what i say"): kept as a note as before, and the AI reads it now — proposes the change (tap
 * Apply), remembers what lasts, looks into it — and says so under the box. Undo for a slip.
 */

import { useEffect, useState } from "react";
import { act, getState, offerUndo, useStore } from "../lib/store";
import { ABOUT_NOTICE, askChat, type ChatReply } from "../lib/ai/chat";
import { useAiStatus } from "../lib/ai/client";
import { Md } from "./Md";
import { Proposals } from "./Proposal";

/** The AI couldn't be reached at all (not a refusal, a limit or a bug): the note waits and is read later (PLAN 202). */
const UNREACHED = new Set(["no-server", "offline", "timeout"]);
const NOTES = { everyMs: 60_000, tries: 6 } as const;

export function NoticeBox() {
  const { on } = useAiStatus();
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [said, setSaid] = useState<ChatReply | null>(null);
  const waiting = useStore((s) => s.ai.pendingNotes); // not `?? []` here: a new list each read loops the store
  const ask = async (t: string, again: boolean): Promise<ChatReply> => {
    const r = await askChat(`Noticed: ${t}`, ABOUT_NOTICE, again);
    act.setAi((a) => {
      const rest = (a.pendingNotes ?? []).filter((n) => n.text !== t), was = (a.pendingNotes ?? []).find((n) => n.text === t);
      // read, or turned down for a reason that won't change by waiting: off the list; not reached: on it, a try more
      return { pendingNotes: r.ok || !UNREACHED.has(r.error) || (was?.tries ?? 0) + 1 >= NOTES.tries ? rest : [...rest, { text: t, at: was?.at ?? Date.now(), tries: (was?.tries ?? 0) + 1 }] };
    });
    return r;
  };
  const save = async () => {
    const t = text.trim(); if (!t || busy) return;
    const e = act.addEntry({ kind: "notice", at: Date.now(), text: t }); setText(""); setSaid(null);
    if (!on) { offerUndo([e.id], "Noted — the AI will look into it with you"); return; }
    offerUndo([e.id], "Noted");
    setBusy(true);
    setSaid(await ask(t, false));
    setBusy(false);
  };
  // the ones that didn't get through: read one at a time, once a minute while the app is open and online
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => {
      const next = (getState().ai.pendingNotes ?? [])[0];
      if (!next || busy || document.visibilityState !== "visible" || navigator.onLine === false) return;
      setBusy(true);
      void ask(next.text, true).then((r) => { setSaid(r); setBusy(false); });
    }, NOTES.everyMs);
    return () => clearInterval(t);
  }, [on, busy]); // eslint-disable-line react-hooks/exhaustive-deps
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
        : UNREACHED.has(said.error) && waiting?.length ? <p className="note">Kept as a note — the AI couldn't be reached, so it'll read it on its own once it can. {said.message}</p>
        : <p className="err">Kept as a note. {said.message}</p>)}
    </div>
  );
}
