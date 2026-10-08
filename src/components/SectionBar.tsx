/**
 * Insights → its pages: a sidebar on a laptop, tabs pinned at the top on a phone, one page at a time on both
 * (owner, 8 Oct, picked on the canvas). Only pages with something in them get a button.
 */

import { useEffect, useState } from "react";

/**
 * The pages, in order (= the data-sec values on the page) and their names (owner, 8 Oct: "Should we do the
 * separate pages just like on the phone? … in one page i see one thing"). Laptop: a sidebar; phone: tabs.
 */
export const TABS: [string, string][] = [
  ["week", "Overview"], ["timeline", "Timeline"], ["heart", "Heart"], ["sleep", "Sleep"], ["mind", "Mind"],
  ["intake", "Food & body"], ["training", "Training"], ["connections", "Findings"], ["data", "Data"],
];

/** Pages with something in them. A page is there when any of its [data-sec] blocks has content — not
 * only its heading, so e.g. "still checking" cards under Findings get a page on a near-empty account. */
const tabsOnPage = () => TABS.map(([t]) => t).filter((t) => [...document.querySelectorAll(`.inst [data-sec="${t}"]`)].some((e) => e.childElementCount > 0));

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
