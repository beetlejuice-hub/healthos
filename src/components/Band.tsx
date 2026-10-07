/**
 * Settings → Band: connect the Fitbit through Google, and see that it's working (last sync, the latest
 * heart rate, last night) — so "is the watch connected?" has an answer without guessing.
 */

import { useEffect, useRef, useState } from "react";
import { disconnectBand, refreshBand, startConnect, useBand } from "../lib/band-client";
import { lastNight } from "../lib/band";
import { clock, dayLabel, localDay } from "../lib/time";

/** "14:05" today, "Tue 6 Oct 23:10" before. */
const ago = (t: number) => `${localDay(t) === localDay(Date.now()) ? "" : `${dayLabel(t)} `}${clock(t)}`;
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")} m`;

/** What Google's page sent back: #settings/band-ok or #settings/band-failed?why=… */
function readReturn(): { ok: boolean; why: string } | null {
  const m = location.hash.match(/^#settings\/band-(ok|failed)(?:\?why=(.*))?$/);
  if (!m) return null;
  return { ok: m[1] === "ok", why: m[2] ? decodeURIComponent(m[2]) : "" };
}

export function Band() {
  const { status, data, loading } = useBand();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const back = readReturn();
    if (!back) return;
    setMsg(back.ok ? "Connected. The first pull takes a minute or two." : `Didn't connect: ${back.why || "something went wrong"}.`);
    history.replaceState(null, "", "#settings");
    setTimeout(() => ref.current?.scrollIntoView({ block: "center" }), 50);
    if (back.ok) { void refreshBand(); setTimeout(() => void refreshBand(), 20_000); }
  }, []);

  const run = async (f: () => Promise<unknown>, done?: string) => {
    setBusy(true); setMsg(null);
    try { await f(); if (done) setMsg(done); } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };

  const s = status && status !== "off" ? status : null;
  const lastHr = data?.hr.at(-1);
  const night = data ? lastNight(data.sleep, Date.now()) : null;
  const rhrDays = data ? Object.keys(data.rhr).sort() : [];
  const rhr = rhrDays.length ? data!.rhr[rhrDays.at(-1)!] : null;

  return (
    <div className="card band" ref={ref} id="band">
      <h3>Band <span>{status === "off" ? "not set up" : s?.connected ? "connected" : s?.needsReconnect ? "needs you" : status ? "not connected" : "…"}</span></h3>
      {status === "off" && <p className="note">The server doesn't have its Google keys yet, so the band can't connect.</p>}
      {s && !s.connected && !s.needsReconnect && <>
        <p className="note">Your Fitbit's heart rate (every minute), sleep stages, resting heart rate and HRV, read through Google. Read-only: HealthOS can't change anything in your Fitbit account. You can disconnect any time, and that deletes what was pulled.</p>
        <button type="button" className="pill-btn pri" disabled={busy} onClick={() => void run(startConnect)}>{busy ? "Opening Google…" : "Connect Fitbit"}</button>
      </>}
      {s?.needsReconnect && <>
        <p className="note">Google stopped letting HealthOS read your Fitbit (this happens if access was removed, or after a week while the app is in Google's testing mode). Reconnect to carry on — nothing pulled so far is lost.</p>
        <button type="button" className="pill-btn pri" disabled={busy} onClick={() => void run(startConnect)}>{busy ? "Opening Google…" : "Reconnect"}</button>
      </>}
      {s?.connected && <>
        <ul className="band-facts">
          <li><b>Last pull</b><span>{s.lastSync ? ago(s.lastSync) : loading ? "pulling now…" : "waiting for the first one"}</span></li>
          {lastHr && <li><b>Latest heart rate</b><span>{lastHr[1]} bpm · {ago(lastHr[0])}</span></li>}
          {night && <li><b>Last night</b><span>{night.asleepMin != null ? `${hm(night.asleepMin)} asleep` : "slept"} · <span className="nw">{clock(night.start)}–{clock(night.end)}</span></span></li>}
          {rhr != null && <li><b>Resting heart rate</b><span>{rhr} bpm</span></li>}
          {s.lastSync && !lastHr && <li className="wide">No heart rate yet — open the Fitbit app so the band syncs to it.</li>}
        </ul>
        {s.error && <p className="note">Some of the last pull didn't come through ({s.error}); the next one tries again.</p>}
        <div className="row2">
          <button type="button" className="pill-btn" disabled={busy || loading} onClick={() => void run(() => refreshBand())}>{loading ? "Pulling…" : "Pull now"}</button>
          <button type="button" className="pill-btn" disabled={busy} onClick={() => { if (confirm("Disconnect the band? This deletes the heart rate and sleep HealthOS pulled from it.")) void run(disconnectBand, "Disconnected."); }}>Disconnect</button>
        </div>
      </>}
      {msg && <p className="note" role="status">{msg}</p>}
    </div>
  );
}
