/**
 * Settings → Lock-screen widget (owner, 14 Nov, item 10: "Can we do lock screen widget?"). Makes the widget's key, shows
 * the Scriptable script with it in (copy it once), and the steps; while it's on, Today leaves a snapshot on the server
 * for it (lib/widget). A new key stops the old script.
 */

import { useState } from "react";
import { act, useStore } from "../lib/store";
import { newWidgetKey } from "../lib/widget-client";
import { widgetScript } from "../lib/widget";

export function WidgetSetup() {
  const on = useStore((s) => s.settings.widget);
  const [script, setScript] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const make = async () => {
    if (on && !script && !window.confirm("A new key — the widget's old script stops working. Go on?")) return;
    setErr(null);
    try { const k = await newWidgetKey(); setScript(widgetScript(k.url, k.key)); act.setSettings({ widget: true }); } catch (e) { setErr((e as Error).message); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(script!); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setCopied(false); } };
  return (
    <div className="card widgetsetup" id="widget">
      <h3>Lock-screen widget <span className="note">readiness, sleep, stack, caffeine, next</span></h3>
      <p className="note">{on ? "On: Today leaves the widget its numbers whenever the app is open; the caffeine keeps counting down between." : "Your readiness, last night's score, the stack, caffeine now and at bedtime, and the next session, on the lock screen — through Scriptable, a free app."}</p>
      {script ? <>
        <ol className="note ws-steps">
          <li>Install <b>Scriptable</b> from the App Store (free).</li>
          <li>Copy the script below. In Scriptable, tap <b>+</b>, paste it, name it <b>HealthOS</b>.</li>
          <li>Lock screen: hold it → <b>Customize</b> → <b>Lock Screen</b> → tap the widget row → <b>Scriptable</b> → the wide one. Tap it, Script: <b>HealthOS</b>.</li>
          <li>The home screen works the same way (a medium Scriptable widget).</li>
        </ol>
        <textarea className="ws-script" readOnly value={script} rows={6} aria-label="The widget's script" onFocus={(e) => e.currentTarget.select()} />
        <p className="note">The key in it is this widget's only — keep it private. Shown once; a new key stops this one.</p>
        <div className="grid2"><button type="button" className="pill-btn pri" onClick={copy}>{copied ? "Copied" : "Copy the script"}</button>
          <button type="button" className="pill-btn" onClick={() => setScript(null)}>Done</button></div>
      </> : <div className="grid2">
        <button type="button" className="pill-btn pri" onClick={make}>{on ? "New key and script" : "Set up the widget"}</button>
        {on && <button type="button" className="pill-btn" onClick={() => act.setSettings({ widget: false })}>Turn off</button>}
      </div>}
      {err && <p className="note err">{err}</p>}
    </div>
  );
}
