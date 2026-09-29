import { useState } from "react";
import { supabase } from "../lib/supabase";

type Mode = "in" | "up" | "reset";

/** Email + password. One sign-in per device, then it stays signed in. */
export function Auth() {
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
        if (error) throw error;
        if (!data.session) setMsg({ ok: true, text: "Account created. Check your email for the confirmation link, then sign in." });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
        if (error) throw error;
        setMsg({ ok: true, text: "If that address has an account, a reset link is on its way." });
      }
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message || "Something went wrong." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="calm" style={{ paddingTop: "12vh" }}>
      <h1 style={{ margin: "0 6px", fontFamily: "var(--f-serif)", fontWeight: 400, fontSize: 34 }}>HealthOS</h1>
      <p className="note" style={{ margin: "0 6px 8px", fontSize: 14 }}>Your body's data in one place.</p>
      <form className="card" onSubmit={submit}>
        <h3>{mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Reset password"}</h3>
        <label className="field">Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {mode !== "reset" && <label className="field">Password<input type="password" autoComplete={mode === "up" ? "new-password" : "current-password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></label>}
        {msg && <p className={msg.ok ? "note" : "err"}>{msg.text}</p>}
        <button type="submit" className="pill-btn pri" disabled={busy}>{busy ? "…" : mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Send reset link"}</button>
        <div className="row2">
          {mode !== "in" && <button type="button" className="pill-btn" onClick={() => { setMode("in"); setMsg(null); }}>Back to sign in</button>}
          {mode === "in" && <button type="button" className="pill-btn" onClick={() => { setMode("up"); setMsg(null); }}>Create account</button>}
          {mode === "in" && <button type="button" className="pill-btn" onClick={() => { setMode("reset"); setMsg(null); }}>Forgot password?</button>}
        </div>
      </form>
    </div>
  );
}

/** Shown after following a reset link: set the new password, then carry on signed in. */
export function NewPassword({ done }: { done: () => void }) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="calm" style={{ paddingTop: "12vh" }}>
      <form className="card" onSubmit={async (e) => { e.preventDefault(); const { error } = await supabase.auth.updateUser({ password }); if (error) setErr(error.message); else done(); }}>
        <h3>Choose a new password</h3>
        <label className="field">New password<input type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {err && <p className="err">{err}</p>}
        <button type="submit" className="pill-btn pri">Save password</button>
      </form>
    </div>
  );
}
