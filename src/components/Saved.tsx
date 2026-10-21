/**
 * Saved for later, at the top of the AI tab (PLAN 159): the read items you starred — what it is, what to do, its source —
 * folded to one line so the chat stays first. "Tried it" marks one done (it's no longer followed up); Remove drops it.
 */

import { act, useStore } from "../lib/store";
import { dayLabel } from "../lib/time";

const KIND: Record<string, string> = { fact: "Fun fact", study: "Study", pattern: "Your data", protocol: "Try this", try: "To try", noticed: "Noticed" };

export function SavedCard() {
  const saved = useStore((s) => s.ai.saved) ?? [];
  if (!saved.length) return null;
  const open = saved.filter((s) => !s.tried).length;
  const set = (id: string, f: (x: (typeof saved)[number]) => (typeof saved)[number] | null) =>
    act.setAi((a) => ({ saved: (a.saved ?? []).flatMap((x) => (x.id === id ? (f(x) ? [f(x)!] : []) : [x])) }));
  return (
    <details className="card saved">
      <summary><span>☆ Saved for later</span><span className="sv-n">{saved.length}{open < saved.length ? ` · ${saved.length - open} tried` : ""}</span></summary>
      <ul>{saved.map((s) => (
        <li key={s.id} className={`sv mr-${s.type}`} data-tried={!!s.tried || undefined}>
          <div className="sv-top"><span className="mr-kind">{KIND[s.type] ?? s.type}</span><b>{s.title}</b></div>
          <p>{s.text}</p>
          {s.tip && <p className="sv-tip">{s.tip}</p>}
          <div className="sv-acts">
            <small>saved {dayLabel(s.savedAt)}{s.tried ? ` · tried ${dayLabel(s.tried)}` : ""}</small>
            {s.source && <a href={s.source.url} target="_blank" rel="noreferrer">{s.source.title} ↗</a>}
            <button type="button" className="linkish" aria-pressed={!!s.tried} onClick={() => set(s.id, (x) => ({ ...x, tried: x.tried ? undefined : Date.now() }))}>{s.tried ? "Not tried yet" : "Tried it"}</button>
            <button type="button" className="linkish" onClick={() => set(s.id, () => null)}>Remove</button>
          </div>
        </li>
      ))}</ul>
    </details>
  );
}
