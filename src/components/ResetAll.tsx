/**
 * Settings → Start over. Deletes everything the account holds, on the server and every device
 * (see Syncer.resetAll and the reset doc in lib/sync.ts). Two steps and a typed word, because it
 * can't be undone; the export sits right next to it.
 */

import { useState } from "react";
import { currentSyncer } from "../lib/session";

const WORD = "RESET";

export function ResetAll({ onExport }: { onExport: () => void }) {
  const [step, setStep] = useState<"idle" | "confirm" | "busy" | "done">("idle");
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    const s = currentSyncer();
    if (!s) { setErr("Not signed in."); return; }
    if (typeof navigator !== "undefined" && !navigator.onLine) { setErr("You're offline. The reset needs the server, so your other devices clear too. Try again with a connection."); return; }
    setStep("busy"); setErr(null);
    try {
      await s.resetAll();
      setStep("done"); setTyped("");
    } catch (e) {
      setStep("confirm");
      setErr(`Nothing was deleted on this device: ${(e as Error).message}. Try again.`);
    }
  };

  return (
    <div className="card reset">
      <h3>Start over <span>deletes everything</span></h3>
      {step === "done" ? <p className="note ok-note" role="status">Done. Everything's deleted and this is a fresh account. Your other devices clear themselves the next time they open the app.</p> : <>
        <p className="note">Deletes every entry, saved food and drink, your stack, workouts and split, goals, settings, About me, and everything the engines and the AI have learned, on the server and on every device. Your sign-in stays. This can't be undone.</p>
        {step === "idle" ? (
          <div className="row2">
            <button type="button" className="pill-btn" onClick={onExport}>Export first</button>
            <button type="button" className="pill-btn danger" onClick={() => setStep("confirm")}>Reset all data…</button>
          </div>
        ) : (
          <>
            <label className="field">Type {WORD} to confirm
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-label={`Type ${WORD} to confirm`} />
            </label>
            <div className="row2">
              <button type="button" className="pill-btn" disabled={step === "busy"} onClick={() => { setStep("idle"); setTyped(""); setErr(null); }}>Cancel</button>
              <button type="button" className="pill-btn danger" disabled={typed.trim().toUpperCase() !== WORD || step === "busy"} onClick={() => void run()}>{step === "busy" ? "Deleting…" : "Delete everything"}</button>
            </div>
          </>
        )}
      </>}
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  );
}
