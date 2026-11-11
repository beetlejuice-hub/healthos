/**
 * Settings → Bring in (PLAN 210; owner, 11 Nov: "1 love (all) - i have ios", board R). Two files from apps you already
 * use, picked now and then: Aranet Home's CSV (bedroom air) and Google Maps' Timeline export (places). Read on the phone
 * (lib/airimport, lib/timeline); only each night's air and each day's places are kept, merged with what came before. Your
 * top places, to name once. What comes in becomes things Connections and What makes a day test.
 */

import { useState } from "react";
import { act, useStore } from "../lib/store";
import { airNights, parseAranet } from "../lib/airimport";
import { parseTimeline, placeDays } from "../lib/timeline";
import { dayLabel } from "../lib/time";

const noon = (d: string) => new Date(`${d}T12:00:00`).getTime();
const span = (ds: string[]) => (ds.length ? `${dayLabel(noon(ds[0]))} – ${dayLabel(noon(ds[ds.length - 1]))}` : "");

export function BringIn() {
  const im = useStore((s) => s.imports);
  const [err, setErr] = useState<{ air?: string; places?: string }>({});
  const [busy, setBusy] = useState<string | null>(null);
  const read = (f: File) => f.text();

  const air = async (f: File | undefined) => {
    if (!f) return;
    setBusy("air"); setErr((e) => ({ ...e, air: undefined }));
    try {
      const p = parseAranet(await read(f));
      if (p.error) { setErr((e) => ({ ...e, air: p.error })); return; }
      const nights = airNights(p.rows);
      if (!Object.keys(nights).length) { setErr((e) => ({ ...e, air: "No full nights (22:00–07:00) in it." })); return; }
      act.setImports({ air: { nights: { ...(im.air?.nights ?? {}), ...nights }, at: Date.now() } });
    } finally { setBusy(null); }
  };
  const places = async (f: File | undefined) => {
    if (!f) return;
    setBusy("places"); setErr((e) => ({ ...e, places: undefined }));
    try {
      let j: unknown;
      try { j = JSON.parse(await read(f)); } catch { setErr((e) => ({ ...e, places: "That isn't a JSON file — export Timeline data from Google Maps." })); return; }
      const t = parseTimeline(j);
      if (t.error) { setErr((e) => ({ ...e, places: t.error })); return; }
      const p = placeDays(t.visits, t.moves), prev = im.places;
      const days = { ...(prev?.days ?? {}), ...p.days }, ds = Object.keys(days).sort();
      act.setImports({ places: { days, top: p.top, home: p.home, names: prev?.names ?? {}, at: Date.now(), from: ds[0], to: ds[ds.length - 1] } });
    } finally { setBusy(null); }
  };
  const name = (id: string, v: string) => act.setImports({ places: { ...im.places!, names: { ...im.places!.names, [id]: v.trim() } } });

  const nights = Object.keys(im.air?.nights ?? {}).sort(), last = nights.length ? im.air!.nights[nights[nights.length - 1]] : null;
  const pdays = Object.keys(im.places?.days ?? {}).sort();
  return (
    <div className="card bringin" id="bringin">
      <h3>Bring in <span className="note">files from apps you use — read on your phone</span></h3>

      <section className="bi-one" aria-label="Bedroom air">
        <b>Bedroom air — Aranet4</b>
        <p className="note">Aranet Home → a sensor's graph → export → CSV, then pick it here. Each night's CO₂ (22:00–07:00) is kept; the file isn't. Do it every couple of months — the app keeps 90 days.</p>
        <label className="pill-btn bi-pick">{busy === "air" ? "Reading…" : nights.length ? "Add a newer CSV" : "Choose the CSV"}<input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => void air(e.target.files?.[0])} /></label>
        {err.air && <p className="note err">{err.air}</p>}
        {nights.length > 0 && <p className="bi-sum" data-nights={nights.length}><b>{nights.length} night{nights.length === 1 ? "" : "s"}</b> in, {span(nights)}.{last && <> Last night: CO₂ averaged <b>{last.co2} ppm</b>, peaked {last.co2Max}{last.temp != null ? ` · ${last.temp} °C` : ""}.</>}{" "}
          <button type="button" className="linkish" onClick={() => { if (window.confirm("Remove the bedroom air brought in?")) act.setImports({ air: undefined }); }}>Remove</button></p>}
      </section>

      <section className="bi-one" aria-label="Places">
        <b>Places — Google Maps Timeline</b>
        <p className="note">Google Maps → your picture → Settings → Location & privacy (or Personal content) → Export Timeline data, then pick the file here. Kept: each day's time away from home, km, walking and cycling, places, nights away — not where.</p>
        <label className="pill-btn bi-pick">{busy === "places" ? "Reading…" : pdays.length ? "Add a newer export" : "Choose Timeline.json"}<input type="file" accept=".json,application/json" onChange={(e) => void places(e.target.files?.[0])} /></label>
        {err.places && <p className="note err">{err.places}</p>}
        {pdays.length > 0 && <>
          <p className="bi-sum" data-days={pdays.length}><b>{pdays.length} day{pdays.length === 1 ? "" : "s"}</b> in, {span(pdays)}.{" "}
            <button type="button" className="linkish" onClick={() => { if (window.confirm("Remove the places brought in?")) act.setImports({ places: undefined }); }}>Remove</button></p>
          <p className="note">Your top places — name them if you like:</p>
          <ul className="bi-top">{im.places!.top.map((t) => (
            <li key={t.id} data-id={t.id}>
              <input defaultValue={im.places!.names[t.id] ?? (t.home ? "Home" : "")} placeholder={t.lat != null ? `${t.lat.toFixed(3)}, ${t.lng!.toFixed(3)}` : "a place"} aria-label={`Name for the place with ${t.visits} visits`} onBlur={(e) => name(t.id, e.target.value)} />
              <small>{t.home ? "home · " : ""}{t.visits} visit{t.visits === 1 ? "" : "s"} · {t.hours} h</small>
            </li>
          ))}</ul>
        </>}
      </section>
      <p className="note">What comes in is tested like everything else — Connections and What makes a day pick it up once there are about two weeks of it beside your check-ins.</p>
    </div>
  );
}
