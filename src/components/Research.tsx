/**
 * "Researched for you" in the AI tab (PLAN 192; owner, 3 Nov: "Ai should do researches on its own but do not let it soend
 * way too much credits. Like researxh on what i take what i eat how i train how much i move my heartrate"): what the app
 * looked into on its own, newest first — what's known, what it means for you, one thing to try, the sources — with what
 * it's cost this month against its own cap, and what's next or why it's waiting. Logic: lib/ai/research.
 */

import { useState } from "react";
import { act, useStore } from "../lib/store";
import { RESEARCH, researchUsd, type Researched } from "../lib/ai/research";
import { localDay, dayLabel } from "../lib/time";
import { researchNow } from "./Ai";
import { startExperiment } from "../lib/ai/experiment";

const NONE: Researched[] = [];
const SURE = { strong: "strong evidence", moderate: "some evidence", weak: "thin evidence" } as const;
const usd = (v: number) => `$${v.toFixed(2)}`;

export function ResearchList() {
  const running = useStore((st) => st.ai.experiments).filter((x) => !x.ended).map((x) => x.name);
  // the list itself, never a fresh [] (a new array each time loops the store's subscription — 3 Nov)
  const list = useStore((s) => s.ai.researched) ?? NONE, off = useStore((s) => s.ai.researchOff);
  const [open, setOpen] = useState<string | null>(null);
  if (!list.length) return null;
  const today = localDay(Date.now()), next = researchNow();
  const shown = [...list].reverse().slice(0, 12), newest = shown[0];
  const isOpen = (r: Researched) => open === `${r.key}${r.at}` || (open == null && r === newest && !r.seen);
  const toggle = (r: Researched) => {
    setOpen(isOpen(r) ? "" : `${r.key}${r.at}`);
    if (!r.seen) act.setAi((a) => ({ researched: (a.researched ?? []).map((x) => (x.key === r.key && x.at === r.at ? { ...x, seen: Date.now() } : x)) }));
  };
  return (
    <section className="card rs" aria-label="Researched for you">
      <h3>Researched for you <span>on its own · {usd(researchUsd(list, today))} of {usd(RESEARCH.monthUsd)} this month</span></h3>
      <p className="note rs-next">{off ? "Off — Settings → AI turns it back on." : "topic" in next ? `Next: ${next.topic.name}.` : `Next: waiting — ${next.wait}.`}</p>
      <ul className="rs-list">{shown.map((r) => (
        <li key={`${r.key}${r.at}`} data-open={isOpen(r) || undefined}>
          <button type="button" className="rs-head" aria-expanded={isOpen(r)} onClick={() => toggle(r)}>
            <b>{r.title}</b><small>{dayLabel(r.at)} · {r.name} · {SURE[r.sure]}{r.seen ? "" : " · new"}</small>
          </button>
          {isOpen(r) && <div className="rs-body">
            <p>{r.known}</p>
            {r.forYou && <p><b>For you:</b> {r.forYou}</p>}
            {r.tip && <p className="rs-tip"><b>Try:</b> {r.tip}</p>}
            {r.protocol && <div className="rs-proto"><p><b>A protocol to test it on you:</b> {r.protocol.name} — {r.protocol.how} ({r.protocol.days} days; the app watches {r.protocol.measure})</p>
              {running.includes(r.protocol.name) ? <p className="note">Running — see Insights → Experiments.</p>
                : <button type="button" className="pill-btn pri" onClick={() => startExperiment(r.protocol!)}>Try it for {r.protocol.days} days</button>}</div>}
            {r.found.length > 0 && <ul className="rs-src">{r.found.map((f) => <li key={f.source.url}><a href={f.source.url} target="_blank" rel="noreferrer">{f.source.title}{f.source.checked ? " ✓" : ""}</a> — {f.text}</li>)}</ul>}
            <small className="rs-cost">Cost {usd(r.usd)}</small>
          </div>}
        </li>
      ))}</ul>
    </section>
  );
}
