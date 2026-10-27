/** The AI's reply with its bits of Markdown drawn (lib/mdlite): bold, italic, lists, http(s) links. Text only — never HTML. */

import { Fragment } from "react";
import { blocks, type Span } from "../lib/mdlite";

const line = (ss: Span[]) => ss.map((s, i) => (s.href ? <a key={i} href={s.href} target="_blank" rel="noopener noreferrer">{s.text} ↗</a>
  : s.b && s.i ? <b key={i}><i>{s.text}</i></b> : s.b ? <b key={i}>{s.text}</b> : s.i ? <i key={i}>{s.text}</i> : <Fragment key={i}>{s.text}</Fragment>));

export function Md({ text }: { text: string }) {
  return (
    <div className="md">
      {blocks(text).map((b, k) => (b.kind === "p"
        ? <p key={k}>{b.lines.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{line(l)}</Fragment>)}</p>
        : b.kind === "ul" ? <ul key={k}>{b.items.map((it, i) => <li key={i}>{line(it)}</li>)}</ul>
          : <ol key={k}>{b.items.map((it, i) => <li key={i}>{line(it)}</li>)}</ol>))}
    </div>
  );
}
