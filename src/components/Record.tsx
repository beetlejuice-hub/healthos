/**
 * The app's track record on screen (PLAN 188 phase 3; owner, 3 Nov: "see if it was right or no"; the canvas's A, "on each
 * card"): each lead and Noticed card says when it was first said and how it has done on the days since — held, holding so
 * far, checking, didn't hold; Leads opens with the score of the app's calls, and the ones that didn't hold are kept in a
 * fold at the end rather than quietly dropped. Maths in lib/record.
 */

import { useEffect, useMemo } from "react";
import { act, getState, useStore } from "../lib/store";
import { dailyFacts } from "../lib/insights";
import { withBand, withHealth } from "../lib/daysband";
import { useHealth } from "../lib/health-client";
import { useBand } from "../lib/band-client";
import { signals } from "../lib/scout";
import { recheck, recheckWords, remember, STATE_WORDS, type Claim, type ClaimState, type Recheck } from "../lib/record";
import { addDays, localDay } from "../lib/time";

const NONE: Claim[] = [];
/** How far back the record looks: a claim said up to 120 days ago, and a month before it for its scale. */
export const RECORD_DAYS = 150;

/** Every kept claim with how it has done, on the same days the Leads read (the band's and Apple Health's in). */
export function useRecord(): Map<string, { c: Claim; r: Recheck }> {
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), supplements = useStore((s) => s.supplements), settings = useStore((s) => s.settings);
  const kept = useStore((s) => s.ai.record) ?? NONE;
  const band = useBand().data, health = useHealth().samples, today = localDay(Date.now());
  return useMemo(() => {
    const out = new Map<string, { c: Claim; r: Recheck }>();
    if (!kept.length) return out;
    const facts = withHealth(withBand(dailyFacts(entries, workouts, settings, addDays(today, -RECORD_DAYS), addDays(today, -1)), band, today), health);
    const sigs = signals(supplements, facts);
    for (const c of kept) { if (c.said < addDays(today, -120)) continue; const r = recheck(c, facts, supplements, sigs); if (r) out.set(c.id, { c, r }); }
    return out;
  }, [kept, entries, workouts, supplements, settings, band, health, today]);
}

/** Keep what a page is showing: new claims join with the day they were first said. */
export function useKeepClaims(claims: Claim[]) {
  const key = claims.map((c) => c.id).join("|");
  useEffect(() => {
    if (!claims.length) return;
    const kept = getState().ai.record ?? [], next = remember(kept, claims, localDay(Date.now()));
    if (next !== kept) act.setAi({ record: next });
    // the ids are the claims' identity; a re-worded one is the same claim
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** On a card: "Held · Said Fri 9 Oct · since: 9 days with, 15 without — energy 5.4 vs 6.6". */
export function RecordLine({ id, rec }: { id: string; rec: Map<string, { c: Claim; r: Recheck }> }) {
  const x = rec.get(id);
  if (!x) return null;
  return <p className="rec-line"><span className={`rec-chip rec-${x.r.state.replace(/\W+/g, "")}`}>{STATE_WORDS[x.r.state]}</span> {recheckWords(x.c, x.r, false)}</p>;
}

const ORDER: ClaimState[] = ["held", "holding", "checking", "didn't hold"];

/** At the top of Leads: the score of the app's calls. */
export function RecordScore({ rec }: { rec: Map<string, { c: Claim; r: Recheck }> }) {
  if (!rec.size) return null;
  const n = (s: ClaimState) => [...rec.values()].filter((x) => x.r.state === s).length;
  const first = [...rec.values()].map((x) => x.c.said).sort()[0];
  const month = new Date(`${first}T12:00`).toLocaleDateString("en-GB", { month: "long" });
  return (
    <p className="rec-score" aria-label="The app's track record">The app's calls since {month}: {ORDER.filter((s) => n(s)).map((s, i) => <span key={s}>{i ? " · " : ""}<b className={`rec-n rec-${s.replace(/\W+/g, "")}`}>{n(s)} {STATE_WORDS[s]}</b></span>)}</p>
  );
}

/** At the end of Leads: what didn't hold, kept so you see the app was wrong. */
export function DidntHold({ rec }: { rec: Map<string, { c: Claim; r: Recheck }> }) {
  const gone = [...rec.values()].filter((x) => x.r.state === "didn't hold");
  if (!gone.length) return null;
  return (
    <details className="rec-gone">
      <summary>Didn't hold · {gone.length}</summary>
      {gone.map(({ c, r }) => <div key={c.id} className="rec-row"><b>{c.text}</b><p className="rec-line"><span className="rec-chip rec-didnthold">didn't hold</span> {recheckWords(c, r, false)} — probably chance; it's off the list.</p></div>)}
    </details>
  );
}
