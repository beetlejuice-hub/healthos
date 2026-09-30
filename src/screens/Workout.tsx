import { useEffect, useMemo, useState } from "react";
import { act, newId, useStore } from "../lib/store";
import { EXERCISES, exerciseHistory, nextTemplate, sessionPlan, suggestNext, templateProblems, volume, type Suggestion } from "../lib/training";
import { dayLabel } from "../lib/time";
import type { EntryOf, Template, Workout } from "../lib/types";

type SetE = EntryOf<"set">;

/** The last session's sets of an exercise, before a given workout. */
function lastSets(sets: SetE[], exercise: string, notWorkout?: string): SetE[] {
  const prior = sets.filter((s) => s.exercise === exercise && s.workoutId !== notWorkout);
  if (!prior.length) return [];
  const wid = prior[prior.length - 1].workoutId;
  return prior.filter((s) => s.workoutId === wid);
}

export function WorkoutScreen() {
  const workouts = useStore((s) => s.workouts);
  const active = workouts.find((w) => w.endedAt === null);
  return active ? <Session w={active} /> : <Pick />;
}

/** Suggestions while typing an exercise name (your own names work too). */
function ExerciseList() {
  const sets = useStore((s) => s.entries);
  const mine = useMemo(() => [...new Set(sets.filter((e): e is SetE => e.kind === "set").map((e) => e.exercise))], [sets]);
  return <datalist id="exercises">{[...new Set([...mine, ...EXERCISES])].map((n) => <option key={n} value={n} />)}</datalist>;
}

function Pick() {
  const templates = useStore((s) => s.templates);
  const workouts = useStore((s) => s.workouts);
  const entries = useStore((s) => s.entries);
  const sets = useMemo(() => entries.filter((e): e is SetE => e.kind === "set"), [entries]);
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const recent = [...workouts].filter((w) => w.endedAt).slice(-5).reverse();
  const next = nextTemplate(templates, workouts);
  // The day that's due comes first; the rest keep your order.
  const ordered = next ? [next, ...templates.filter((t) => t.id !== next.id)] : templates;
  if (editing) return <TemplateEditor t={editing === "new" ? null : editing} onClose={() => setEditing(null)} />;
  return (
    <div className="cockpit">
      <div className="top"><h1>Workout</h1><div className="meta">{templates.length} day split</div></div>
      {ordered.map((t) => {
        const last = [...workouts].reverse().find((w) => w.template === t.name && w.endedAt);
        const first = t.exercises[0], sug = first ? suggestNext(lastSets(sets, first.name), first.reps) : null;
        return (
          <div className={`tile tpl ${t === next ? "next" : ""}`} key={t.id}>
            {t === next && <span className="k" style={{ color: "var(--gym)" }}>Up next</span>}
            <h2>{t.name}</h2>
            <p>{t.exercises.map((e) => e.name).join(" · ")}<br />{last ? `Last: ${dayLabel(last.startedAt)}` : "Not done yet"}{sug ? ` · ${first.name} ${sug.kg} kg × ${sug.reps}` : ""}</p>
            <div className="tpl-acts">
              <button type="button" className="kbtn" onClick={() => setEditing(t)}>Edit</button>
              <button type="button" className={t === next ? "go" : "go alt"} onClick={() => act.startWorkout(t.name)}>Start</button>
            </div>
          </div>
        );
      })}
      <div className="grid2">
        <button type="button" className="kbtn" onClick={() => setEditing("new")}>+ New day</button>
        <button type="button" className="kbtn" onClick={() => act.startWorkout("Quick workout")}>Quick workout (no plan)</button>
      </div>
      {recent.length > 0 && (
        <div className="tile">
          <span className="k">Recent</span>
          <div className="plan">{recent.map((w) => { const ws = sets.filter((s) => s.workoutId === w.id); return <div key={w.id}><span>{w.template} · {dayLabel(w.startedAt)}{w.note ? <small className="wnote">“{w.note}”</small> : null}</span><span>{ws.length} sets · {Math.round(volume(ws)).toLocaleString("en-GB")} kg</span></div>; })}</div>
        </div>
      )}
    </div>
  );
}

