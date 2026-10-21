/**
 * A read's items, the morning's and the evening's alike (PLAN 150, 157): a row per item — its kind, its title, and folded
 * a small chart of the number it's about; open, its two sentences, what to do ("Today" in the morning, "Tomorrow" at
 * night), the 14 days drawn from your own data, its source, and a protocol's "Try it". Keyed by the card's open state by
 * the caller, so folding the card closes the open item.
 */

import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { dailyFacts } from "../lib/insights";
import { measureDays } from "../lib/ai/digestchart";
import { startExperiment } from "../lib/ai/experiment";
import type { DigestItem, DigestMeasure } from "../lib/ai/tasks";
import { addDays, localDay } from "../lib/time";
import { DigestChart, MiniChart } from "./DigestChart";

const KIND: Record<DigestItem["type"], string> = { fact: "Fun fact", study: "New study", pattern: "Your data", protocol: "Try this", try: "New to try", noticed: "Noticed" };

export function ReadItems({ items, open, onOpen, tip }: { items: DigestItem[]; open: boolean; onOpen: () => void; tip: "Today" | "Tomorrow" }) {
  const experiments = useStore((s) => s.ai.experiments);
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), settings = useStore((s) => s.settings), goals = useStore((s) => s.goals);
  const running = experiments.filter((x) => !x.ended).map((x) => x.name);
  const today = localDay(Date.now());
  const [row, setRow] = useState<number | null>(null);
  const charted = items.some((i) => i.measure);
  const facts = useMemo(() => (charted ? dailyFacts(entries, workouts, settings, addDays(today, -13), today) : []), [charted, entries, workouts, settings, today]);
  const series = useMemo(() => items.map((i) => (i.measure ? measureDays(i.measure, facts, entries, today) : null)), [items, facts, entries, today]);
  const goalOf = (k: DigestMeasure) => (k === "protein" ? goals.p : k === "kcal" ? goals.kcal : undefined);
  return (
    <ul className="mr-list">{items.map((i, k) => {
      const on = open && row === k, vals = series[k];
      return (
        <li key={k} className={`mr mr-${i.type}`} data-open={on || undefined}>
          <button type="button" className="mr-row" aria-expanded={on} onClick={() => { if (!open) onOpen(); setRow(on ? null : k); }}>
            <span className="mr-kind">{KIND[i.type]}</span><b>{i.title}</b>
            {!open && i.measure && vals && <MiniChart k={i.measure} vals={vals} />}
            <span className="chev" aria-hidden="true">{on ? "▴" : "▾"}</span>
          </button>
          {on && <div className="mr-body">
            <p>{i.text}</p>
            {i.tip && <p className="mr-tip"><small>{tip}</small>{i.tip}</p>}
            {i.measure && vals && <DigestChart k={i.measure} vals={vals} today={today} goal={goalOf(i.measure)} />}
            {i.source && <a href={i.source.url} target="_blank" rel="noreferrer">{i.source.title} ↗</a>}
            {i.protocol && (running.includes(i.protocol.name)
              ? <p className="note">Running — see Insights → Experiments.</p>
              : <button type="button" className="pill-btn pri" onClick={() => startExperiment(i.protocol!)}>Try it for {i.protocol.days} days</button>)}
          </div>}
        </li>
      );
    })}</ul>
  );
}
