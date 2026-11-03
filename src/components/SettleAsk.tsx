/**
 * "Nearly sure?" in For you (PLAN 188 phase 4; owner, 3 Nov: "asking ab them" — then "do 1 and 2"): the finding nearest
 * to settled, what it shows so far, what would settle it — and, when that's days without something you can leave out,
 * "Try 7 days without", which starts it as an experiment. "Not now" rests it 2 weeks. Logic: lib/settle.
 */

import { act, useStore } from "../lib/store";
import { restSettle, settleNext } from "../lib/settle";
import { startExperiment } from "../lib/ai/experiment";
import { WORD_TEXT } from "../lib/evidence";
import { localDay } from "../lib/time";
import { useEvidence } from "./useEvidence";

const NONE: Record<string, string> = {};

export function SettleAsk({ now }: { now: number }) {
  const ev = useEvidence(), rest = useStore((s) => s.ai.settleRest) ?? NONE, xs = useStore((s) => s.ai.experiments);
  const today = localDay(now), s = settleNext(ev, rest, today, xs.filter((x) => !x.ended).map((x) => x.name));
  if (!s) return null;
  const f = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : "–"), lower = s.meanOn < s.meanOff ? "lower" : "higher";
  return (
    <section className="card settle" aria-label="Nearly sure?">
      <h3>Nearly sure? <span>{WORD_TEXT[s.word]}</span></h3>
      <b>{s.thing} → {s.outcome}</b>
      <p>So far your {s.outcome} is {lower} with it: {f(s.meanOn)} on {s.nOn} days with, {f(s.meanOff)} on {s.nOff} without. About {s.need} more {s.sideWords} would settle it.</p>
      <div className="watch-opts">
        {s.try && <button type="button" className="pill-btn pri" onClick={() => startExperiment(s.try!)}>Try {s.try.days} days without</button>}
        <button type="button" className="pill-btn" onClick={() => act.setAi((a) => ({ settleRest: restSettle(a.settleRest ?? {}, s.key, today) }))}>Not now</button>
      </div>
      {!s.try && <small>It settles by itself as days come — nothing to change for it.</small>}
    </section>
  );
}