/** Make or change one day of your split: its name and exercises (sets × reps, rest). */
function TemplateEditor({ t, onClose }: { t: Template | null; onClose: () => void }) {
  const templates = useStore((s) => s.templates);
  const [name, setName] = useState(t?.name ?? "");
  const [ex, setEx] = useState<Template["exercises"]>(() => (t?.exercises ?? []).map((e) => ({ ...e })));
  const [tried, setTried] = useState(false);
  const draft = { name: name.trim(), exercises: ex.map((e) => ({ ...e, name: e.name.trim() })) };
  const problems = templateProblems(draft, templates.filter((x) => x.id !== t?.id));
  const upd = (i: number, patch: Partial<Template["exercises"][number]>) => setEx(ex.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= ex.length) return; const c = [...ex]; [c[i], c[j]] = [c[j], c[i]]; setEx(c); };
  const save = () => { setTried(true); if (problems.length) return; act.saveTemplate({ id: t?.id ?? newId(), ...draft }, t?.name); onClose(); };
  const num = (v: string) => Math.round(Number(v) || 0);
  return (
    <div className="cockpit">
      <ExerciseList />
      <div className="top"><h1>{t ? "Edit day" : "New day"}</h1><button type="button" className="kbtn" onClick={onClose}>Cancel</button></div>
      <div className="tile">
        <label className="kfield">Name<input value={name} placeholder="Push, Upper A, Legs…" onChange={(e) => setName(e.target.value)} /></label>
      </div>
      {ex.map((e, i) => (
        <div className="tile exed" key={i}>
          <div className="exed-top">
            <input className="exname" list="exercises" value={e.name} placeholder="Exercise" aria-label={`Exercise ${i + 1}`} onChange={(v) => upd(i, { name: v.target.value })} />
            <button type="button" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
            <button type="button" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === ex.length - 1}>↓</button>
            <button type="button" aria-label={`Remove ${e.name || "exercise"}`} onClick={() => setEx(ex.filter((_, k) => k !== i))}>×</button>
          </div>
          <div className="row3">
            <label className="kfield">Sets<input inputMode="numeric" value={e.sets} onChange={(v) => upd(i, { sets: num(v.target.value) })} /></label>
            <label className="kfield">Reps<input inputMode="numeric" value={e.reps} onChange={(v) => upd(i, { reps: num(v.target.value) })} /></label>
            <label className="kfield">Rest (s)<input inputMode="numeric" value={e.restSec} onChange={(v) => upd(i, { restSec: num(v.target.value) })} /></label>
          </div>
        </div>
      ))}
      <button type="button" className="kbtn" onClick={() => setEx([...ex, { name: "", sets: 3, reps: 10, restSec: 90 }])}>+ Add exercise</button>
      {tried && problems.length > 0 && <div className="tile"><ul className="kprob">{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>}
      <button type="button" className="go" onClick={save}>Save day</button>
      {t && <button type="button" className="kbtn danger" onClick={() => { if (confirm(`Delete ${t.name}? Past workouts stay in your history.`)) { act.setTemplates(templates.filter((x) => x.id !== t.id)); onClose(); } }}>Delete this day</button>}
    </div>
  );
}

