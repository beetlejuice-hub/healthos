/**
 * The night you've opened, in plain words, under the nights table (PLAN 79; owner, 13 Oct: "i really like this sleep data
 * but can we get some eli5 explanations or comparisons here to see whats up"): each number against your usual, and a line
 * on what it is. Facts, not causes.
 */

import { eli5, type Night } from "../lib/sleep";
import { atMinute, dayLabel } from "../lib/time";

export function NightWords({ n, ns }: { n: Night; ns: Night[] }) {
  const rows = eli5(n, ns);
  if (!rows.length) return null;
  return (
    <div className="night-words" aria-label="This night in plain words">
      <span className="cmp-k">In plain words · the night to {dayLabel(atMinute(n.day, 720))}</span>
      <ul>
        {rows.map((r) => (
          <li key={r.key} data-side={r.side ?? undefined}>
            <span className="nw-h"><b>{r.name} {r.value}</b> — {r.vs}</span>
            <span className="nw-what">{r.what}</span>
          </li>
        ))}
      </ul>
      <p className="sl-note">"Your usual" is the middle half of your other nights shown here. Most-adults figures are a rough guide, not a target.</p>
    </div>
  );
}
