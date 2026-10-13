/**
 * Workout → the heart-rate tile (PLAN 68; owner, 13 Oct: "wearable is connected but it says connect wearable" — it was
 * a placeholder from before the band). This session's heart rate from the band: the latest minute, the average and the
 * peak so far. The band's readings reach us through the Fitbit app, often 15–30 minutes late, so it says how old they are.
 */

import { useBand } from "../lib/band-client";
import { sessionHr } from "../lib/heart";
import { clock } from "../lib/time";

export function SessionHeart({ start, now }: { start: number; now: number }) {
  const { status, data } = useBand();
  const off = status === "off" || (status != null && !status.connected);
  const s = data ? sessionHr(data.hr, start, now) : null, latest = data?.hr.at(-1)?.[0] ?? null;
  const late = s ? now - s.at > 10 * 60_000 : false;
  const [big, sub] = off ? ["–", "Connect the band in Settings"]
    : status == null ? ["–", "checking the band…"]
      : !s ? ["–", latest ? `no reading this session yet · last ${clock(latest)} — readings come through the Fitbit app, often 15–30 min late` : "no readings from the band yet"]
        : [`${Math.round(s.last)}`, `avg ${s.avg} · peak ${Math.round(s.peak)}${late ? ` · as of ${clock(s.at)}` : ""}`];
  return (
    <div className="tile" style={{ gap: 2 }} data-hr={s ? "on" : off ? "off" : "waiting"}>
      <span className="k" style={{ color: "var(--hr)" }}>Heart rate</span>
      <span className="big" style={s ? undefined : { color: "var(--k-dim)" }}>{big}{s && <small>bpm</small>}</span>
      <span className="s">{sub}</span>
    </div>
  );
}
