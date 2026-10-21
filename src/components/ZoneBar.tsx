/**
 * Minutes in each heart-rate zone as one bar (owner: "go" on zones for cardio): Z1–Z5 by % of max heart rate, coloured
 * from easy to hard, each with its minutes; and where the max came from. Says what it needs when there's no max yet. On
 * cardio, and on every workout (PLAN 52; owner, 21 Oct: "3 per workout").
 */

import { useStore } from "../lib/store";
import { maxHrOf, zoneMinutes } from "../lib/cardio";
import type { HrMinute } from "../lib/band";
import { clock } from "../lib/time";

const TONE = ["var(--wt)", "var(--ok)", "var(--gym)", "var(--warn)", "var(--hr)"];

/**
 * `quiet`: in a list, no "add your age" on every row. `upTo`: the band's newest reading — when it's short of the end (the
 * band syncs every 15–30 minutes, so a workout just finished isn't all in yet), it says so instead of a short count.
 */
export function ZoneBar({ hr, start, end, quiet, upTo }: { hr: HrMinute[]; start: number; end: number; quiet?: boolean; upTo?: number | null }) {
  const st = useStore((s) => s.settings), max = maxHrOf(st);
  if (!max) return quiet ? null : <p className="s zones-need">Heart-rate zones: add your age (or max heart rate) in Settings → Sleep and body.</p>;
  const mins = zoneMinutes(hr, start, end, max.bpm), total = mins.reduce((a, b) => a + b, 0);
  const behind = upTo != null && upTo < end - 5 * 60_000 ? upTo : null;
  if (!total) return behind != null && !quiet ? <p className="s zones-need">Heart-rate zones come when the band sends this workout's minutes (it syncs every 15–30 min).</p> : null;
  return (
    <div className="zones" aria-label={`Zones: ${mins.map((m, z) => `Z${z + 1} ${m} min`).join(", ")}`}>
      <div className="zbar">{mins.map((m, z) => (m ? <i key={z} style={{ flexGrow: m, background: TONE[z] }} /> : null))}</div>
      <div className="zlegend">{mins.map((m, z) => (m ? <span key={z}><b style={{ color: TONE[z] }}>Z{z + 1}</b> {m} min</span> : null))}</div>
      {!quiet && <small>max {max.bpm} bpm, {max.from === "set" ? "yours" : "from your age"}{behind != null ? ` · the band's minutes up to ${clock(behind)} — the rest when it syncs` : ""}</small>}
    </div>
  );
}
