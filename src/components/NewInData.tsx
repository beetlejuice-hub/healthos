/**
 * New in your data (PLAN 209; owner, 11 Nov: "3, 4" — board O of the Insights canvas). On the AI tab: what became clear,
 * got stronger, or faded in your own days since a week ago — ripples, what makes a day, two things together. Worked out
 * in the app (lib/newfindings), no AI call; each line opens where it lives.
 */

import { useMemo } from "react";
import { newThisWeek } from "../lib/newfindings";
import { useDayTable } from "./useDayTable";

export function NewInData({ now }: { now: number }) {
  const { days, band, today } = useDayTable(now);
  const items = useMemo(() => newThisWeek(days, band, today), [days, band, today]);
  if (!items.length) return null;
  const open = (anchor: string) => { setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ block: "start" }), 600); };
  return (
    <section className="card newdata" aria-label="New in your data">
      <h3>New in your data <span>since a week ago · worked out in the app, no AI</span></h3>
      <ul>{items.map((x) => (
        <li key={x.key} data-kind={x.kind} data-key={x.key}>
          <a href="#insights/connections" onClick={() => open(x.anchor)}><span className="nd-tag">{x.kind}</span><span><b>{x.say}</b><small>{x.where} ›</small></span></a>
        </li>
      ))}</ul>
    </section>
  );
}
