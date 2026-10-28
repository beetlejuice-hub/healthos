/**
 * Today: days you didn't log food, asked about once (owner, 27 Oct: "i had this weekend skipped fully... make sure app can
 * still assume some things or recognize that im not logging anything, that means im still eating, and living just not
 * logging" — "2 yes"). The latest run of days not logged in the past week (lib/foodgaps): how did you eat? The answer is
 * kept as a guess on those days — never as food. Not sure is an answer too; Log them opens Log on the first day. While
 * your usual things are drafted for those days (GhostCard), this waits: one ask about the same days at a time (28 Oct
 * review — both showed at once, back to back).
 */

import { useMemo } from "react";
import { act, offerUndo, useStore } from "../lib/store";
import { ATE, ateEntries, daysWords, openGap, type Ate } from "../lib/foodgaps";
import { ghostDrafts } from "../lib/ghost";
import { go, LOG_FOR_KEY } from "../lib/nav";
import { localDay } from "../lib/time";

const n = (v: number) => Math.round(v).toLocaleString("en-GB");

export function FoodGapAsk({ now }: { now: number }) {
  const entries = useStore((s) => s.entries), supplements = useStore((s) => s.supplements);
  const today = localDay(now);
  const gap = useMemo(() => openGap(entries, today), [entries, today]);
  const drafted = useMemo(() => !!ghostDrafts(entries, supplements, today)?.drafts.length, [entries, supplements, today]);
  if (!gap || drafted) return null;
  const words = daysWords(gap.days, today), some = gap.kcal.some((k) => k != null && k > 0);
  const answer = (ate: Ate) => {
    const added = ateEntries(gap.days, ate).map((e) => act.addEntry(e).id);
    offerUndo(added, `${words}: ${ATE[ate].label.toLowerCase()}`);
  };
  const log = () => {
    try { sessionStorage.setItem(LOG_FOR_KEY, JSON.stringify({ day: gap.days[0], time: "12:30" })); } catch { /* Log opens on today; the day can be picked there */ }
    go("log", "food");
  };
  return (
    <div className="card catchup foodgap" role="region" aria-label="Days not logged">
      <h3>{some ? "Barely logged" : "Not logged"} <span>{words}</span></h3>
      <p className="fg-why">How did you eat? Kept as a guess — your usual day ({n(gap.usual)} kcal) and your goal leave {gap.days.length > 1 ? "these days" : "it"} out either way.</p>
      <div className="cu-btns fg-btns">
        {(["usual", "more", "less"] as const).map((a) => <button key={a} type="button" className={`pill-btn${a === "usual" ? " pri" : ""}`} onClick={() => answer(a)}>{ATE[a].label}</button>)}
      </div>
      <p className="fg-more"><button type="button" className="linkish" onClick={() => answer("unsure")}>{ATE.unsure.label}</button> · <button type="button" className="linkish" onClick={log}>Log {gap.days.length > 1 ? "them" : "it"} instead</button></p>
    </div>
  );
}
