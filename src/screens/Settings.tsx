import { act, getState, useStore } from "../lib/store";
import { makeSample } from "../lib/sample";
import { signOut, useSyncStatus, currentSyncer } from "../lib/session";
import { clock, dayLabel } from "../lib/time";
import { latestWeighIn } from "../lib/body";
import { AboutMe } from "../components/StackCheck";
import { AiSettings } from "../components/Ai";
import { DailyGoals } from "../components/Energy";
import { ResetAll } from "../components/ResetAll";
import { Notifications } from "../components/Notifications";
import { Band } from "../components/Band";
import { AppleHealth } from "../components/AppleHealth";
import { bandExport } from "../lib/band-client";

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function Settings({ tester, email }: { tester: boolean; email: string }) {
  const sync = useSyncStatus();
  const st = useStore((s) => s.settings);
  const weighIn = latestWeighIn(useStore((s) => s.entries), Date.now());
  const hasSample = useStore((s) => s.entries.some((e) => e.id.startsWith("sample:")));
  const num = (v: string) => Number(v.replace(",", ".")) || 0;

  // The band's data lives on the server, not in the app's store: added here so the file has everything.
  const exportJson = async () => {
    const mine = getState();
    const band = await bandExport().catch(() => null);
    const blob = new Blob([JSON.stringify({ ...mine, ...(band ? { band } : {}) }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `healthos-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="calm">
      <div className="head"><span>Settings</span><a href="#today">Done</a></div>

      <div className="card">
        <h3>Account <span>{tester ? "tester" : "personal"}</span></h3>
        <div className="stack-row"><span>{email}<small>Sync: {sync.state === "idle" ? (sync.lastSync ? `up to date · ${clock(sync.lastSync)}` : "waiting") : sync.state}{sync.pending ? ` · ${sync.pending} waiting to upload` : ""}</small></span>
          <button type="button" className="pill-btn" onClick={() => void currentSyncer()?.sync()}>Sync</button></div>
        {sync.message && sync.state !== "idle" && <p className="err">{/schema cache|does not exist|relation/i.test(sync.message) ? "The database isn't set up yet: run supabase/migrations/0001_init.sql in the Supabase SQL editor, then tap Sync." : sync.message}</p>}
        <div className="row2">
          {tester && <a className="pill-btn" href="#dev" style={{ textAlign: "center", textDecoration: "none" }}>Dev tools</a>}
          <button type="button" className="pill-btn" onClick={() => void signOut()}>Sign out</button>
        </div>
      </div>

      <DailyGoals />
      <AboutMe />
      <AiSettings />

      <Notifications />
      <Band />
      <AppleHealth />

      <div className="card">
        <h3>Sleep and body</h3>
        <div className="row2">
          <label className="field">Planned bedtime<input type="time" value={hhmm(st.bedMinute)} onChange={(e) => { const [h, m] = e.target.value.split(":").map(Number); act.setSettings({ bedMinute: h * 60 + m }); }} /></label>
          {weighIn
            ? <div className="field" data-weight="logged">Body weight<b>{weighIn.kg} kg</b><small>your weigh-in, {dayLabel(weighIn.at)} — the app uses your latest one</small></div>
            : <label className="field">Body weight (kg)<input inputMode="decimal" value={st.bodyKg} onChange={(e) => act.setSettings({ bodyKg: num(e.target.value) })} /><small>until your first weigh-in</small></label>}
        </div>
        {/* heart-rate zones for cardio: his age, or a max heart rate he knows (lib/cardio maxHrOf) */}
        <div className="row2">
          <label className="field">Age<input inputMode="numeric" aria-label="Age" value={st.age ?? ""} placeholder="for heart-rate zones" onChange={(e) => act.setSettings({ age: num(e.target.value) || undefined })} /></label>
          <label className="field">Max heart rate<input inputMode="numeric" aria-label="Max heart rate" value={st.maxHr ?? ""} placeholder={st.age ? `about ${Math.round(208 - 0.7 * st.age)} from your age` : "if you know it"} onChange={(e) => act.setSettings({ maxHr: num(e.target.value) || undefined })} /></label>
        </div>
        {/* whose norms the fitness age on Insights → Body lab is set against (lib/fitage) */}
        <label className="field">Fitness age, set against<select aria-label="Fitness age, set against" value={st.sex ?? ""} onChange={(e) => act.setSettings({ sex: (e.target.value || undefined) as "male" | "female" | undefined })}>
          <option value="">not set — asked on the card</option><option value="male">men's norms</option><option value="female">women's norms</option>
        </select></label>
        <p className="note">Planned bedtime is what caffeine is measured against for now; your real bedtime will come from the wearable. Body weight (your latest weigh-in) sets how fast alcohol clears. How fast you clear caffeine and how much bothers your sleep aren't settings: they'll be learned from your own data.</p>
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
        <h3>Your data <span>synced to your account</span></h3>
        <p className="note">Everything you log is saved on this device first and synced to your account, so it's on your phone and laptop. Export gives you all of it as one file.</p>
        <button type="button" className="pill-btn" onClick={() => void exportJson()}>Export JSON</button>
      </div>
      <ResetAll onExport={() => void exportJson()} />
      <p className="note" style={{ textAlign: "center" }}>Version {__BUILD__.commit} · built {new Date(__BUILD__.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
    </div>
  );
}