function Session({ w }: { w: Workout }) {
  const templates = useStore((s) => s.templates);
  const entries = useStore((s) => s.entries);
  const workouts = useStore((s) => s.workouts);
  const sets = useMemo(() => entries.filter((e): e is SetE => e.kind === "set"), [entries]);
  const plan: Template["exercises"] = sessionPlan(w, templates);
  const done = (ex: string) => sets.filter((s) => s.workoutId === w.id && s.exercise === ex);
  const firstOpen = Math.max(0, plan.findIndex((e) => done(e.name).length < e.sets));
  const [i, setI] = useState(firstOpen === -1 ? 0 : firstOpen);
  const cur = plan[i];
  const [adding, setAdding] = useState<"add" | "swap" | null>(null);
  const [newEx, setNewEx] = useState("");
  const [showHist, setShowHist] = useState(false);
  // Add or swap an exercise for today only; the saved split doesn't change.
  const applyEx = () => {
    const name = newEx.trim(); if (!name) return;
    if (adding === "swap" && plan[i]) act.updateWorkout(w.id, { plan: plan.map((e, k) => (k === i ? { ...e, name } : e)) });
    else { act.updateWorkout(w.id, { plan: [...plan, { name, sets: 3, reps: 10, restSec: 90 }] }); setI(plan.length); }
    setAdding(null); setNewEx("");
  };
  const addBox = adding && (
    <div className="tile addex">
      <ExerciseList />
      <span className="k">{adding === "swap" ? `Swap ${plan[i]?.name} for` : "Add an exercise"}</span>
      <input list="exercises" autoFocus value={newEx} placeholder="Exercise" aria-label="Exercise to add" onChange={(e) => setNewEx(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyEx(); }} />
      <div className="grid2"><button type="button" className="kbtn" onClick={() => setAdding(null)}>Cancel</button><button type="button" className="kbtn pri" disabled={!newEx.trim()} onClick={applyEx}>{adding === "swap" ? "Swap" : "Add"}</button></div>
    </div>
  );
  const note = (
    <div className="tile">
      <label className="kfield">How did it feel?<textarea rows={2} value={w.note ?? ""} placeholder="Strong today, left shoulder a bit off…" onChange={(e) => act.updateWorkout(w.id, { note: e.target.value })} /></label>
    </div>
  );
  const mine = cur ? done(cur.name) : [];
  const prev = cur ? lastSets(sets, cur.name, w.id) : [];
  const sug: Suggestion | null = cur ? suggestNext(prev, cur.reps) : null;
  const [kg, setKg] = useState<number>(sug?.kg ?? 20);
  const [reps, setReps] = useState<number>(cur?.reps ?? 8);
  // When moving to another exercise, start from its suggestion (or what you just did on it).
  useEffect(() => {
    const last = mine[mine.length - 1];
    setKg(last?.kg ?? sug?.kg ?? 20);
    setReps(cur?.reps ?? 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  const [rest, setRest] = useState(0);
  useEffect(() => { if (rest <= 0) return; const t = setTimeout(() => setRest((r) => r - 1), 1000); return () => clearTimeout(t); }, [rest]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const el = Math.max(0, Math.floor((now - w.startedAt) / 1000));

  const total = plan.reduce((a, e) => a + e.sets, 0);
  const doneN = sets.filter((s) => s.workoutId === w.id).length;
  const vol = volume(sets.filter((s) => s.workoutId === w.id));
  const lastSame = (() => { const ws = [...workouts].reverse().find((x) => x.template === w.template && x.id !== w.id && x.endedAt); return ws ? volume(sets.filter((s) => s.workoutId === ws.id)) : null; })();

  const log = () => {
    if (!cur) return;
    act.addEntry({ kind: "set", at: Date.now(), workoutId: w.id, exercise: cur.name, kg, reps });
    const after = mine.length + 1;
    if (after < cur.sets || i < plan.length - 1) setRest(cur.restSec);
  };
  const exDone = cur && mine.length >= cur.sets;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (!cur) return (
    <div className="cockpit">
      <div className="top"><h1>{w.template}</h1><div className="meta"><b>{fmt(el)}</b>elapsed</div></div>
      {addBox || <div className="tile"><p className="s">No exercises yet — add the first one.</p><button type="button" className="go" onClick={() => setAdding("add")}>+ Add exercise</button></div>}
      {note}
      <button type="button" className="go alt" onClick={() => act.tidyWorkouts(Date.now(), true)}>Cancel workout</button>
    </div>
  );

  return (
    <div className="cockpit">
      <div className="top"><h1>{w.template}</h1><div className="meta"><b>{fmt(el)}</b>elapsed</div></div>
      <div className="prog">{Array.from({ length: total }, (_, k) => <i key={k} className={k < doneN ? "on" : ""} />)}</div>

      <div className="tile cur">
        <div className="ex"><b>{cur.name}</b><span>{exDone ? "Done" : `Set ${mine.length + 1} of ${cur.sets}`}</span></div>
        <div className="exacts">
          <button type="button" className="kbtn sm" aria-expanded={showHist} onClick={() => setShowHist(!showHist)}>History</button>
          {mine.length === 0 && <button type="button" className="kbtn sm" onClick={() => { setAdding("swap"); setNewEx(""); }}>Swap</button>}
        </div>
        {showHist && <History sets={sets.filter((x) => x.workoutId !== w.id)} exercise={cur.name} />}
        <div className="steppers">
          <div className="step"><span className="lbl">kg</span><div className="row">
            <button type="button" aria-label="Less weight" onClick={() => setKg((v) => Math.max(0, +(v - 2.5).toFixed(2)))}>−</button>
            <input inputMode="decimal" aria-label="Weight in kg" value={kg} onChange={(e) => setKg(Number(e.target.value.replace(",", ".")) || 0)} />
            <button type="button" aria-label="More weight" onClick={() => setKg((v) => +(v + 2.5).toFixed(2))}>+</button></div></div>
          <div className="step"><span className="lbl">reps</span><div className="row">
            <button type="button" aria-label="Fewer reps" onClick={() => setReps((v) => Math.max(1, v - 1))}>−</button>
            <input inputMode="numeric" aria-label="Reps" value={reps} onChange={(e) => setReps(Math.max(0, Math.round(Number(e.target.value) || 0)))} />
            <button type="button" aria-label="More reps" onClick={() => setReps((v) => v + 1)}>+</button></div></div>
        </div>
        <div className="hint">
          <span>Last time: {prev.length ? <b style={{ color: "var(--k-ink)" }}>{prev[0].kg} × {prev.map((s) => s.reps).join("/")}</b> : "first time"}</span>
          {sug && <span><b>{sug.kg} kg × {sug.reps}</b>: {sug.reason}</span>}
        </div>
        {/* After the planned sets, the big button moves you on — it never keeps adding sets by
            accident (found in testing: 17 sets logged on a 12-set plan). An extra set is still
            one deliberate tap away. */}
        {!exDone && <button type="button" className="go" onClick={log}>Log set</button>}
        {exDone && i < plan.length - 1 && <button type="button" className="go" onClick={() => setI(i + 1)}>Next: {plan[i + 1].name}</button>}
        {exDone && i === plan.length - 1 && <button type="button" className="go" onClick={() => act.endWorkout(w.id)}>Finish workout</button>}
        {exDone && <button type="button" className="kbtn" onClick={log}>+ Extra set of {cur.name}</button>}
        <div className="sets">
          {Array.from({ length: Math.max(cur.sets, mine.length) }, (_, k) => {
            const s = mine[k];
            return (
              <div key={k} className={`set ${s ? "" : "todo"}`}>
                <i>{k + 1}</i>
                <b>{s ? `${s.kg} × ${s.reps}` : `${kg} × ${cur.reps}`}</b>
                <span>{s ? (s.reps >= cur.reps ? "✓ hit" : `${cur.reps - s.reps} short`) : "planned"}</span>
                {s ? <button type="button" aria-label="Delete set" onClick={() => act.removeEntry(s.id)}>×</button> : <span />}
              </div>
            );
          })}
        </div>
      </div>

      <div className={`tile rest ${rest > 0 ? "" : "idle"}`}>
        <div><span className="k">Rest</span><output>{rest > 0 ? fmt(rest) : "Go"}</output></div>
        <div className="bt">
          <button type="button" onClick={() => setRest((r) => Math.max(0, r - 30))}>−30s</button>
          <button type="button" onClick={() => setRest((r) => r + 30)}>+30s</button>
          <button type="button" onClick={() => setRest(0)}>Skip</button>
        </div>
      </div>

      <div className="grid2">
        <div className="tile" style={{ gap: 2 }}><span className="k">Volume</span><span className="big">{Math.round(vol).toLocaleString("en-GB")}<small>kg</small></span><span className="s">{lastSame ? `${Math.round((vol / lastSame) * 100)}% of last ${w.template}` : "first time on this split"}</span></div>
        <div className="tile" style={{ gap: 2 }}><span className="k" style={{ color: "var(--hr)" }}>Heart rate</span><span className="big" style={{ color: "var(--k-dim)" }}>–</span><span className="s">Connect a wearable</span></div>
      </div>

      {addBox}
      <div className="tile plan">
        <span className="k">Session</span>
        {plan.map((e, k) => (
          <div key={k} className={k === i ? "cur-ex" : ""}>
            <button type="button" onClick={() => setI(k)}>{e.name}</button>
            <span>{done(e.name).length}/{e.sets} · {e.reps} reps</span>
          </div>
        ))}
        {!adding && <button type="button" className="kbtn" onClick={() => { setAdding("add"); setNewEx(""); }}>+ Add exercise</button>}
      </div>
      {note}
      {!(exDone && i === plan.length - 1) && <button type="button" className="go alt" onClick={() => { act.endWorkout(w.id); }}>Finish early</button>}
    </div>
  );
}

/** The last sessions of one exercise: sets and best estimated 1-rep max, newest first. */
function History({ sets, exercise }: { sets: SetE[]; exercise: string }) {
  const h = exerciseHistory(sets, exercise, 5);
  if (!h.length) return <p className="s">First time — nothing to compare yet.</p>;
  return (
    <div className="hist">
      {h.map((x) => (
        <div key={x.workoutId}><span>{dayLabel(x.at)}</span><b>{x.sets.map((s) => `${s.kg}×${s.reps}`).join("  ")}</b><span>{x.best ? `${Math.round(x.best)} kg 1RM` : ""}</span></div>
      ))}
      {h.length > 1 && h[0].best && h[h.length - 1].best ? <p className="s">Est. 1-rep max {h[0].best >= h[h.length - 1].best ? "+" : "−"}{Math.abs(h[0].best - h[h.length - 1].best).toFixed(1)} kg over these {h.length} sessions.</p> : null}
    </div>
  );
}
