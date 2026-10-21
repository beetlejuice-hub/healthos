/**
 * A Today card folded to its one-line read (owner, 21 Oct, PLAN 151: supplements "in one place", and the Caffeine and Food
 * cards "fold both" — Today was three phone screens long). The heading and its read stay; a tap opens the rest. Folded
 * every time Today opens; anything that sends you to the card (the Stack tile, "Pick…") opens it (lib/nav openCard).
 */

import { useEffect, useState, type ReactNode } from "react";
import { OPEN_CARD } from "../lib/nav";

export function FoldCard({ id, title, read, more, children }: { id: string; title: string; read: ReactNode; /** the folded card's second line */ more?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent<string>).detail === id) setOpen(true); };
    window.addEventListener(OPEN_CARD, on);
    return () => window.removeEventListener(OPEN_CARD, on);
  }, [id]);
  return (
    <div className={`card fold${open ? " open" : ""}`} id={id}>
      <button type="button" className="fold-head" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen(!open)}>
        <h3>{title} <span>{read}</span></h3>
        <i className="chev" aria-hidden="true">{open ? "▴" : "▾"}</i>
      </button>
      {!open && more && <p className="fold-more">{more}</p>}
      {open && <div className="fold-body" id={`${id}-body`}>{children}</div>}
    </div>
  );
}
