/**
 * Settings → Places (PLAN 210, 212; owner, 11 Nov: "i told u no bedroom air sensor · For the damn google maps pls automate
 * it, somehow. like pulling every now and then"). Google keeps Timeline on the phone now, so nothing can pull it:
 * Overland (free, open source) logs location in the background and posts it to the app's own server; set up with one tap
 * (its setup link carries the address and a key). Each day's places come back on their own. A Google Maps Timeline file
 * can still bring in the past. Your top places, to name once. What comes in, Connections and What makes a day test.
 */

import { useState } from "react";
import { act, useStore } from "../lib/store";
import { parseTimeline, placeDays } from "../lib/timeline";
import { newPlacesKey, refreshPlaces, usePlaces } from "../lib/places-client";
import { clock, dayLabel } from "../lib/time";

const noon = (d: string) => new Date(`${d}T12:00:00`).getTime();
const span = (ds: string[]) => (ds.length ? `${dayLabel(noon(ds[0]))} – ${dayLabel(noon(ds[ds.length - 1]))}` : "");
const OVERLAND = "https://apps.apple.com/app/id1292426766";

export function BringIn() {
  const im = useStore((s) => s.imports), p = usePlaces();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ key: string; url: string; setup: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const setUp = async () => {
    if (p.key && !made && !window.confirm("A new key — Overland's old one stops working. Go on?")) return;
    setErr(null);
    try { const m = await newPlacesKey(); setMade(m); window.location.href = m.setup; } catch (e) { setErr((e as Error).message); }
  };
  const copy = async (what: string, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1500); } catch { setCopied(null); } };
  const file = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr(null);
    try {
      let j: unknown;
      try { j = JSON.parse(await f.text()); } catch { setErr("That isn't a JSON file — export Timeline data from Google Maps."); return; }
      const t = parseTimeline(j);
      if (t.error) { setErr(t.error); return; }
      const got = placeDays(t.visits, t.moves), prev = im.places;
      // a file brings in the past: days Overland already has stay Overland's
      const days = { ...got.days, ...(prev?.days ?? {}) }, ds = Object.keys(days).sort();
      act.setImports({ places: { ...(prev ?? {}), days, top: prev?.top?.length ? prev.top : got.top, home: prev?.home ?? got.home, names: prev?.names ?? {}, at: Date.now(), from: ds[0], to: ds[ds.length - 1] } });
    } finally { setBusy(false); }
  };
  const name = (id: string, v: string) => act.setImports({ places: { ...im.places!, names: { ...im.places!.names, [id]: v.trim() } } });
  if (p.off) return null;
  const pdays = Object.keys(im.places?.days ?? {}).sort();
  return (
    <div className="card bringin" id="bringin">
      <h3>Places <span className="note">where your days take you — on their own</span></h3>

      <section className="bi-one" aria-label="Overland">
        <b>On its own — Overland</b>
        {p.last ? <p className="bi-sum" data-points={p.points}>Last in: <b>{dayLabel(p.last.at)} {clock(p.last.at)}</b> · {p.points.toLocaleString("en-GB")} points kept (120 days){pdays.length ? ` · ${pdays.length} days worked out` : ""}. <button type="button" className="linkish" onClick={() => void refreshPlaces()}>Pull now</button></p>
          : p.key ? <p className="note">Set up — nothing has come in yet. Open Overland, allow location <b>Always</b>, and turn tracking on.</p>
          : <ol className="bi-steps">
              <li>Get <a href={OVERLAND} target="_blank" rel="noreferrer">Overland GPS Tracker</a> — free, open source, no account.</li>
              <li>Tap <b>Set up Overland</b> here: it opens Overland with the address and your key filled in.</li>
              <li>In Overland, allow location <b>Always</b> and turn tracking on. It sends your points here in the background.</li>
            </ol>}
        <button type="button" className="pill-btn bi-pick" onClick={() => void setUp()}>{p.key ? "Set up again (new key)" : "Set up Overland"}</button>
        {made && <div className="bi-manual"><p className="note">Didn't open? In Overland → Settings, paste these:</p>
          <p><small>Receiver endpoint</small><code>{made.url}</code><button type="button" className="linkish" onClick={() => void copy("url", made.url)}>{copied === "url" ? "Copied" : "Copy"}</button></p>
          <p><small>Access token</small><code>{made.key.slice(0, 10)}…</code><button type="button" className="linkish" onClick={() => void copy("key", made.key)}>{copied === "key" ? "Copied" : "Copy"}</button></p></div>}
        <p className="note">Kept on the app's own server: a point every few minutes, for 120 days. The app keeps only each day's numbers — time away from home, km, walking and cycling, places, nights away.</p>
      </section>

      <section className="bi-one" aria-label="The past from Google Maps">
        <b>The past — a Google Maps Timeline file</b>
        <p className="note">Once, for the months before Overland: Google Maps → your picture → Settings → Location & privacy (or Personal content) → Export Timeline data, then pick the file.</p>
        <label className="pill-btn bi-pick">{busy ? "Reading…" : "Choose Timeline.json"}<input type="file" accept=".json,application/json" onChange={(e) => void file(e.target.files?.[0])} /></label>
      </section>
      {err && <p className="note err">{err}</p>}

      {pdays.length > 0 && <section className="bi-one" aria-label="Your places">
        <p className="bi-sum" data-days={pdays.length}><b>{pdays.length} day{pdays.length === 1 ? "" : "s"}</b> of places, {span(pdays)}.{" "}
          <button type="button" className="linkish" onClick={() => { if (window.confirm("Remove the places the app has worked out?")) act.setImports({ places: undefined }); }}>Remove</button></p>
        <p className="note">Your top places — name them if you like:</p>
        <ul className="bi-top">{im.places!.top.map((t) => (
          <li key={t.id} data-id={t.id}>
            <input defaultValue={im.places!.names[t.id] ?? (t.home ? "Home" : "")} placeholder={t.lat != null ? `${t.lat.toFixed(3)}, ${t.lng!.toFixed(3)}` : "a place"} aria-label={`Name for the place with ${t.visits} visits`} onBlur={(e) => name(t.id, e.target.value)} />
            <small>{t.home ? "home · " : ""}{t.visits} visit{t.visits === 1 ? "" : "s"} · {t.hours} h</small>
          </li>
        ))}</ul>
      </section>}
      <p className="note">Connections and What makes a day pick places up once there are about two weeks of them beside your check-ins.</p>
    </div>
  );
}
