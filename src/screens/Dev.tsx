import { useMemo, useState } from "react";
import { act, getState, applyFromServer, useStore, newId, type State } from "../lib/store";
import { makeSample } from "../lib/sample";
import { currentSyncer, useSyncStatus } from "../lib/session";
import { DOC_KEYS, type DocKey } from "../lib/sync";
import type { Entry } from "../lib/types";
import { clock, localDay } from "../lib/time";

/**
 * Tester-only dev tools (accounts with "+test" in the email). Everything here acts on the
 * signed-in tester's own data — row level security means it can't touch any other account.
 */
export function Dev() {
  const entries = useStore((s) => s.entries);
  const status = useSyncStatus();
  const [kind, setKind] = useState<string>("all");
  const [day, setDay] = useState<string>("");
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [doc, setDoc] = useState<DocKey>("supplements");
  const [docText, setDocText] = useState<string | null>(null);

  const list = useMemo(() => entries.filter((e) => (kind === "all" || e.kind === kind) && (!day || localDay(e.at) === day)).slice().reverse().slice(0, 300), [entries, kind, day]);

  const parse = (t: string): Record<string, unknown> | null => { try { const v = JSON.parse(t); setErr(null); return v; } catch (e) { setErr((e as Error).message); return null; } };
  const save = () => {
    const v = parse(text); if (!v) return;
    if (typeof v.at === "string") v.at = new Date(v.at).getTime();
    if (editing === "new") act.addEntry(v as never);
    else if (editing) act.updateEntry(editing, v as Partial<Entry>);
    setEditing(null);
  };
  const toEdit = (e: Entry) => { const { id: _, ...rest } = e; void _; setEditing(e.id); setText(JSON.stringify({ ...rest, at: new Date(e.at).toISOString() }, null, 2)); };
  const template = (k: string) => {
    const at = new Date().toISOString();
    const t: Record<string, object> = {
      food: { kind: "food", at, name: "Test food", grams: 100, macros: { kcal: 500, p: 30, c: 50, f: 15 } },
      drink: { kind: "drink", at, name: "Filter coffee", ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 },
      supp: { kind: "supp", at, suppId: "mag", status: "taken" },
      set: { kind: "set", at, workoutId: "dev", exercise: "Bench press", kg: 80, reps: 6 },
      weight: { kind: "weight", at, kg: 78.4 },
      feel: { kind: "feel", at, energy: 6, mood: 7, focus: 7, stress: 4 },
    };
    setEditing("new"); setText(JSON.stringify(t[k], null, 2));
  };

  // Same path as Settings → Start over, so the tester wipe exercises the real reset.
  const wipe = async () => {
    try { await currentSyncer()?.resetAll(); setConfirmWipe(false); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="calm" style={{ maxWidth: 760 }}>
      <div className="head"><span>Dev tools · tester account</span><a href="#settings">Back</a></div>

      <div className="card">
        <h3>Sync <span>{status.state} · {status.pending} pending{status.lastSync ? ` · last ${clock(status.lastSync)}` : ""}</span></h3>
        {status.message && <p className="err">{status.message}</p>}
        <div className="row2">
          <button type="button" className="pill-btn" onClick={() => void currentSyncer()?.sync()}>Sync now</button>
          <button type="button" className="pill-btn" onClick={() => { const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "healthos-state.json"; a.click(); }}>Download state</button>
        </div>
      </div>

      <div className="card">
        <h3>Generate <span>{entries.length} entries now</span></h3>
        <div className="row2">
          <button type="button" className="pill-btn" onClick={() => act.loadSample(makeSample(Date.now(), 60))}>60 days of sample</button>
          <button type="button" className="pill-btn" onClick={() => act.loadSample(makeSample(Date.now(), 7))}>7 days of sample</button>
          <button type="button" className="pill-btn" onClick={() => act.clearSample()}>Remove sample</button>
          {!confirmWipe ? <button type="button" className="pill-btn" onClick={() => setConfirmWipe(true)}>Wipe account…</button>
            : <button type="button" className="pill-btn" style={{ background: "#5a2a2a" }} onClick={() => void wipe()}>Yes: delete all of this account's data</button>}
        </div>
      </div>

      <div className="card">
        <h3>Entries <span>{list.length}{list.length === 300 ? "+ (newest 300)" : ""}</span></h3>
        <div className="row2">
          <label className="field">Kind<select value={kind} onChange={(e) => setKind(e.target.value)}>{["all", "food", "drink", "supp", "set", "weight", "feel"].map((k) => <option key={k}>{k}</option>)}</select></label>
          <label className="field">Day<input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {["food", "drink", "supp", "set", "weight", "feel"].map((k) => <button key={k} type="button" className="pill-btn" onClick={() => template(k)}>+ {k}</button>)}
        </div>
        {editing && (
          <div className="card" style={{ background: "var(--c-card-2)" }}>
            <h3>{editing === "new" ? "New entry" : `Edit ${editing}`} <span>JSON · "at" can be an ISO date</span></h3>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} style={{ width: "100%", fontFamily: "var(--f-mono)", fontSize: 13, background: "var(--c-bg)", color: "var(--c-ink)", border: 0, borderRadius: 10, padding: 10 }} aria-label="Entry JSON" />
            {err && <p className="err">{err}</p>}
            <div className="row2"><button type="button" className="pill-btn" onClick={() => setEditing(null)}>Cancel</button><button type="button" className="pill-btn pri" onClick={save}>Save</button></div>
          </div>
        )}
        <div className="list">
          {list.map((e) => (
            <div className="li" key={e.id}>
              <span style={{ minWidth: 0, overflow: "hidden" }}>{e.kind} · {localDay(e.at)} {clock(e.at)}<small style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{JSON.stringify({ ...e, id: undefined, kind: undefined, at: undefined })}</small></span>
              <span style={{ display: "flex", gap: 2 }}>
                <button type="button" className="x" aria-label="Edit" onClick={() => toEdit(e)}>✎</button>
                <button type="button" className="x" aria-label="Delete" onClick={() => act.removeEntry(e.id)}>×</button>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Docs <span>goals, stack, templates, saved foods…</span></h3>
        <label className="field">Doc<select value={doc} onChange={(e) => { setDoc(e.target.value as DocKey); setDocText(null); }}>{DOC_KEYS.map((k) => <option key={k}>{k}</option>)}</select></label>
        <textarea value={docText ?? JSON.stringify(getState()[doc], null, 2)} onChange={(e) => setDocText(e.target.value)} rows={12} style={{ width: "100%", fontFamily: "var(--f-mono)", fontSize: 13, background: "var(--c-card-2)", color: "var(--c-ink)", border: 0, borderRadius: 10, padding: 10 }} aria-label="Doc JSON" />
        <div className="row2">
          <button type="button" className="pill-btn" onClick={() => setDocText(null)}>Reset editor</button>
          <button type="button" className="pill-btn pri" disabled={docText == null} onClick={() => {
            const v = parse(docText ?? ""); if (v == null) return;
            const s = getState();
            const next = { ...s, [doc]: v } as State;
            // Through commit so it syncs.
            if (doc === "goals") act.setGoals(v as never); else if (doc === "settings") act.setSettings(v as never);
            else if (doc === "supplements") act.setSupplements(v as never); else if (doc === "templates") act.setTemplates(v as never);
            else { applyFromServer(next); currentSyncer()?.push(next, s); }
            setDocText(null);
          }}>Save doc</button>
        </div>
      </div>
      <p className="note">Entry ids stay stable across edits. New ids: {newId().slice(0, 8)}…</p>
    </div>
  );
}
