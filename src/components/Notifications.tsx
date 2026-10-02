/**
 * Settings → Notifications: turn them on for this device, which kinds, a test, and each device's last
 * delivery — so "do notifications work?" has an answer without guessing.
 */

import { useEffect, useState } from "react";
import { act, useStore } from "../lib/store";
import { DEFAULT_NOTIFY, type NotifyPrefs } from "../lib/push/plan";
import { isOn, sendTest, status, support, syncPlan, turnOff, turnOn, type DeviceStatus } from "../lib/push/client";
import { clock, dayLabel } from "../lib/time";

const KINDS: [keyof NotifyPrefs, string, string][] = [
  ["checkins", "How now? check-ins", "13:00 and 17:30, and 21:00 for the day, unless you rated in the last 2 hours"],
  ["supps", "Supplements", "30 minutes after a slot, if something in it isn't ticked"],
  ["weigh", "Morning weigh-in", "09:30, if you haven't weighed yet"],
];

const delivered = (d: DeviceStatus) => !d.last ? "nothing sent yet" : d.last.status >= 200 && d.last.status < 300 ? `delivered ${dayLabel(d.last.at)} ${clock(d.last.at)}` : d.last.status === 0 ? `couldn't reach its push service ${clock(d.last.at)}` : `refused (${d.last.status}) ${clock(d.last.at)}`;

export function Notifications() {
  const prefs = useStore((s) => s.settings.notify ?? DEFAULT_NOTIFY);
  const [on, setOn] = useState(isOn);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [devs, setDevs] = useState<DeviceStatus[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const sup = support();

  const refresh = () => status().then((s) => { setDevs(s.devices); setNext(s.next); }).catch(() => {});
  useEffect(() => { if (on) void refresh(); }, [on]);

  const run = async (f: () => Promise<unknown>, done?: string) => {
    setBusy(true); setMsg(null);
    try { await f(); if (done) setMsg(done); } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };
  const setPref = (k: keyof NotifyPrefs, v: boolean) => { act.setSettings({ notify: { ...prefs, [k]: v } }); void syncPlan(true).then(refresh).catch(() => {}); };

  return (
    <div className="card notif">
      <h3>Notifications <span>{on ? "on for this device" : "off"}</span></h3>
      {sup === "ios-home-screen" && <p className="note">On iPhone, notifications only work from the Home Screen app: in Safari tap Share → <b>Add to Home Screen</b>, open HealthOS from there, and turn them on here.</p>}
      {sup === "unsupported" && <p className="note">This browser can't show notifications.</p>}
      {sup === "blocked" && <p className="note">Notifications are blocked for HealthOS. iPhone: Settings → Notifications → HealthOS → Allow. Chrome: the icon left of the address → Notifications → Allow. Then come back here.</p>}
      {sup === "ok" && !on && <>
        <p className="note">Short reminders for check-ins, supplements and the morning weigh-in. Quiet before 08:00 and around bedtime, at most 6 a day, and none for things you've already done.</p>
        <button type="button" className="pill-btn pri" disabled={busy} onClick={() => void run(async () => { await turnOn(); setOn(true); await refresh(); })}>{busy ? "Turning on…" : "Turn on"}</button>
      </>}
      {on && <>
        <div className="notif-kinds">
          {KINDS.map(([k, name, when]) => (
            <label key={k} className="notif-kind">
              <input type="checkbox" checked={prefs[k]} onChange={(e) => setPref(k, e.target.checked)} />
              <span><b>{name}</b><small>{when}</small></span>
            </label>
          ))}
        </div>
        {next && <p className="note">Next: {dayLabel(next)} {clock(next)}.</p>}
        {devs && devs.length > 0 && <ul className="notif-devs">{devs.map((d) => <li key={d.endpoint ?? d.device}><b>{d.device}</b> · {delivered(d)}</li>)}</ul>}
        <div className="row2">
          <button type="button" className="pill-btn" disabled={busy} onClick={() => void run(async () => { const r = await sendTest(); setDevs(r.devices); }, "Sent. It should arrive in a few seconds.")}>Send a test</button>
          <button type="button" className="pill-btn" disabled={busy} onClick={() => void run(async () => { await turnOff(); setOn(false); setDevs(null); })}>Turn off here</button>
        </div>
      </>}
      {msg && <p className={/Sent\./.test(msg) ? "note" : "err"} role="status">{msg}</p>}
    </div>
  );
}
