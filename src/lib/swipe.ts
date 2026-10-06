/**
 * Insights on a phone: which tab a sideways swipe opens (owner, 5 Oct: "do what u see reasonable" — tabs
 * you can swipe, like a phone's own). Only a clear, quick, mostly-sideways flick counts, so scrolling
 * down a chart that drifts a little never jumps tabs.
 */

export const SWIPE = { minDx: 60, ratio: 2, maxMs: 700 };

/** The tab a swipe opens: left → the next one, right → the one before; null when it isn't a swipe or there's no tab that way. */
export function swipeTo(tabs: string[], tab: string, dx: number, dy: number, ms: number): string | null {
  if (Math.abs(dx) < SWIPE.minDx || Math.abs(dx) < SWIPE.ratio * Math.abs(dy) || ms > SWIPE.maxMs) return null;
  const i = tabs.indexOf(tab);
  if (i < 0) return null;
  const j = dx < 0 ? i + 1 : i - 1;
  return j >= 0 && j < tabs.length ? tabs[j] : null;
}
