/**
 * Settings → Apple Health (PLAN 184; owner, 29 Oct: "i use MovingLife", then what his Health app has). A web app can't
 * read Apple Health, so a Shortcut on his iPhone posts the newest weight, body fat and the day's walking speed here once a
 * day; this card makes its key, shows the steps once, and says what last came in.
 */

import { useState } from "react";
import { useStore } from "../lib/store";
import { newHealthKey, refreshHealth, useHealth } from "../lib/health-client";
import { clock, dayLabel } from "../lib/time";

const WORDS: Record<string, string> = { weight: "weight", fat: "body fat", walk: "walking speed" };

export function AppleHealth() {
  const h = useHealth();
  const brought = useStore((s) => s.entries.filter((e) => e.kind === "weight" && e.id.startsWith("health-weight-")).length);
  const [made, setMade] = useState<{ key: string; url: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const make = async () => {
    if (h.key && !made && !window.confirm("A new key — the Shortcut's old one stops working. Go on?")) return;
    setErr(null);
    try { setMade(await newHealthKey()); } catch (e) { setErr((e as Error).message); }
  };
  const copy = async (what: string, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1500); } catch { setCopied(null); } };
  if (h.off) return null;
  return (
    <div className="card applehealth" id="applehealth">
      <h3>Apple Health <span className="note">your scale</span></h3>
      <p className="note">
        {h.last ? <>Last in: <b>{dayLabel(h.last.at)} {clock(h.last.at)}</b>{h.last.types.length ? ` — ${h.last.types.map((t) => WORDS[t] ?? t).join(", ")}` : " — nothing new"}. {brought} weigh-in{brought === 1 ? "" : "s"} brought in.</>
          : h.key ? "Key made — nothing has come in yet. Run the Shortcut once to check."
            : "Brings your MovingLife weigh-ins (weight and body fat) and your walking speed in by themselves, once a day, through a Shortcut on your iPhone."}
      </p>
      <div className="cu-btns">
        <button type="button" className={`pill-btn${h.key ? "" : " pri"}`} onClick={make}>{h.key || made ? "New key" : "Set up"}</button>
        {h.key && <button type="button" className="pill-btn" onClick={() => void refreshHealth()}>Check now</button>}
      </div>
      {err && <p className="note err">Couldn't make a key: {err}</p>}
      {made && <div className="ah-setup">
        <p className="note">Your key — like a password, only for this. It's shown once; a new key replaces it.</p>
        <code className="ah-key">{made.key}</code>
        <div className="cu-btns"><button type="button" className="pill-btn pri" onClick={() => void copy("key", `Bearer ${made.key}`)}>{copied === "key" ? "Copied" : "Copy “Bearer …” for the header"}</button><button type="button" className="pill-btn" onClick={() => void copy("url", made.url)}>{copied === "url" ? "Copied" : "Copy the URL"}</button></div>
        <ol className="ah-steps">
          <li>Shortcuts → <b>+</b> → name it <b>HealthOS</b>.</li>
          <li><b>Find Health Samples</b>: Weight · Sort by Start Date · Latest First · Limit 1.</li>
          <li><b>Find Health Samples</b> again: Body Fat Percentage, the same.</li>
          <li><b>Find Health Samples</b> again: Walking Speed · Start Date is today. Then <b>Calculate Statistics</b>: Average of its Value.</li>
          <li><b>Get Contents of URL</b>: the URL · Method POST · Header <b>Authorization</b> = what you copied · Request Body JSON, all as Text:
            <br /><code>weight</code> = 1st samples → Value · <code>weightUnit</code> = → Unit · <code>weightAt</code> = → Start Date, ISO 8601
            <br /><code>fat</code> = 2nd samples → Value · <code>fatAt</code> = → Start Date, ISO 8601
            <br /><code>walk</code> = the Average · <code>walkAt</code> = Current Date, ISO 8601</li>
          <li>Run it once: allow Health, and it answers <code>ok</code> with what it sent.</li>
          <li>Automation → <b>+</b> → Time of Day, 10:00, Daily → <b>Run Immediately</b> → HealthOS.</li>
        </ol>
        <p className="note">A weigh-in you also type in the app within half an hour isn't counted twice; delete one that came in and it stays deleted.</p>
      </div>}
    </div>
  );
}
