/**
 * Press and hold, or swipe left, on a row (owner, 3 Nov: "maybe we can do long press and add options there or swipe"):
 * `open` once. Held still for HOLD.ms, or moved HOLD.swipePx to the left (mostly sideways — scrolling stays scrolling);
 * a right click or Android's long-press menu does it too. The tap that ends a hold doesn't also tap what's under it.
 */

import { useRef, type MouseEvent, type PointerEvent } from "react";

export const HOLD = { ms: 450, swipePx: 60, still: 10 } as const;

export function useHold(open: () => void) {
  const s = useRef<{ x: number; y: number; t: ReturnType<typeof setTimeout> | null; fired: boolean } | null>(null);
  const stop = () => { const c = s.current; if (c?.t) { clearTimeout(c.t); c.t = null; } };
  const fire = () => { const c = s.current; if (!c || c.fired) return; c.fired = true; stop(); navigator.vibrate?.(10); open(); };
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) { s.current = null; return; }
      stop();
      s.current = { x: e.clientX, y: e.clientY, t: null, fired: false };
      s.current.t = setTimeout(fire, HOLD.ms);
    },
    onPointerMove: (e: PointerEvent) => {
      const c = s.current;
      if (!c || c.fired) return;
      const dx = e.clientX - c.x, dy = e.clientY - c.y;
      if (Math.hypot(dx, dy) > HOLD.still) stop();
      if (dx < -HOLD.swipePx && Math.abs(dy) < Math.abs(dx) / 2) fire();
    },
    onPointerUp: stop,
    onPointerCancel: () => { stop(); s.current = null; },
    onContextMenu: (e: MouseEvent) => { e.preventDefault(); if (!s.current) s.current = { x: 0, y: 0, t: null, fired: false }; fire(); },
    onClickCapture: (e: MouseEvent) => { if (s.current?.fired) { e.preventDefault(); e.stopPropagation(); s.current = null; } },
  };
}
