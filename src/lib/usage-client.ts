/**
 * Counting which cards he uses, in the browser (item 15, 14 Nov; lib/usage). A card is any section with a name
 * (aria-label). Seen: half of it on screen for a second, once per screen visit (a visit ends when the address changes or
 * the app goes to the background). Used: a tap inside it, or a fold in it opened. Kept on this phone only.
 */

import { useSyncExternalStore } from "react";
import { record, type Usage } from "./usage";

const KEY = "healthos.usage";
let usage: Usage = {};
const subs = new Set<() => void>();
let saveT: ReturnType<typeof setTimeout> | null = null;
const bump = (key: string | null | undefined, kind: "seen" | "used") => {
  if (!key) return;
  usage = record(usage, key, kind, Date.now());
  subs.forEach((f) => f());
  if (saveT) clearTimeout(saveT);
  saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(usage)); } catch { /* full or blocked */ } }, 1000);
};
/** The card a node is in: the nearest named section (the tab bar and dialogs aren't cards). */
const cardOf = (el: Element | null) => el?.closest("section[aria-label]")?.getAttribute("aria-label") ?? null;

export function resetUsage() { usage = {}; try { localStorage.removeItem(KEY); } catch { /* blocked */ } subs.forEach((f) => f()); }
export const useUsage = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => usage, () => usage);

let started = false;
export function startUsage(): void {
  if (started || typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;
  started = true;
  try { usage = JSON.parse(localStorage.getItem(KEY) || "{}") as Usage; } catch { usage = {}; }
  // used: a tap inside a card (capture: before a card's own handler moves or removes it); a fold opened
  document.addEventListener("click", (e) => { const t = e.target as Element | null; if (t && !t.closest("nav")) bump(cardOf(t), "used"); }, true);
  document.addEventListener("toggle", (e) => { const d = e.target as HTMLDetailsElement; if (d.open) bump(cardOf(d) ?? d.querySelector("summary")?.textContent?.split(":")[0].slice(0, 60), "used"); }, true);
  // seen: half on screen for a second, once a visit
  let seenThisVisit = new Set<string>();
  const timers = new Map<Element, ReturnType<typeof setTimeout>>();
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      const k = e.target.getAttribute("aria-label");
      if (!k) continue;
      if (e.isIntersecting) { if (!timers.has(e.target) && !seenThisVisit.has(k)) timers.set(e.target, setTimeout(() => { timers.delete(e.target); if (!seenThisVisit.has(k)) { seenThisVisit.add(k); bump(k, "seen"); } }, 1000)); }
      else { const t = timers.get(e.target); if (t) { clearTimeout(t); timers.delete(e.target); } }
    }
  }, { threshold: 0.5 });
  const watched = new WeakSet<Element>();
  const attach = () => document.querySelectorAll("section[aria-label]").forEach((s) => { if (!watched.has(s)) { watched.add(s); io.observe(s); } });
  let pend: ReturnType<typeof setTimeout> | null = null;
  new MutationObserver(() => { if (!pend) pend = setTimeout(() => { pend = null; attach(); }, 300); }).observe(document.body, { childList: true, subtree: true });
  attach();
  const newVisit = () => { seenThisVisit = new Set(); };
  addEventListener("hashchange", newVisit);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") newVisit(); });
}
