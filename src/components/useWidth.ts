import { useEffect, useRef, useState, type RefObject } from "react";

/** The element's width, kept current (charts draw to it). */
export function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null), [w, setW] = useState(600);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setW(Math.max(260, el.clientWidth))); ro.observe(el); return () => ro.disconnect(); }, []);
  return [ref, w];
}
