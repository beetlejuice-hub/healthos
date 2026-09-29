import { useState } from "react";
import { act, getState, useStore } from "../lib/store";
import { makeSample } from "../lib/sample";

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function Settings() {
  const goals = useStore((s) => s.goals);
  const st = useStore((s) => s.settings);
  const hasSample = useStore((s) => s.entries.some((e) => e.id.startsWith("sample:")));
  const [confirm, setConfirm] = useState(false);
  const num = (v: string) => Number(v.replace(",", ".")) || 0;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `healthos-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="calm">
      <div className="head"><span>Settings</span><a href="#today">Done</a></div>

      <div className="card">
        <h3>Daily goals <span>used on Today and Insights</span></h3>
        <div className="row4">
          <label className="field">kcal<input inputMode="numeric" value={goals.kcal} onChange={(e) => act.setGoals({ ...goals, kcal: num(e.target.value) })} /></label>
          <label className="field">Protein g<input inputMode="numeric" value={goals.p} onChange={(e) => act.setGoals({ ...goals, p: num(e.target.value) })} /></label>
          <label className="field">Carbs g<input inputMode="numeric" value={goals.c} onChange={(e) => act.setGoals({ ...goals, c: num(e.target.value) })} /></label>
          <label className="field">Fat g<input inputMode="numeric" value={goals.f} onChange={(e) => act.setGoals({ ...goals, f: num(e.target.value) })} /></label>
        </div>
      </div>

      <div className="card">
        <h3>Caffeine and sleep</h3>
        <div className="row2">
          <label className="field">Bedtime<input type="time" value={hhmm(st.bedMinute)} onChange={(e) => { const [h, m] = e.target.value.split(":").map(Number); act.setSettings({ bedMinute: h * 60 + m }); }} /></label>
          <label className="field">Most caffeine at bedtime (mg)<input inputMode="numeric" value={st.caffeineTargetMg} onChange={(e) => act.setSettings({ caffeineTargetMg: num(e.target.value) })} /></label>
          <label className="field">Caffeine half-life (hours)<input inputMode="decimal" value={st.halfLifeMin / 60} onChange={(e) => act.setSettings({ halfLifeMin: Math.max(60, num(e.target.value) * 60) })} /></label>
          <label className="field">Your usual coffee (mg)<input inputMode="numeric" value={st.coffeeMg} onChange={(e) => act.setSettings({ coffeeMg: num(e.target.value) })} /></label>
        </div>
        <p className="note">Half-life is about 5 hours for most adults, anywhere from 3 to 7. Body weight sets how fast alcohol clears.</p>
        <label className="field">Body weight (kg)<input inputMode="decimal" value={st.bodyKg} onChange={(e) => act.setSettings({ bodyKg: num(e.target.value) })} /></label>
      </div>

      <div className="card">
        <h3>Sample data <span>{hasSample ? "loaded" : "not loaded"}</span></h3>
        <p className="note">60 made-up days shaped like your answers, so Insights has something to show. Everything sample is marked and removed in one tap; your own entries are never touched.</p>
        <div className="row2">
          <button type="button" className="pill-btn" onClick={() => act.loadSample(makeSample())}>{hasSample ? "Reload sample" : "Load sample"}</button>
          <button type="button" className="pill-btn" disabled={!hasSample} onClick={() => act.clearSample()}>Remove sample</button>
        </div>
      </div>

      <div className="card">
        <h3>Your data <span>stored on this device</span></h3>
        <p className="note">Sync between phone and laptop arrives with the Supabase connection. Until then, export a backup now and then.</p>
        <div className="row2">
          <button type="button" className="pill-btn" onClick={exportJson}>Export JSON</button>
          {!confirm
            ? <button type="button" className="pill-btn" onClick={() => setConfirm(true)}>Delete everything…</button>
            : <button type="button" className="pill-btn" style={{ background: "#5a2a2a" }} onClick={() => { localStorage.removeItem("healthos.v1"); location.reload(); }}>Yes, delete all data</button>}
        </div>
      </div>
    </div>
  );
}
