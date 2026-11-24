/**
 * Insights' first card (PLAN 225; owner, 17 Nov: "3"): what changed since you last looked — trends that turned, links
 * new or gone, findings firmer or fainter (lib/sincelast). Kept on this device; the first visit only takes note. Waits
 * for the band's data, so a link that's just not loaded yet isn't called gone — then works it out once for the visit
 * (not again on every chunk of band data streaming in: that made the heavy pages crawl).
 */

import { useEffect, useState } from "react";
import { getBand, useBand } from "../lib/band-client";
import { linkWords } from "../lib/connect";
import { evidence } from "../lib/evidence";
import { EFFECT_DAYS } from "../lib/findings";
import { dailyFacts } from "../lib/insights";
import { linksFor } from "../lib/linkscache";
import { changesSince, rollSeen, type Change, type Mark, type Seen, type SeenStore } from "../lib/sincelast";
import { getState } from "../lib/store";
import { addDays, localDay } from "../lib/time";
import { trendOf } from "../lib/trends";
import { measuresOf } from "../lib/measures";
import { useEnrich } from "./useEvidence";

const KEY = "healthos.sincelast";
const TAG: Record<string, string> = { new: "New", turned: "Turned", gone: "Gone", firmer: "Firmer", fainter: "Fainter" };
const read = (): SeenStore => { try { return (JSON.parse(localStorage.getItem(KEY) ?? "") as SeenStore) ?? { base: null, last: null }; } catch { return { base: null, last: null }; } };

/** Every trend's way, every link, every clear or likely finding — what the card compares. */
function marksNow(now: number, enrich: ReturnType<typeof useEnrich>): Mark[] {
  const st = getState(), band = getBand().data, today = localDay(now);
  const ts = measuresOf(st.entries, st.workouts, st.settings, band, now).flatMap((m) => { const t = trendOf(m, today, 30); return t && m.better !== 0 ? [{ key: `t:${m.key}`, kind: "trend" as const, name: m.name, state: t.tone, href: "#insights" }] : []; });
  const { things, links } = linksFor(st.entries, st.workouts, st.settings, band, st.imports, today), by = new Map(things.map((t) => [t.key, t]));
  const ls = links.map((l) => ({ key: `l:${l.from}>${l.to}@${l.lag}`, kind: "link" as const, name: linkWords(l, by).split(" (90 %")[0], state: l.rho > 0 ? "+" : "−", href: "#insights/connections" }));
  const ev = evidence(enrich(dailyFacts(st.entries, st.workouts, st.settings, addDays(today, -EFFECT_DAYS), addDays(today, -1))), st.supplements);
  const fs = [...ev].flatMap(([k, { word, r }]) => (word === "clear" || word === "likely" ? [{ key: `e:${k}`, kind: "finding" as const, name: `${r.q.thing} and ${r.o.name.toLowerCase()}`, state: word, href: "#insights/connections" }] : []));
  return [...ts, ...ls, ...fs];
}

export function SinceLast({ now }: { now: number }) {
  // ready when the band's data is in (or there's none to wait for); a band that never answers is waited for 4 s
  const b = useBand(), enrich = useEnrich(), [waited, setWaited] = useState(false);
  useEffect(() => { const t = setTimeout(() => setWaited(true), 4000); return () => clearTimeout(t); }, []);
  const ready = !b.loading && (b.status === "off" || (b.status != null && (!b.status.connected || !!b.data)) || waited);
  const [shown, setShown] = useState<{ base: Seen; cs: Change[] } | null | undefined>(undefined);
  useEffect(() => {
    if (!ready || shown !== undefined) return;
    const marks = marksNow(now, enrich), store = rollSeen(read(), marks, now);
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode: not kept */ }
    setShown(store.base ? { base: store.base, cs: changesSince(store.base, marks) } : null);
  }, [ready, shown, now, enrich]);
  if (!shown) return null;
  const when = new Date(shown.base.at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return (
    <section className="p w12 since" aria-label="Since you last looked" data-sec="week">
      <h2>Since you last looked <span>{when}</span></h2>
      {shown.cs.length ? <ul className="since-list">{shown.cs.map((c) => (
        <li key={c.key} data-tag={c.tag} data-kind={c.kind} data-tone={c.tone}><a href={c.href}><i>{TAG[c.tag]}</i><span>{c.text}</span></a></li>))}</ul>
        : <p className="since-none">Nothing has moved — the same trends, links and findings as then.</p>}
    </section>
  );
}
