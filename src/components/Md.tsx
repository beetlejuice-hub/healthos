/** The AI's reply with its bits of Markdown drawn (lib/mdlite): bold, italic, lists, http(s) links. Text only — never HTML. */

import { Fragment } from "react";
import { blocks, type Span } from "../lib/mdlite";
import { Pinned } from "./Pinned";

const line = (ss: Span[], u?: string[]) => ss.map((s, i) => (s.href ? <a key={i} href={s.href} target="_blank" rel="noopener noreferrer">{s.text} ↗</a>
  : s.b && s.i ? <b key={i}><i><Pinned text={s.text} marks={u} /></i></b> : s.b ? <b key={i}><Pinned text={s.text} marks={u} /></b> : s.i ? <i key={i}><Pinned text={s.text} marks={u} /></i> : <Fragment key={i}><Pinned text={s.text} marks={u} /></Fragment>));

/** `unpinned` (PLAN 225): numbers the AI wasn't given, drawn dotted. */
export function Md({ text, unpinned }: { text: string; unpinned?: string[] }) {
  return (
    <div className="md">
      {blocks(text).map((b, k) => (b.kind === "p"
        ? <p key={k}>{b.lines.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{line(l, unpinned)}</Fragment>)}</p>
        : b.kind === "ul" ? <ul key={k}>{b.items.map((it, i) => <li key={i}>{line(it, unpinned)}</li>)}</ul>
          : <ol key={k}>{b.items.map((it, i) => <li key={i}>{line(it, unpinned)}</li>)}</ol>))}
    </div>
  );
}
