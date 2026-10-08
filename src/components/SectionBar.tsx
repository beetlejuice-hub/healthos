/**
 * Insights → a bar to jump between sections (owner, 5 Oct: "nicer ui"). The page is long on a laptop;
 * this stays pinned under the app's top bar and marks where you are. Only sections that are on the
 * page get a button. On a laptop buttons scroll; on a phone (owner, 5 Oct: "pls make the phone layout")
 * they are tabs that show one section at a time.
 */

import { useEffect, useState } from "react";

const SECTIONS: [string, string][] = [
  ["ins-glance", "This week"], ["ins-top", "Try"], ["ins-timeline", "Timeline"], ["ins-heart", "Heart"], ["ins-mind", "Mind"], ["ins-connections", "Connections"],
  ["ins-sleep", "Sleep"], ["ins-intake", "Intake & body"], ["ins-training", "Training & stack"], ["ins-data", "Your data"],
];

/** Phone tabs in order (= the data-sec values on the page) and their names. */
export const TABS: [string, string][] = [
  ["week", "This week"], ["timeline", "Timeline"], ["heart", "Heart"], ["mind", "Mind"], ["connections", "Connections"],
  ["sleep", "Sleep"], ["intake", "Intake & body"], ["training", "Training & stack"], ["data", "Your data"],
];

/** Tabs with something in them. A tab is there when any of its [data-sec] blocks has content — not
 * only its heading, so e.g. "still checking" cards under Connections get a tab on a near-empty account. */
const tabsOnPage = () => TABS.map(([t]) => t).filter((t) => [...document.querySelectorAll(`.inst [data-sec="${t}"]`)].some((e) => e.childElementCount > 0));

/**
 * `tab`: on a phone, the open tab (the bar switches tabs; `onTabs` hears which tabs have content);
 * null on a laptop (the bar scrolls).
 */
export function SectionBar({ version, tab, onTab, onTabs }: { version: unknown; tab: string | null; onTab: (t: string) => void; onTabs: (tabs: string[]) => void }) {
  const [present, setPresent] = useState<string[]>([]);
  const [on, setOn] = useState<string | null>(null);
  useEffect(() => {
    if (tab != null) { const ts = tabsOnPage(); setPresent(ts); onTabs(ts); return; }
    const ids = SECTIONS.map(([id]) => id).filter((id) => document.getElementById(id));
    setPresent(ids);
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setOn(vis.target.id);
    }, { rootMargin: "-90px 0px -60% 0px" });
    ids.forEach((id) => io.observe(document.getElementById(id)!));
    return () => io.disconnect();
  }, [version, tab, onTabs]);
  if (tab != null) return present.length < 2 ? null : (
    <nav className="secbar" aria-label="Insights sections">
      {TABS.filter(([t]) => present.includes(t)).map(([t, name]) => <button type="button" key={t} aria-current={t === tab ? "true" : undefined} onClick={() => onTab(t)}>{name}</button>)}
    </nav>
  );
  if (present.length < 3) return null;
  return (
    <nav className="secbar" aria-label="Insights sections">
      {SECTIONS.filter(([id]) => present.includes(id)).map(([id, name]) => (
        <button type="button" key={id} aria-current={on === id ? "true" : undefined} onClick={() => { document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); setOn(id); }}>{name}</button>
      ))}
    </nav>
  );
}
