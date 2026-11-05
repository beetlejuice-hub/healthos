/**
 * The band's alarm on Today (PLAN 198; owner, 5 Nov: "App should notify pretty harshly when i have to reconnect the band
 * to app"). Google dropped the sign-in: a red line at the top with Reconnect, that stays until it's fixed (the Worker
 * pushes too — at once, then every 6 hours, not at night). Connected but nothing new from the band for 12 hours: a
 * quieter line — the phone's Fitbit app hasn't synced.
 */

import { useState } from "react";
import { startConnect, useBand } from "../lib/band-client";

const STALE_MS = 12 * 3_600_000;
const when = (t: number, now: number) => {
  const d = new Date(t), hm = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return now - t < 20 * 3_600_000 && d.getDate() === new Date(now).getDate() ? hm : `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} ${hm}`;
};

export function BandAlarm({ now }: { now: number }) {
  const s = useBand().status, [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  if (!s || s === "off") return null;
  if (s.needsReconnect) return (
    <section className="band-alarm" role="alert" aria-label="Band disconnected">
      <b>Your band is disconnected</b>
      <p>Google stopped sending your Fitbit's data{s.latest ? ` — the newest is from ${when(s.latest, now)}` : ""}. Nothing new comes in until you reconnect; within 7 days the gap fills back in.</p>
      <button type="button" className="pill-btn" disabled={busy} onClick={() => { setBusy(true); setErr(null); startConnect().catch((e: Error) => { setErr(e.message); setBusy(false); }); }}>{busy ? "Opening Google…" : "Reconnect"}</button>
      {err && <p>{err}</p>}
    </section>
  );
  if (s.connected && s.latest && now - s.latest > STALE_MS) return (
    <p className="band-stale" role="status">No new band data since {when(s.latest, now)} — open the Fitbit app on your phone so the band syncs.</p>
  );
  return null;
}
