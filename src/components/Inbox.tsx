/**
 * A message from the app in the AI tab's thread (PLAN 102): a heart-rate stretch to say what you were doing in, or a new
 * finding to comment on. Answers are saved where they count — a stretch's as a check-in's "what I was doing" in its middle
 * (as the Heart page saves it, so it explains the stretch everywhere), a finding's as an answer the AI reads — and shown
 * under the message as yours.
 */

import { useMemo, useState } from "react";
import { doingOrder, labelOf, tagsOf } from "../lib/feel";
import type { Notice } from "../lib/inbox";
import { nightLabel, nightTagOrder } from "../lib/lastnight";
import { act, getState, useStore } from "../lib/store";
import { atMinute, clock, dayLabel, localDay } from "../lib/time";
import type { Entry } from "../lib/types";

// owner, 31 Oct: "i should be able to just say my opinion to ai like it makes no sense to me"
const FINDING_REPLIES = ["Makes sense", "Makes no sense to me", "I knew that", "Surprising"];
/** Beside your last-night tags, for a low morning. */
const LOW_MORNING = ["ill", "stressed"];

/**
 * A low morning's answer joins that morning's last-night tags (PLAN 90), so it counts in the grids like one ticked on
 * Today. The sleep entry is made if the morning wasn't rated yet — inside the morning window, or it wouldn't be that
 * night's (lib/sleep's evenings read mornings 04:00–14:00).
 */
function tagMorning(day: string, tag: string) {
  const e = getState().entries.find((x): x is Extract<Entry, { kind: "sleep" }> => x.kind === "sleep" && localDay(x.at) === day);
  if (e) { if (!(e.tags ?? []).includes(tag)) act.updateEntry(e.id, { tags: [...(e.tags ?? []), tag] } as Partial<Entry>); return; }
  const now = Date.now(), h = new Date(now).getHours();
  act.addEntry({ kind: "sleep", at: localDay(now) === day && h >= 4 && h < 14 ? now : atMinute(day, 9 * 60), tags: [tag] });
}

function reply(n: Notice, text: string, patch: Partial<Notice> = {}) {
  act.setAi((a) => ({ inbox: (a.inbox ?? []).map((x) => (x.id === n.id ? { ...x, reply: { text, at: Date.now() }, ...patch } : x)) }));
}

export function InboxCard({ n, now, first }: { n: Notice; now: number; first?: boolean }) {
  const entries = useStore((s) => s.entries);
  const doings = useMemo(() => doingOrder(entries, now).slice(0, 6), [entries, now]);
  const nightTags = useMemo(() => [...new Set([...nightTagOrder(entries, now).slice(0, 5), ...LOW_MORNING])], [entries, now]);
  const [own, setOwn] = useState(""), [other, setOther] = useState(false);
  // more than one (owner, 20 Oct: "Even at ai page i should be able to choose multiple answers for a question"): tap to
  // pick, your own word joins them, Send saves them together
  const [picked, setPicked] = useState<string[]>([]);
  const pick = (t: string) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const tags = [...new Set([...picked, ...tagsOf(own)])];
  const when = `${localDay(n.at) === localDay(now) ? "" : `${dayLabel(n.at)} `}${clock(n.at)}`;
  const said = (ts: string[]) => {
    if (!ts.length || !n.span) return;
    act.addEntry({ kind: "feel", at: Math.round((n.span.start + n.span.end) / 2), doing: ts });
    reply(n, ts.map(labelOf).join(", "));
  };
  const answer = (text: string) => {
    const t = text.trim();
    if (!t) return;
    act.addEntry({ kind: "answer", at: Date.now(), key: n.id, question: n.text, answer: t });
    reply(n, t);
  };
  const tagged = (ts: string[]) => { if (ts.length && n.day) { ts.forEach((t) => tagMorning(n.day!, t)); reply(n, ts.map(nightLabel).join(", ")); } };
  const sendBtn = (go: (ts: string[]) => void) => <button type="button" className="pill-btn pri ib-send" disabled={!tags.length} onClick={() => go(tags)}>Send{tags.length > 1 ? ` ${tags.length}` : ""}</button>;
  const waiting = !n.reply && !n.closed;
  return (
    <>
      <div className={`msg byapp${waiting ? " waiting" : ""}`} data-notice={n.id} data-kind={n.kind} data-new={first || undefined}>
        <small className="from">From the app · {when}</small>
        <b>{n.title}</b>
        <p>{n.text}</p>
        {n.kind === "raised" && waiting && (
          <div className="hn-tags ib-tags">
            {doings.map((t) => <button key={t} type="button" aria-pressed={picked.includes(t)} onClick={() => pick(t)}>{labelOf(t)}</button>)}
            <input aria-label="What you were doing, in your words" placeholder="your words" value={own} onChange={(e) => setOwn(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") said(tags); }} />
            {sendBtn(said)}
          </div>
        )}
        {n.kind === "readiness" && waiting && (
          <div className="hn-tags ib-tags">
            {nightTags.map((t) => <button key={t} type="button" aria-pressed={picked.includes(t)} onClick={() => pick(t)}>{nightLabel(t)}</button>)}
            <input aria-label="What happened, in your words" placeholder="your words" value={own} onChange={(e) => setOwn(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") tagged(tags); }} />
            {sendBtn(tagged)}
            <a className="linkish ib-log" href="#log">Drinks or food not logged? Log them →</a>
          </div>
        )}
        {n.kind === "finding" && waiting && (
          <div className="hn-tags ib-tags">
            {FINDING_REPLIES.map((r) => <button key={r} type="button" onClick={() => answer(r)}>{r}</button>)}
            <button type="button" aria-pressed={other} onClick={() => setOther(!other)}>Something else was going on</button>
            {other && <span className="ib-say">
              <input aria-label="What was going on, in your words" placeholder="e.g. those were nights out" value={own} onChange={(e) => setOwn(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") answer(own); }} />
              <button type="button" className="pill-btn pri" disabled={!own.trim()} onClick={() => answer(own)}>Send</button>
            </span>}
          </div>
        )}
        {waiting && <button type="button" className="linkish ib-skip" onClick={() => act.setAi((a) => ({ inbox: (a.inbox ?? []).map((x) => (x.id === n.id ? { ...x, closed: true } : x)) }))}>{n.kind === "finding" ? "Not now" : n.kind === "raised" ? "Can't remember" : "Nothing special"}</button>}
        {n.closed && !n.reply && <small className="ib-closed">{n.kind === "raised" ? "Closed — skipped, or explained by something you logged since." : "Skipped."}</small>}
      </div>
      {n.reply && <div className="msg user ib-reply" data-reply-to={n.id}>{n.reply.text}</div>}
    </>
  );
}
