/**
 * "Noticed something?" on Today (PLAN 135; owner, 20 Oct: "a small text box where i can write things like I went
 * downstairs to do something, something else distracted me, came back up and realized i didnt do what i wanted … mental
 * and physical notices i see and realize"). Since 22 Oct, anything at face value (owner: "just face value, so i can input
 * whatever, a finding, a new supp that makes me feel good, ai can understand everything and make changes/ sort things/
 * start ivestigating based on what i say"): kept as a note as before, and the AI reads it now — proposes the change (tap
 * Apply), remembers what lasts, looks into it — and says so under the box. Undo for a slip. Since 11 Nov (owner: "if i
 * write something to noticed something ai doesnt have to answer right away, just note it and later look into it, or
 * connect to other things"): saving only notes it and puts it on the AI's list to look into — the next read or the deep
 * dive takes it first, with the rest of his data; "Ask now" is there for when he wants an answer on the spot.
 */

import { useEffect, useState } from "react";
import { act, getState, newId, offerUndo, useStore } from "../lib/store";
import { ABOUT_NOTICE, askChat, type ChatReply } from "../lib/ai/chat";
import { addThreads } from "../lib/ai/said";
import { useAiStatus } from "../lib/ai/client";
import { Md } from "./Md";
import { Proposals } from "./Proposal";

/** The AI couldn't be reached at all (not a refusal, a limit or a bug): the note waits and is read later (PLAN 202). */
const UNREACHED = new Set(["no-server", "offline", "timeout"]);
const NOTES = { everyMs: 60_000, tries: 6 } as const;

export function NoticeBox() {
  const { on } = useAiStatus();
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [said, setSaid] = useState<ChatReply | null>(null), [kept, setKept] = useState<string | null>(null);
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
  const save = () => {
    const t = text.trim(); if (!t || busy) return;
    const now = Date.now(), e = act.addEntry({ kind: "notice", at: now, text: t }); setText(""); setSaid(null); setKept(t);
    // on the list the reads and the deep dive take first: looked into later, against everything else
    act.setAi((a) => ({ threads: addThreads(a.threads ?? [], [`You noticed: "${t.slice(0, 150)}" — what it goes with in your data, and what's known about it`], now, () => newId().slice(0, 6)) }));
    offerUndo([e.id], "Noted");
  };
  const askNow = async () => {
    if (!kept || busy) return;
    setBusy(true);
    setSaid(await ask(kept, false));
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
        <input value={text} placeholder="A finding, a supplement that feels good, how you slept…" aria-label="Something you noticed" maxLength={500} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
        <button type="button" className="pill-btn" disabled={!text.trim() || busy} onClick={save}>Save</button>
      </div>
      {kept && !said && !busy && <p className="note nb-kept">Noted. The AI looks into it in its next read and connects it to the rest of your data.{on && <> <button type="button" className="linkish" onClick={() => void askNow()}>Ask now ›</button></>}</p>}
      {busy && <p className="ask-reply typing" aria-live="polite">…</p>}
      {said && (said.ok ? <div className="ask-reply" aria-live="polite"><Md text={said.reply} />
        {said.proposals.length > 0 && <Proposals at={said.at} list={said.proposals} now={said.at} />}
        <a className="linkish" href="#ai">More in the AI tab ›</a></div>
        : UNREACHED.has(said.error) && waiting?.length ? <p className="note">Kept as a note — the AI couldn't be reached, so it'll read it on its own once it can. {said.message}</p>
        : <p className="err">Kept as a note. {said.message}</p>)}
    </div>
  );
}
