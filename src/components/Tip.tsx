/**
 * Insights' one tooltip (owner, 5 Oct: "nicer ui"). Any element with `data-tip` gets it: the first
 * line bold, the rest under it. Appears instantly on hover, on tap (touch) and on keyboard focus —
 * the browser's own title tooltips were slow, small and couldn't be styled.
 */

import { useEffect, useState } from "react";

type Shown = { text: string; x: number; y: number };

export function Tip() {
  const [tip, setTip] = useState<Shown | null>(null);
  useEffect(() => {
    let pinned = false;
    const find = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement | SVGElement>("[data-tip]") : null);
    const show = (el: Element, x: number, y: number) => setTip({ text: el.getAttribute("data-tip") ?? "", x, y });
    const move = (e: PointerEvent) => { if (e.pointerType !== "mouse") return; const el = find(e.target); if (el) show(el, e.clientX, e.clientY); else if (!pinned) setTip(null); };
    const down = (e: PointerEvent) => { if (e.pointerType === "mouse") return; const el = find(e.target); pinned = !!el; if (el) show(el, e.clientX, e.clientY); else setTip(null); };
    const focus = (e: FocusEvent) => { const el = find(e.target); if (el) { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); } };
    const blur = () => { if (!pinned) setTip(null); };
    const hide = () => { pinned = false; setTip(null); };
    document.addEventListener("pointermove", move); document.addEventListener("pointerdown", down);
    document.addEventListener("focusin", focus); document.addEventListener("focusout", blur); window.addEventListener("scroll", hide, { passive: true });
    return () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerdown", down); document.removeEventListener("focusin", focus); document.removeEventListener("focusout", blur); window.removeEventListener("scroll", hide); };
  }, []);
  if (!tip?.text) return null;
  const [head, ...rest] = tip.text.split("\n");
  const left = Math.max(8, Math.min(tip.x + 14, window.innerWidth - 300)), above = tip.y > 140;
  return (
    <div className="tipbox" role="tooltip" style={{ left, ...(above ? { bottom: window.innerHeight - tip.y + 12 } : { top: tip.y + 18 }) }}>
      <b>{head}</b>{rest.map((l, i) => <span key={i}>{l}</span>)}
    </div>
  );
}
