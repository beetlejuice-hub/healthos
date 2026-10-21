/**
 * The night check inside readiness (PLAN 52; owner, 21 Oct: "2 line"): last night's skin temperature, breathing and blood
 * oxygen, each against your usual (lib/nightcheck). The warning line itself sits in readiness's one line; this is the
 * opened view — all three, off or not, so you can see the band sends them.
 */

import { NIGHT, type NightCheck } from "../lib/nightcheck";

const fmt = (v: number, dp: number) => (dp ? v.toFixed(dp) : String(Math.round(v)));

export function NightRows({ c }: { c: NightCheck }) {
  if (!c.signals.length) return null;
  return (
    <div className="nc" data-off={c.off.length}>
      <span className="k">Night check</span>
      <ul>{c.signals.map((s) => {
        const r = NIGHT[s.id];
        return (
          <li key={s.id} data-sig={s.id} data-off={s.off || undefined}>
            <span>{s.name}</span>
            <b>{fmt(s.value, r.dp)}<small>{r.unit}</small></b>
            <small>{s.usual == null ? "usual after 10 nights" : `usual ${fmt(s.usual, r.dp)} · ${s.diff! >= 0 ? "+" : "−"}${fmt(Math.abs(s.diff!), r.dp || 1)}`}</small>
          </li>
        );
      })}</ul>
    </div>
  );
}
