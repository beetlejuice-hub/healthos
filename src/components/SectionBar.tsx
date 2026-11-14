/**
 * Insights → its pages: a sidebar on a laptop, tabs pinned at the top on a phone, one page at a time on both
 * (owner, 8 Oct, picked on the canvas). Only pages with something in them get a button.
 */

import { useEffect, useState } from "react";

/**
 * The pages, in order (= the data-sec values on the page) and their names (owner, 8 Oct: "Should we do the
 * separate pages just like on the phone? … in one page i see one thing"). Laptop: a sidebar; phone: tabs.
 */
/**
 * Five pages, not ten (owner, 14 Nov, item 2 of the open list; canvas A "five tabs, sections inside"): Trends, Body (sleep,
 * heart, mind), Fuel, Training, Lab (findings, body lab, the timeline, how the numbers are made). The old pages are
 * sections now: their names still open the right page at the right place (#insights/sleep → Body, at Sleep).
 */
export const TABS: [string, string][] = [["week", "Trends"], ["body", "Body"], ["intake", "Fuel"], ["training", "Training"], ["lab", "Lab"]];
/** The sections inside a page, in the order they're shown; a page with none is its own one section. */
export const PARTS: Record<string, [string, string][]> = {
  body: [["sleep", "Sleep"], ["heart", "Heart"], ["mind", "Mind"]],
  lab: [["connections", "Findings"], ["lab", "Body lab"], ["timeline", "Timeline"], ["data", "Data"]],
};
export const secsOf = (t: string) => PARTS[t]?.map(([x]) => x) ?? [t];
/** The page a section (or an old page's name) is on. */
export const tabFor = (sec: string) => (TABS.some(([t]) => t === sec) ? sec : Object.entries(PARTS).find(([, ps]) => ps.some(([x]) => x === sec))?.[0] ?? sec);
const hasContent = (sec: string) => [...document.querySelectorAll(`.inst [data-sec="${sec}"]`)].some((e) => e.childElementCount > 0);
/** The sections of a page that have something in them. */
export const partsOnPage = (t: string) => (PARTS[t] ?? []).filter(([x]) => hasContent(x));

/** Pages with something in them. A page is there when any of its [data-sec] blocks has content — not
 * only its heading, so e.g. "still checking" cards under Findings get a page on a near-empty account. */
const tabsOnPage = () => TABS.map(([t]) => t).filter((t) => secsOf(t).some(hasContent));

/**
 * The page list. `values`: a small live number beside a page's name in the laptop sidebar ("71 bpm").
 * `onTabs` hears which pages have content.
 */
export function SectionBar({ version, tab, onTab, onTabs, values }: { version: unknown; tab: string; onTab: (t: string) => void; onTabs: (tabs: string[]) => void; values?: Record<string, string> }) {
  const [present, setPresent] = useState<string[]>([]);
  useEffect(() => { const ts = tabsOnPage(); setPresent(ts); onTabs(ts); }, [version, tab, onTabs]);
  if (present.length < 2) return null;
  return (
    <nav className="secbar" aria-label="Insights pages">
      {TABS.filter(([t]) => present.includes(t)).map(([t, name]) => (
        <button type="button" key={t} aria-current={t === tab ? "page" : undefined} onClick={() => onTab(t)}>
          <span>{name}</span>{values?.[t] ? <small>{values[t]}</small> : null}
        </button>
      ))}
    </nav>
  );
}
