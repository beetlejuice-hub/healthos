/**
 * A number the AI wrote that the app didn't give it (PLAN 225, lib/ai/pin), drawn dotted with why on hover/long-press —
 * so a misremembered number can't pass as one of yours. Everything else as it was.
 */

import { Fragment } from "react";
import { splitPinned } from "../lib/ai/pin";

export const UNPINNED_WHY = "Not one of your numbers: the app didn't give the AI this one — check it";

export function Pinned({ text, marks }: { text: string; marks?: string[] }) {
  if (!marks?.length) return <>{text}</>;
  return <>{splitPinned(text, marks).map((p, i) => (p.unpinned ? <span key={i} className="unpin" title={UNPINNED_WHY}>{p.text}</span> : <Fragment key={i}>{p.text}</Fragment>))}</>;
}

/** Under a read with any: what the dotted ones mean. */
export function PinnedNote({ marks }: { marks?: string[] }) {
  if (!marks?.length) return null;
  return <p className="note unpin-note"><span className="unpin" title={UNPINNED_WHY}>{marks[0]}</span> dotted: {marks.length === 1 ? "a number" : `${marks.length} numbers`} the AI wrote that the app didn't give it — check {marks.length === 1 ? "it" : "them"}.</p>;
}
