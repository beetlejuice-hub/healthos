/**
 * This week's deep dive, at the top of the AI tab (PLAN 160; owner, 21 Oct: "do 2, 1, 3, 4" — 3, and "3: ai": the AI
 * picks the topic). Folded to its question and the verdict's start; open: why it came up, what your own numbers say (from
 * the app's look-ups), what the studies found with their links, the verdict and how sure, one experiment to start, and
 * "Pick another topic" (twice a week). Highlighted until opened.
 */

import { useState } from "react";
import { act, useStore } from "../lib/store";
import { useAiStatus } from "../lib/ai/client";
import { startExperiment } from "../lib/ai/experiment";
import { DIVE } from "../lib/ai/dive";
import { dayLabel, atMinute } from "../lib/time";
import { SourceLink } from "./SourceLink";
import { Looked } from "./Looked";

const SURE = { strong: "strong evidence", moderate: "moderate evidence", weak: "thin evidence" } as const;

export function DeepDive({ onRepick }: { onRepick: (key: string, skip: string[]) => Promise<string | null> }) {
  const d = useStore((s) => s.ai.dive), running = useStore((s) => s.ai.experiments).filter((x) => !x.ended).map((x) => x.name);
  const { busy } = useAiStatus();
  const [err, setErr] = useState<string | null>(null);
  if (!d) return null;
  const left = DIVE.repicks - (d.repicks ?? 0);
  return (
    <details className="card dive" data-new={!d.seen || undefined} onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open && !d.seen) act.setAi((a) => ({ dive: a.dive ? { ...a.dive, seen: Date.now() } : a.dive })); }}>
      <summary>
        <span className="k">Deep dive · week of {dayLabel(atMinute(d.key, 720))}</span>{!d.seen && <span className="rd-new">new</span>}
        <b className="dv-topic">{d.topic}</b>
        <span className="dv-verdict">{d.verdict}</span>
      </summary>
      {d.why && <p className="dv-why"><small>Why this</small>{d.why}</p>}
      {d.yourData && <div className="dv-sec"><small>Your data</small><p>{d.yourData}</p><Looked names={d.looked} /></div>}
      {d.found.length > 0 && <div className="dv-sec"><small>What studies found</small>
        <ul className="dv-found">{d.found.map((f) => <li key={f.source.url + f.title}><b>{f.title}</b><p>{f.text}</p><SourceLink s={f.source} /></li>)}</ul></div>}
      <div className="dv-sec dv-answer"><small>The verdict <span className={`dv-sure s-${d.sure}`}>{SURE[d.sure]}</span></small><p>{d.verdict}</p></div>
      {d.experiment && <div className="dv-sec dv-x"><small>Try it on yourself</small><p><b>{d.experiment.name}</b> — {d.experiment.how} ({d.experiment.days} days; the app watches {d.experiment.measure})</p>
        {running.includes(d.experiment.name) ? <p className="note">Running — see Insights → Experiments.</p>
          : <button type="button" className="pill-btn pri" onClick={() => startExperiment(d.experiment!)}>Try it for {d.experiment.days} days</button>}</div>}
      <div className="dv-acts">
        {left > 0 ? <button type="button" className="linkish" disabled={busy > 0} onClick={async () => { setErr(null); setErr(await onRepick(d.key, [...(d.skipped ?? []), d.topic])); }}>{busy > 0 ? "Working on it…" : `Pick another topic (${left} left this week)`}</button>
          : <small className="note">Next one Sunday.</small>}
        {err && <small className="err"> {err}</small>}
      </div>
    </details>
  );
}
