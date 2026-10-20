/**
 * Minutes in each heart-rate zone as one bar (owner: "go" on zones for cardio): Z1–Z5 by % of max heart rate, coloured
 * from easy to hard, each with its minutes; and where the max came from. Says what it needs when there's no max yet.
 */

import { useStore } from "../lib/store";
import { maxHrOf, zoneMinutes } from "../lib/cardio";
import type { HrMinute } from "../lib/band";

const TONE = ["var(--wt)", "var(--ok)", "var(--gym)", "var(--warn)", "var(--hr)"];

export function ZoneBar({ hr, start, end }: { hr: HrMinute[]; start: number; end: number }) {
  const st = useStore((s) => s.settings), max = maxHrOf(st);
  if (!max) return <p className="s zones-need">Heart-rate zones: add your age (or max heart rate) in Settings → Sleep and body.</p>;
  const mins = zoneMinutes(hr, start, end, max.bpm), total = mins.reduce((a, b) => a + b, 0);
  if (!total) return null;
  return (
    <div className="zones" aria-label={`Zones: ${mins.map((m, z) => `Z${z + 1} ${m} min`).join(", ")}`}>
      <div className="zbar">{mins.map((m, z) => (m ? <i key={z} style={{ flexGrow: m, background: TONE[z] }} /> : null))}</div>
      <div className="zlegend">{mins.map((m, z) => (m ? <span key={z}><b style={{ color: TONE[z] }}>Z{z + 1}</b> {m} min</span> : null))}</div>
      <small>max {max.bpm} bpm, {max.from === "set" ? "yours" : "from your age"}</small>
    </div>
  );
}
