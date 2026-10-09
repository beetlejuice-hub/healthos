/**
 * The morning catch-up on Today (owner, 9 Oct: "At morning the next day it should ask … did u take magnesium (supp), and
 * other things i did not log that day but shouldve done"): what yesterday is missing, by your own habits (lib/catchup).
 * Mornings only (05:00–14:00); one tap answers; "No" is remembered on this device so it isn't asked twice. Never "you
 * forgot" — just what isn't logged.
 */

import { useMemo, useState } from "react";
import { act, offerUndo, useStore } from "../lib/store";
import { yesterdayGaps, type Gap, type Meal } from "../lib/catchup";
import { go, LOG_FOR_KEY } from "../lib/nav";
import { addDays, localDay } from "../lib/time";

const NO_KEY = "healthos.catchup.no";
const MEAL_AT: Record<Meal, string> = { breakfast: "08:00", lunch: "12:30", dinner: "19:00" };
const readNo = (): string[] => { try { return JSON.parse(localStorage.getItem(NO_KEY) || "[]"); } catch { return []; } };
const when = (slot: string) => (slot === "evening" ? "last night" : `yesterday ${slot === "morning" ? "morning" : "midday"}`);

export function CatchUp({ now }: { now: number }) {
  const entries = useStore((s) => s.entries), supplements = useStore((s) => s.supplements);
  const today = localDay(now), hour = new Date(now).getHours();
  const [no, setNo] = useState<string[]>(readNo);
  const gaps = useMemo(() => yesterdayGaps(entries, supplements, today), [entries, supplements, today]).filter((g) => !no.includes(g.key));
  if (hour < 5 || hour >= 14 || !gaps.length) return null;
  const yday = addDays(today, -1);
  const dismiss = (keys: string[]) => {
    // Only yesterday's answers are worth keeping.
    const next = [...no.filter((k) => k.endsWith(yday)), ...keys];
    setNo(next); try { localStorage.setItem(NO_KEY, JSON.stringify(next)); } catch { /* private window: asked again next time */ }
  };
  const answer = (g: Gap, yes: boolean) => {
    if (g.kind === "supp") { const e = act.addEntry({ kind: "supp", at: g.at, suppId: g.suppId, status: yes ? "taken" : "skipped", slot: g.slot }); offerUndo([e.id], `${g.name} ${yes ? "taken" : "skipped"} ${when(g.slot)}`); return; }
    if (g.kind === "drink") { if (!yes) { dismiss([g.key]); return; } const e = act.addEntry({ ...g.usual, at: g.at }); offerUndo([e.id], `${g.name} logged for yesterday`); return; }
    if (!yes) { dismiss([g.key]); return; }
    try { sessionStorage.setItem(LOG_FOR_KEY, JSON.stringify({ day: yday, time: MEAL_AT[g.meal] })); } catch { /* Log opens on today; the day can be picked there */ }
    go("log", "food");
  };
  return (
    <div className="card catchup" id="catchup">
      <h3>Yesterday <span>not logged yet</span></h3>
      {gaps.map((g) => (
        <div className="cu-row" key={g.key} data-kind={g.kind}>
          <span>{g.kind === "supp" ? <><b>{g.name}</b>, {when(g.slot)}?</>
            : g.kind === "drink" ? <><b>{g.name}</b> yesterday? <small>you have it most days ({g.days} of {g.of})</small></>
              : <>No <b>{g.meal}</b> logged yesterday</>}</span>
          <div className="cu-btns">
            <button type="button" className="pill-btn pri" onClick={() => answer(g, true)}>{g.kind === "supp" ? "Took it" : g.kind === "drink" ? "Had my usual" : "Log it"}</button>
            <button type="button" className="pill-btn" onClick={() => answer(g, false)}>{g.kind === "supp" ? "Didn't" : g.kind === "drink" ? "No" : "Skip"}</button>
          </div>
        </div>
      ))}
      {gaps.length > 1 && <button type="button" className="linkish cu-none" onClick={() => dismiss(gaps.map((g) => g.key))}>Nothing else to add</button>}
    </div>
  );
}
