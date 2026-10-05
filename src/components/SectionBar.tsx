/**
 * Insights → a bar to jump between sections (owner, 5 Oct: "nicer ui"). The page is long on a laptop;
 * this stays pinned under the app's top bar and marks where you are. Only sections that are on the
 * page get a button. Buttons scroll — not #links, because # is the app's own routing.
 */

import { useEffect, useState } from "react";

const SECTIONS: [string, string][] = [
  ["ins-glance", "This week"], ["ins-top", "Try"], ["ins-timeline", "Timeline"], ["ins-mind", "Mind"], ["ins-connections", "Connections"],
  ["ins-sleep", "Sleep"], ["ins-intake", "Intake & body"], ["ins-training", "Training & stack"], ["ins-data", "Your data"],
];

export function SectionBar({ version }: { version: unknown }) {
  const [present, setPresent] = useState<string[]>([]);
  const [on, setOn] = useState<string | null>(null);
  useEffect(() => {
    const ids = SECTIONS.map(([id]) => id).filter((id) => document.getElementById(id));
    setPresent(ids);
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setOn(vis.target.id);
    }, { rootMargin: "-90px 0px -60% 0px" });
    ids.forEach((id) => io.observe(document.getElementById(id)!));
    return () => io.disconnect();
  }, [version]);
  if (present.length < 3) return null;
  return (
    <nav className="secbar" aria-label="Insights sections">
      {SECTIONS.filter(([id]) => present.includes(id)).map(([id, name]) => (
        <button type="button" key={id} aria-current={on === id ? "true" : undefined} onClick={() => { document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); setOn(id); }}>{name}</button>
      ))}
    </nav>
  );
}
