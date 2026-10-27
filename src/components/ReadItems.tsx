/**
 * A read's items, the morning's and the evening's alike (PLAN 150, 157): a row per item — its kind, its title, and folded
 * a small chart of the number it's about; open, its two sentences, what to do ("Today" in the morning, "Tomorrow" at
 * night), the 14 days drawn from your own data, its source, and a protocol's "Try it". Keyed by the card's open state by
 * the caller, so folding the card closes the open item. ☆ saves one for later (PLAN 159).
 */

import { SourceLink } from "./SourceLink";
import { useMemo, useState } from "react";
import { act, useStore } from "../lib/store";
import { dailyFacts } from "../lib/insights";
import { measureDays } from "../lib/ai/digestchart";
import { useBand } from "../lib/band-client";
import { startExperiment } from "../lib/ai/experiment";
import { isSaved, toggleSaved } from "../lib/ai/saved";
import type { DigestItem, DigestMeasure, Sure } from "../lib/ai/tasks";
import { addDays, localDay } from "../lib/time";
import { DigestChart, MiniChart } from "./DigestChart";
import { LeadChart } from "./LeadChart";
import { AskAbout } from "./AskAbout";
import { aboutItem } from "../lib/ai/chat";

const KIND: Record<DigestItem["type"], string> = { fact: "Fun fact", study: "New study", pattern: "Your data", protocol: "Try this", try: "New to try", noticed: "Noticed", connection: "Connection" };
/** How sure, in words (owner, 22 Oct: "make ai more smarter and cautious"). */
const SURE_WORDS: Record<Sure, string> = { yours: "your data", strong: "strong studies", some: "some studies", anecdote: "anecdote, not studied" };

export function ReadItems({ items, open, onOpen, tip, from, day }: { items: DigestItem[]; open: boolean; onOpen: () => void; tip: "Today" | "Tomorrow"; from: "morning" | "evening"; day: string }) {
  const experiments = useStore((s) => s.ai.experiments), saved = useStore((s) => s.ai.saved);
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), settings = useStore((s) => s.settings), goals = useStore((s) => s.goals);
  const running = experiments.filter((x) => !x.ended).map((x) => x.name);
  const today = localDay(Date.now());
  const [row, setRow] = useState<number | null>(null);
  const charted = items.some((i) => i.measure);
  const facts = useMemo(() => (charted ? dailyFacts(entries, workouts, settings, addDays(today, -13), today) : []), [charted, entries, workouts, settings, today]);
  // the band's measures (skin temperature, breathing, blood oxygen, VO2 max — PLAN 52) come from the band
  const band = useBand().data;
  const series = useMemo(() => items.map((i) => (i.measure ? measureDays(i.measure, facts, entries, today, 14, band) : null)), [items, facts, entries, today, band]);
  const goalOf = (k: DigestMeasure) => (k === "protein" ? goals.p : k === "kcal" ? goals.kcal : undefined);
  return (
    <ul className="mr-list">{items.map((i, k) => {
      const on = open && row === k, vals = series[k];
      return (
        <li key={k} className={`mr mr-${i.type}`} data-open={on || undefined}>
          <button type="button" className="mr-row" aria-expanded={on} onClick={() => { if (!open) onOpen(); setRow(on ? null : k); }}>
            <span className="mr-kind">{i.lead ? "Your data · tested" : KIND[i.type]}</span><b>{i.title}</b>
            {!open && i.measure && vals && <MiniChart k={i.measure} vals={vals} />}
            <span className="chev" aria-hidden="true">{on ? "▴" : "▾"}</span>
          </button>
          {on && <div className="mr-body">
            {/* a connection's links, each with how sure it is; then what it means */}
            {i.chain && <ol className="mr-chain">{i.chain.map((c, n) => <li key={n}><span>{c.step}</span><i className={`sure sure-${c.sure}`}>{SURE_WORDS[c.sure]}</i></li>)}</ol>}
            <p>{i.sure && !i.chain && <i className={`sure sure-${i.sure}`}>{SURE_WORDS[i.sure]}</i>}{i.text}</p>
            {i.tip && <p className="mr-tip"><small>{tip}</small>{i.tip}</p>}
            {i.lead ? <LeadChart lead={i.lead} /> : i.measure && vals && <DigestChart k={i.measure} vals={vals} today={today} goal={goalOf(i.measure)} />}
            {i.source && <SourceLink s={i.source} />}
            {/* talk back to it (PLAN 164): "for me it's the opposite", or what food or supplement helps */}
            <AskAbout key={`${day}:${i.title}`} about={aboutItem(i, from, day)} label={`Re “${i.title}”`} placeholder="Ask or tell the AI about this…"
              starters={["For me it's the opposite", "What food or supplement helps with this?"]} />
            <div className="mr-acts">
              {i.protocol && (running.includes(i.protocol.name)
                ? <p className="note">Running — see Insights → Experiments.</p>
                : <button type="button" className="pill-btn pri" onClick={() => startExperiment(i.protocol!)}>Try it for {i.protocol.days} days</button>)}
              {/* PLAN 159: keep it past the next read — in the AI tab, and asked about in a couple of days if not tried */}
              <button type="button" className="pill-btn mr-save" aria-pressed={isSaved(saved, i)} onClick={() => act.setAi((a) => ({ saved: toggleSaved(a.saved, i, from, day, Date.now()) }))}>
                {isSaved(saved, i) ? "★ Saved" : "☆ Save for later"}</button>
            </div>
          </div>}
        </li>
      );
    })}</ul>
  );
}
