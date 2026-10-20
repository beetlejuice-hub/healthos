import { useEffect, useMemo, useRef, useState } from "react";
import { act, newId, useStore } from "../lib/store";
import { e1rm, exerciseHistory, isBest, isDumbbell, oneDumbbell, kgStep, stepKg, warmKg, warmsUp, mainMuscle, nextTemplate, restLeft, sessionPlan, sessionSummary, templateProblems, volume, type Suggestion } from "../lib/training";
import { PROGRAMS, asSplit, asTemplate } from "../lib/programs";
import { MuscleMap } from "../components/MuscleMap";
import { DayCard } from "../components/DayCard";
import { ExercisePicker } from "../components/ExercisePicker";
import { MuscleBrowse } from "../components/MuscleBrowse";
import { equipOf } from "../lib/exsearch";
import { useMyExercises } from "../components/useMyExercises";
import { nameFor, pickFor } from "../lib/exsearch";
import { clock, dayLabel } from "../lib/time";
import type { EntryOf, Template, Workout } from "../lib/types";
import { variantsOf } from "../lib/variants";
import { CARDIO_CHIPS, cardioHr, cardioSpans, minutesOf } from "../lib/cardio";
import { CardioSession } from "../components/CardioSession";
import { DecimalInput } from "../components/DecimalInput";
import { adaptNext, historyOf, plateau, repsLabel, repsOf, smartNext } from "../lib/progress";
import { RepsInput } from "../components/RepsInput";
import { StrengthCard } from "../components/StrengthCard";
import { useBand } from "../lib/band-client";

type SetE = EntryOf<"set">;
/** One tap for cardio when none was planned. */
const CARDIO = CARDIO_CHIPS;

/** The last session's sets of an exercise, before a given workout. */
function lastSets(sets: SetE[], exercise: string, notWorkout?: string): SetE[] {
  const prior = sets.filter((s) => s.exercise === exercise && s.workoutId !== notWorkout && !s.warmup);
  if (!prior.length) return [];
  const wid = prior[prior.length - 1].workoutId;
  return prior.filter((s) => s.workoutId === wid);
}

export function WorkoutScreen() {
  const workouts = useStore((s) => s.workouts);
  const active = workouts.find((w) => w.endedAt === null);
  return active ? (active.kind === "cardio" ? <CardioSession w={active} /> : <Session w={active} />) : <Pick />;
}

function Pick() {
  const templates = useStore((s) => s.templates);
  const workouts = useStore((s) => s.workouts);
  const entries = useStore((s) => s.entries);
  const sets = useMemo(() => entries.filter((e): e is SetE => e.kind === "set"), [entries]);
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const recent = [...workouts].filter((w) => w.endedAt).slice(-5).reverse(), now = Date.now();
  const band = useBand().data;
  const spans = useMemo(() => cardioSpans(workouts, Date.now()), [workouts]);
  const next = nextTemplate(templates, workouts);
  // The day that's due comes first; the rest keep your order.
  const ordered = next ? [next, ...templates.filter((t) => t.id !== next.id)] : templates;
  if (editing) return <TemplateEditor t={editing === "new" ? null : editing} onClose={() => setEditing(null)} />;
  return (
    <div className="cockpit">
      <div className="top"><h1>Workout</h1><div className="meta">{templates.length}-day split</div></div>
      {ordered.map((t) => {
        const last = [...workouts].reverse().find((w) => w.template === t.name && w.endedAt);
        const first = t.exercises[0], sug = first ? smartNext(historyOf(sets, first.name), repsOf(first), kgStep(first.name, sets.filter((s) => s.exercise === first.name && !s.warmup).map((s) => s.kg), equipOf(first.name) === "dumbbell")) : null;
        return <DayCard key={t.id} t={t} dayNo={templates.indexOf(t) + 1} next={t === next} lastAt={last?.startedAt ?? null}
          sug={sug ? { exercise: first.name, kg: sug.kg, reps: sug.reps } : null} onEdit={() => setEditing(t)} onStart={() => act.startWorkout(t.name)} />;
      })}
      <div className="grid2">
        <button type="button" className="kbtn" onClick={() => setEditing("new")}>+ New day</button>
        <button type="button" className="kbtn" onClick={() => act.startWorkout("Quick workout")}>Quick workout</button>
      </div>
      {/* PLAN 130 (owner, 20 Oct: "a button that i press and it strts w timer"): one tap starts it */}
      <div className="tile cardio-start">
        <span className="k">Cardio · one tap starts the timer</span>
        <div className="picks" aria-label="Start cardio">{CARDIO.map((c) => <button type="button" key={c} onClick={() => act.startCardio(c)}>▶ {c}</button>)}</div>
      </div>
      <StrengthCard sets={sets} now={now} className="tile strength" />
      <MuscleMap sets={sets} now={now} />
      <Premade templates={templates} />
      {recent.length > 0 && (
        <div className="tile">
          <span className="k">Recent</span>
          <div className="plan">{recent.map((w) => {
            if (w.kind === "cardio") { const sp = spans.find((x) => x.workoutId === w.id && x.own), h = sp && band ? cardioHr(band.hr, sp.start, sp.end) : null;
              return <div key={w.id}><span>{sp?.what ?? "Cardio"} · {dayLabel(w.startedAt)}{w.note ? <small className="wnote">“{w.note}”</small> : null}</span><span>{sp ? minutesOf(sp) : 0} min{h ? ` · avg ${h.avg} bpm` : ""}</span></div>; }
            const ws = sets.filter((s) => s.workoutId === w.id); return <div key={w.id}><span>{w.template} · {dayLabel(w.startedAt)}{w.note ? <small className="wnote">“{w.note}”</small> : null}</span><span>{ws.length} sets · {Math.round(volume(ws)).toLocaleString("en-GB")} kg</span></div>; })}</div>
        </div>
      )}
    </div>
  );
}

/** Make or change one day of your split: its name and exercises (sets × reps, rest). */
/**
 * Premade workouts (lib/programs): start any day once, or make the whole program your split.
 * Replacing the split asks first, and past workouts keep their names and history.
 */
function Premade({ templates }: { templates: Template[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const mine = templates.map((t) => t.name).join("|");
  return (
    <div className="tile premade">
      <span className="k">Premade workouts</span>
      {PROGRAMS.map((p) => {
        const isMine = p.days.map((d) => d.name).join("|") === mine;
        return (
          <div key={p.id} className={`prog-card${open === p.id ? " open" : ""}`}>
            <button type="button" className="prog-head" aria-expanded={open === p.id} onClick={() => { setOpen(open === p.id ? null : p.id); setConfirm(null); }}>
              <b>{p.name}</b><span>{p.who} · {p.perWeek}</span>
            </button>
            {open === p.id && <div className="prog-body">
              {p.days.map((d) => (
                <div key={d.id} className="prog-day">
                  <div><b>{d.name}</b><p>{d.exercises.map((e) => `${e.name}${e.or ? ` (or ${e.or.toLowerCase()})` : ""} ${e.sets}×${e.reps === 1 ? "hold" : e.reps}`).join(" · ")}{d.after && <>, <i>then {d.after}</i></>}</p></div>
                  <button type="button" className="kbtn pri" onClick={() => act.startWorkout(d.name, Date.now(), asTemplate(d).exercises, d.after)}>Start</button>
                </div>
              ))}
              {p.other?.map((o) => <div key={o.name} className="prog-day prog-other"><div><b>{o.name}</b><p>{o.what}</p></div></div>)}
              {p.rules && <ul className="prog-rules">{p.rules.map((r) => <li key={r}>{r}</li>)}</ul>}
              <p className="s">Yours to change: make it your split, then press Edit on any day to swap an exercise, change sets, reps or rest, reorder, or add your own.</p>
              {isMine ? <p className="s">This is your split.</p>
                : confirm === p.id
                  ? <div className="grid2"><button type="button" className="kbtn" onClick={() => setConfirm(null)}>Cancel</button><button type="button" className="kbtn pri" onClick={() => { act.setTemplates(asSplit(p)); setConfirm(null); setOpen(null); }}>Replace my split</button></div>
                  : <button type="button" className="kbtn" onClick={() => setConfirm(p.id)}>Make this my split…</button>}
              {confirm === p.id && <p className="s">Your {templates.length} days ({templates.map((t) => t.name).join(", ")}) are replaced by these {p.days.length}. Past workouts and their history stay.</p>}
            </div>}
          </div>
        );
      })}
    </div>
  );
}

function TemplateEditor({ t, onClose }: { t: Template | null; onClose: () => void }) {
  const templates = useStore((s) => s.templates);
  const [name, setName] = useState(t?.name ?? "");
  const [ex, setEx] = useState<Template["exercises"]>(() => (t?.exercises ?? []).map((e) => ({ ...e })));
  const [cardio, setCardio] = useState(t?.cardio ?? "");
  const [tried, setTried] = useState(false);
  const draft = { name: name.trim(), exercises: ex.map((e) => ({ ...e, name: e.name.trim() })), ...(cardio.trim() ? { cardio: cardio.trim() } : {}) };
  const problems = templateProblems(draft, templates.filter((x) => x.id !== t?.id));
  const upd = (i: number, patch: Partial<Template["exercises"][number]>) => setEx(ex.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= ex.length) return; const c = [...ex]; [c[i], c[j]] = [c[j], c[i]]; setEx(c); };
  const mine = useMyExercises();
  // a typed name that's an exercise you already have is saved as that one (PLAN 94: no second "bench press")
  const save = () => { setTried(true); if (problems.length) return; act.saveTemplate({ id: t?.id ?? newId(), ...draft, exercises: draft.exercises.map((e) => ({ ...e, name: nameFor(e.name, mine) })) }, t?.name); onClose(); };
  const num = (v: string) => Math.round(Number(v) || 0);
  return (
    <div className="cockpit">
      <div className="top"><h1>{t ? "Edit day" : "New day"}</h1><button type="button" className="kbtn" onClick={onClose}>Cancel</button></div>
      <div className="tile">
        <label className="kfield">Name<input value={name} placeholder="Push, Upper A, Legs…" onChange={(e) => setName(e.target.value)} /></label>
      </div>
      {ex.map((e, i) => (
        <div className="tile exed" key={i}>
          <div className="exed-top">
            <ExercisePicker className="exname" value={e.name} placeholder="Exercise" label={`Exercise ${i + 1}`} onChange={(v) => upd(i, { name: v })} onPick={(n) => upd(i, { name: n })} />
            <button type="button" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
            <button type="button" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === ex.length - 1}>↓</button>
            <button type="button" aria-label={`Remove ${e.name || "exercise"}`} onClick={() => setEx(ex.filter((_, k) => k !== i))}>×</button>
          </div>
          <div className="row3">
            <label className="kfield">Sets<input inputMode="numeric" value={e.sets} onChange={(v) => upd(i, { sets: num(v.target.value) })} /></label>
            {/* PLAN 144: a range, 8-12, or one number */}
            <label className="kfield">Reps<RepsInput label={`Reps for ${e.name || `new row ${i + 1}`}`} value={e} onValue={(v) => upd(i, { reps: v.reps, repsMax: v.repsMax })} /></label>
            <label className="kfield">Rest (s)<input inputMode="numeric" value={e.restSec} onChange={(v) => upd(i, { restSec: num(v.target.value) })} /></label>
          </div>
        </div>
      ))}
      <button type="button" className="kbtn" onClick={() => setEx([...ex, { name: "", sets: 3, reps: 10, restSec: 90 }])}>+ Add exercise</button>
      <div className="tile"><label className="kfield">Cardio after (optional)<input value={cardio} placeholder="20 min stairmaster" onChange={(e) => setCardio(e.target.value)} /></label></div>
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
  // Working sets only; a warm-up is shown, never counted (PLAN 80).
  const doneAll = (ex: string) => sets.filter((s) => s.workoutId === w.id && s.exercise === ex);
  const done = (ex: string) => doneAll(ex).filter((s) => !s.warmup);
  const firstOpen = Math.max(0, plan.findIndex((e) => done(e.name).length < e.sets));
  const [i, setI] = useState(firstOpen === -1 ? 0 : firstOpen);
  const cur = plan[i];
  const [adding, setAdding] = useState<"add" | "swap" | null>(null);
  const [newEx, setNewEx] = useState("");
  const [showHist, setShowHist] = useState(false);
  // Swap / add: pick by muscle, opened on the muscle of the exercise you're on, without what's already planned (#81;
  // owner, 14 Oct: "Add more exercise options so i can change if … machine is used").
  const startMuscle = adding && plan[i] ? mainMuscle(plan[i].name) : null;
  const planned = useMemo(() => plan.map((e) => e.name), [plan]);
  // it opens under the exercise, mostly below the fold on a phone: bring it up so the muscles and the list show
  const addRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (adding) addRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }, [adding]);
  const mineEx = useMyExercises();
  // Add or swap an exercise for today only; the saved split doesn't change. A typed name you already have is that one.
  const applyEx = (picked?: string) => {
    const name = picked ?? pickFor(newEx, mineEx); if (!name) return;
    if (adding === "swap" && plan[i]) act.updateWorkout(w.id, { plan: plan.map((e, k) => (k === i ? { ...e, name } : e)) });
    else { act.updateWorkout(w.id, { plan: [...plan, { name, sets: 3, reps: 10, restSec: 90 }] }); setI(plan.length); }
    setAdding(null); setNewEx("");
  };
  const addBox = adding && (
    <div className="tile addex" ref={addRef}>
      <span className="k">{adding === "swap" ? `Swap ${plan[i]?.name} for` : "Add an exercise"}</span>
      {/* the box first, so the keyboard doesn't cover it; while you type, the matches take the chips' place */}
      <ExercisePicker autoFocus={!startMuscle} value={newEx} placeholder="Search: name, machine, muscle…" label="Exercise to add" onChange={setNewEx} onPick={(n) => applyEx(n)} />
      {!newEx.trim() && <MuscleBrowse start={startMuscle} skip={planned} onPick={(n) => applyEx(n)} />}
      <div className="grid2"><button type="button" className="kbtn" onClick={() => setAdding(null)}>Cancel</button><button type="button" className="kbtn pri" disabled={!newEx.trim()} onClick={() => applyEx()}>{adding === "swap" ? "Swap" : "Add"}{newEx.trim() ? ` → ${pickFor(newEx, mineEx)}` : ""}</button></div>
    </div>
  );
  const note = (
    <div className="tile">
      <label className="kfield">How did it feel?<textarea rows={2} value={w.note ?? ""} placeholder="Strong today, left shoulder a bit off…" onChange={(e) => act.updateWorkout(w.id, { note: e.target.value })} /></label>
    </div>
  );
  const mine = cur ? done(cur.name) : [];
  const dumb = !!cur && (equipOf(cur.name) === "dumbbell" || isDumbbell(cur.name)), pair = dumb && !oneDumbbell(cur!.name);
  const vars = cur ? variantsOf(cur.name) : null;
  const warmToday = cur ? doneAll(cur.name).filter((s) => s.warmup) : [];
  const prev = cur ? lastSets(sets, cur.name, w.id) : [];
  // the weight step from your own weights on it: dumbbells that go 34, 36, 38 step by 2 (owner, 20 Oct: "36.5 instead of 36")
  const step = cur ? kgStep(cur.name, sets.filter((s) => s.exercise === cur.name && !s.warmup).map((s) => s.kg), equipOf(cur.name) === "dumbbell") : 2.5;
  // PLAN 143: smarter than "all hit → up": reps to spare jump two steps, a stall steps back, a plateau is named
  const hist = useMemo(() => (cur ? historyOf(sets, cur.name, w.id) : []), [sets, cur, w.id]);
  const rr = cur ? repsOf(cur) : { lo: 8, hi: 8 }, ranged = rr.hi > rr.lo;
  const sug: Suggestion | null = cur ? smartNext(hist, rr, step) : null;
  const flat = useMemo(() => plateau(hist), [hist]);
  // the next set inside today's session, from how the last one went ("12 reps — that was light")
  const [adapt, setAdapt] = useState<string | null>(null);
  const [kg, setKg] = useState<number>(sug?.kg ?? 20);
  const [reps, setReps] = useState<number>(sug?.reps ?? cur?.reps ?? 8);
  // Owner, 13 Oct: "warm up plus 2-3 sets"; 20 Oct: "By default the warmup set should be first". The first set of each
  // exercise is a warm-up (training `warmsUp`), "Skip warm-up" skips it. Lighter, ~10 reps, never counted.
  const [warmOn, setWarmOn] = useState(false);
  // the working weight set aside while warming up — what you typed, or the suggestion — and put back after
  const workRef = useRef<number | null>(null);
  const startWarm = (on: boolean) => {
    setWarmOn(on); if (!cur) return;
    if (on) { workRef.current = kg; setKg(warmKg(kg, cur.name, step)); setReps(10); }
    else { setKg(workRef.current ?? mine[mine.length - 1]?.kg ?? sug?.kg ?? 20); workRef.current = null; setReps(sug?.reps ?? cur.reps); }
  };
  // When moving to another exercise — or switching this one to another variant, or swapping it — start from its
  // suggestion (or what you just did on it): a dumbbell's weight isn't the bar's.
  useEffect(() => {
    const last = mine[mine.length - 1];
    const warm = !!cur && !last && warmToday.length === 0 && warmsUp(sets, cur.name, w.id);
    setWarmOn(warm);
    workRef.current = warm ? sug?.kg ?? 20 : null;
    setKg(warm && cur ? warmKg(sug?.kg ?? 20, cur.name, step) : last?.kg ?? sug?.kg ?? 20);
    setReps(warm ? 10 : sug?.reps ?? cur?.reps ?? 8);
    setAdapt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, cur?.name]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  // Rest ends at a saved time (owner: "time should continue when i quit the app"): leave the app,
  // come back, and it shows what's really left. A buzz when it runs out while open (Android).
  const rest = restLeft(w.restUntil, Date.now()); // fresh, not the last tick: right after a set it reads 2:30, not 2:31
  const setRest = (sec: number) => act.updateWorkout(w.id, { restUntil: sec > 0 ? Date.now() + sec * 1000 : null });
  const wasResting = useRef(false);
  useEffect(() => { if (wasResting.current && rest === 0) navigator.vibrate?.([180, 90, 180]); wasResting.current = rest > 0; }, [rest]);
  const [best, setBest] = useState<{ exercise: string; kg: number; reps: number; e1rm: number; at: number } | null>(null);
  const [finishing, setFinishing] = useState(false);
  // The big button changes job after a set (Log set → Next); a quick second tap meant for "Log set"
  // shouldn't land on the new job. Owner, 2 Oct: hit "workout done" when meaning "set done".
  const lastLog = useRef(0);
  const settled = () => Date.now() - lastLog.current > 900;
  const el = Math.max(0, Math.floor((now - w.startedAt) / 1000));

  const total = plan.reduce((a, e) => a + e.sets, 0);
  const doneN = sets.filter((s) => s.workoutId === w.id && !s.warmup).length;
  const vol = volume(sets.filter((s) => s.workoutId === w.id));
  const lastSame = (() => { const ws = [...workouts].reverse().find((x) => x.template === w.template && x.id !== w.id && x.endedAt); return ws ? volume(sets.filter((s) => s.workoutId === ws.id)) : null; })();

  const log = () => {
    if (!cur) return;
    const at = Date.now();
    lastLog.current = at;
    const set = { at, workoutId: w.id, exercise: cur.name, kg, reps, ...(warmOn ? { warmup: true } : {}) };
    if (warmOn) { act.addEntry({ kind: "set", ...set }); startWarm(false); setRest(60); return; }
    if (isBest(sets, set)) setBest({ exercise: cur.name, kg, reps, e1rm: Math.round(e1rm(kg, reps) * 10) / 10, at });
    act.addEntry({ kind: "set", ...set });
    const after = mine.length + 1;
    // a set well over or under the target moves the next one (PLAN 143), when there is a next one
    const a = after < cur.sets ? adaptNext([...mine, set], rr, step) : null;
    setAdapt(a ? `Next set ${a.kg} kg: ${a.reason}` : null);
    if (a) setKg(a.kg);
    if (after < cur.sets || i < plan.length - 1) setRest(cur.restSec);
  };
  const exDone = cur && mine.length >= cur.sets;
  // What's left today, and the default next: the first unfinished one after this, else before it.
  const open = plan.map((_, k) => k).filter((k) => k !== i && done(plan[k].name).length < plan[k].sets);
  const next = open.find((k) => k > i) ?? open[0];
  const allDone = exDone && next == null;
  const cardio = w.cardio;
  const setCardio = (done?: boolean) => act.updateWorkout(w.id, { cardio: { what: cardio!.what, ...(cardio?.startedAt ? { startedAt: cardio.startedAt } : {}), ...(done == null ? {} : { done, at: Date.now() }) } });
  // Cardio whenever you like (owner, 14 Oct: "Should be able to start cardio even when not done w all exercises"):
  // started early, its tile shows now and the sets left wait; with none planned, one can be added.
  const startCardio = (what = cardio?.what) => { if (what) act.updateWorkout(w.id, { cardio: { what, startedAt: Date.now() } }); setAddingCardio(false); };
  const [addingCardio, setAddingCardio] = useState(false);
  const [cardioWhat, setCardioWhat] = useState("");
  const cardioOn = !!cardio && (allDone || cardio.startedAt != null || cardio.done != null);
  const cardioRunning = !!cardio && cardio.startedAt != null && cardio.done == null;
  const setsLeft = plan.reduce((a, e) => a + Math.max(0, e.sets - done(e.name).length), 0);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (!cur) return (
    <div className="cockpit">
      <div className="top"><h1>{w.template}</h1><div className="meta"><b>{fmt(el)}</b>elapsed</div></div>
      {addBox || <div className="tile"><p className="s">No exercises yet — add the first one.</p><button type="button" className="go" onClick={() => setAdding("add")}>+ Add exercise</button></div>}
      {note}
      <button type="button" className="go alt" onClick={() => act.tidyWorkouts(Date.now(), true)}>Cancel workout</button>
    </div>
  );

  if (finishing) return <FinishSheet w={w} onBack={() => setFinishing(false)} />;
  return (
    <div className="cockpit">
      <div className="top"><h1>{w.template}</h1><div className="meta"><b>{fmt(el)}</b>elapsed</div></div>
      <div className="prog">{Array.from({ length: total }, (_, k) => <i key={k} className={k < doneN ? "on" : ""} />)}</div>

      {/* PLAN 142 (owner, 20 Oct: "When starting cardio kg tracker for strength workout should disappear"): while cardio
          runs, the sets, rest and volume step aside; Done brings back any sets left */}
      {!cardioRunning && <div className="tile cur">
        <div className="ex"><b>{cur.name}</b><span>{warmOn ? "Warm-up" : exDone ? `${mine.length} of ${cur.sets} done` : `Set ${mine.length + 1} of ${cur.sets}`}</span></div>
        <div className="exacts">
          <button type="button" className="kbtn sm" aria-expanded={showHist} onClick={() => setShowHist(!showHist)}>History</button>
          {mine.length === 0 && <button type="button" className="kbtn sm" onClick={() => { setAdding("swap"); setNewEx(""); }}>Swap</button>}
          {mine.length === 0 && warmToday.length === 0 && <button type="button" className="kbtn sm" aria-pressed={warmOn} onClick={() => startWarm(!warmOn)}>{warmOn ? "Skip warm-up" : "Warm-up first"}</button>}
        </div>
        {/* the same movement on other equipment, one tap, before the first working set — today only, like Swap (owner,
            20 Oct: "incline bench press and the i can choose wheter machine, bench w barbell, bemch w dumbbell") */}
        {vars && mine.length === 0 && <div className="variants" role="group" aria-label={`${vars.move}, on`}>
          {vars.options.map((o) => <button key={o.name} type="button" className="kbtn sm" aria-pressed={o.name === cur.name} aria-label={o.name} onClick={() => { if (o.name !== cur.name) act.updateWorkout(w.id, { plan: plan.map((e, k) => (k === i ? { ...e, name: o.name } : e)) }); }}>{o.label}</button>)}
        </div>}
        {showHist && <History sets={sets.filter((x) => x.workoutId !== w.id)} exercise={cur.name} />}
        <div className="steppers">
          {/* PLAN 140: the total in your hands — what he types; "2 × 20" to read off the rack */}
          <div className="step"><span className="lbl">{dumb ? <>kg total{pair && kg > 0 ? <em className="perhand"> · 2 × {+(kg / 2).toFixed(2)}</em> : null}</> : "kg"}</span><div className="row">
            <button type="button" aria-label="Less weight" onClick={() => setKg((v) => stepKg(v, step, -1))}>−</button>
            {/* a long number gets a smaller size: at 44 px "32.5" was cut to "32" on a phone */}
            <DecimalInput aria-label="Weight in kg" value={kg} onValue={setKg} />
            <button type="button" aria-label="More weight" onClick={() => setKg((v) => stepKg(v, step, 1))}>+</button></div></div>
          <div className="step"><span className="lbl">reps</span><div className="row">
            <button type="button" aria-label="Fewer reps" onClick={() => setReps((v) => Math.max(1, v - 1))}>−</button>
            <input inputMode="numeric" aria-label="Reps" value={reps} onChange={(e) => setReps(Math.max(0, Math.round(Number(e.target.value) || 0)))} />
            <button type="button" aria-label="More reps" onClick={() => setReps((v) => v + 1)}>+</button></div></div>
        </div>
        <div className="hint">
          <span>Last time: {prev.length ? <b style={{ color: "var(--k-ink)" }}>{prev[0].kg} × {prev.map((s) => s.reps).join("/")}</b> : "first time"}</span>
          {adapt ? <span className="adapt"><b>{adapt}</b></span> : sug && <span><b>{sug.kg} kg × {sug.reps}</b>: {sug.reason}</span>}
          {flat && mine.length === 0 && <span className="plateau">{flat}</span>}
        </div>
        {/* After the planned sets, the big button moves you on — it never keeps adding sets by
            accident (found in testing: 17 sets logged on a 12-set plan). An extra set is still
            one deliberate tap away. */}
        {best && best.exercise === cur.name && now - best.at < 20_000 && <p className="best" role="status">New best · {best.kg} kg × {best.reps} · est. 1RM {best.e1rm} kg</p>}
        {(warmOn || !exDone) && <button type="button" className="go" onClick={log}>{warmOn ? "Log warm-up" : "Log set"}</button>}
        {/* Planned sets done: the next exercise is suggested, never forced — another set of this one sits right beside it
            (owner, 13 Oct: "i should be able to log another set"). */}
        {!warmOn && exDone && <div className={next != null ? "go-row" : undefined}>
          {next != null && <button type="button" className="go" onClick={() => settled() && setI(next)}>Next: {plan[next].name}</button>}
          <button type="button" className="go alt" onClick={() => settled() && log()}>+ Set {mine.length + 1}</button>
        </div>}
        {/* Finishing never sits where "Log set" was: it's at the bottom, and asks first. */}
        {allDone && <p className="alldone" role="status">✓ All planned sets done</p>}
        {/* Owner, 6 Oct: "finish all 3, choose another exercise" — any of today's others, or something new. */}
        {exDone && !adding && (open.length > 1 || next == null) && <div className="picks" aria-label="Or pick another">
          <span className="s">{next == null ? "Another one?" : "Or:"}</span>
          {open.filter((k) => k !== next).map((k) => <button type="button" key={k} onClick={() => settled() && setI(k)}>{plan[k].name}</button>)}
          <button type="button" className="add" onClick={() => { setAdding("add"); setNewEx(""); }}>+ Add</button>
        </div>}

        <div className="sets">
          {warmToday.map((s) => (
            <div key={s.id} className="set warm">
              <i>W</i><b>{s.kg} × {s.reps}</b><span>warm-up</span>
              <button type="button" aria-label="Delete warm-up" onClick={() => act.removeEntry(s.id)}>×</button>
            </div>
          ))}
          {Array.from({ length: Math.max(cur.sets, mine.length) }, (_, k) => {
            const s = mine[k];
            return (
              <div key={k} className={`set ${s ? "" : "todo"}`}>
                <i>{k + 1}</i>
                <b>{s ? `${s.kg} × ${s.reps}` : `${kg} × ${ranged ? `${reps} (${rr.lo}–${rr.hi})` : cur.reps}`}</b>
                <span>{s ? (ranged && s.reps >= rr.hi ? "✓ top" : s.reps >= rr.lo ? "✓ hit" : `${rr.lo - s.reps} short`) : "planned"}</span>
                {s ? <button type="button" aria-label="Delete set" onClick={() => act.removeEntry(s.id)}>×</button> : <span />}
              </div>
            );
          })}
        </div>
      </div>}

      {addBox}
      {cardio && cardioOn && (
        <div className={`tile cardio${cardioRunning ? " running" : ""}`}>
          <span className="k">{cardio.startedAt ? `Cardio · started ${clock(cardio.startedAt)}` : "Then cardio"}</span>
          <b>{cardio.what}</b>
          {!allDone && setsLeft > 0 && <span className="s">{setsLeft} set{setsLeft === 1 ? "" : "s"} still planned — they're there after, or finish without them.</span>}
          {/* PLAN 130: Start runs a timer, so its minutes and the band's heart rate are known; Done straight away still works */}
          {cardio.done == null && cardio.startedAt != null && <output className="cardio-clock" aria-label="Cardio time">{fmt(Math.max(0, Math.floor((now - cardio.startedAt) / 1000)))}</output>}
          {cardio.done == null
            ? <div className={cardio.startedAt == null ? "grid3" : "grid2"}><button type="button" className="kbtn" onClick={() => setCardio(false)}>Skip</button>{cardio.startedAt == null && <button type="button" className="kbtn pri" onClick={() => startCardio()}>▶ Start</button>}<button type="button" className="go" onClick={() => setCardio(true)}>Done</button></div>
            : <p className="s">{cardio.done ? `✓ Done${cardio.startedAt != null && cardio.at ? ` · ${Math.round((cardio.at - cardio.startedAt) / 60_000)} min` : ""}` : "Skipped"} · <button type="button" className="linkb" onClick={() => setCardio()}>undo</button></p>}
        </div>
      )}
      {!cardioRunning && <div className={`tile rest ${rest > 0 ? "" : "idle"}`}>
        <div><span className="k">Rest</span><output>{rest > 0 ? fmt(rest) : "Go"}</output></div>
        <div className="bt">
          <button type="button" onClick={() => setRest(Math.max(0, rest - 30))}>−30s</button>
          <button type="button" onClick={() => setRest(rest + 30)}>+30s</button>
          <button type="button" onClick={() => setRest(0)}>Skip</button>
        </div>
      </div>}

      {/* the heart-rate tile is gone (owner, 14 Oct: "Can take out heartrate btw from workout screen") */}
      {!cardioRunning && <div className="tile" style={{ gap: 2 }}><span className="k">Volume</span><span className="big">{Math.round(vol).toLocaleString("en-GB")}<small>kg</small></span><span className="s">{lastSame ? `${Math.round((vol / lastSame) * 100)}% of last ${w.template}` : "first time on this split"}</span></div>}

      <div className="tile plan">
        <span className="k">Session</span>
        {plan.map((e, k) => (
          <div key={k} className={k === i ? "cur-ex" : ""}>
            <button type="button" onClick={() => setI(k)}>{e.name}</button>
            <span>{done(e.name).length}/{e.sets} · {repsLabel(e)} reps</span>
          </div>
        ))}
        {cardio && <div className="cardio-row"><span>Then: {cardio.what}</span>{cardio.done == null && !cardioOn
          ? <button type="button" className="kbtn sm" onClick={() => startCardio()}>Start now</button>
          : <span>{cardio.done ? "✓ done" : cardio.done === false ? "skipped" : cardio.startedAt ? `started ${clock(cardio.startedAt)}` : "after the sets"}</span>}</div>}
        {!cardio && (addingCardio
          ? <div className="addcardio">
              <div className="picks" aria-label="Cardio">{CARDIO.map((c) => <button type="button" key={c} onClick={() => startCardio(c)}>{c}</button>)}</div>
              <div className="grid2"><input value={cardioWhat} placeholder="Or type: 15 min bike…" aria-label="Cardio" onChange={(e) => setCardioWhat(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && cardioWhat.trim()) startCardio(cardioWhat.trim()); }} />
                <button type="button" className="kbtn pri" disabled={!cardioWhat.trim()} onClick={() => startCardio(cardioWhat.trim())}>Start</button></div>
              <button type="button" className="linkb" onClick={() => setAddingCardio(false)}>Cancel</button>
            </div>
          : <button type="button" className="kbtn" onClick={() => setAddingCardio(true)}>+ Cardio</button>)}
        {!adding && <button type="button" className="kbtn" onClick={() => { setAdding("add"); setNewEx(""); }}>+ Add exercise</button>}
      </div>
      {note}
      <button type="button" className="go alt" onClick={() => setFinishing(true)}>{doneN >= total ? "Finish workout…" : "Finish early…"}</button>
    </div>
  );
}

/** Two deliberate taps to finish: this summary, then "Finish". "Keep going" goes back. */
function FinishSheet({ w, onBack }: { w: Workout; onBack: () => void }) {
  const entries = useStore((s) => s.entries);
  const workouts = useStore((s) => s.workouts);
  const sets = useMemo(() => entries.filter((e): e is SetE => e.kind === "set"), [entries]);
  const [now] = useState(() => Date.now());
  const sum = sessionSummary(w, sets, workouts, now);
  return (
    <div className="cockpit">
      <div className="top"><h1>Finish?</h1><div className="meta">{w.template}</div></div>
      <div className="tile finish">
        <div className="fin-stats">
          <div><b>{sum.minutes}</b><span>min</span></div>
          <div><b>{sum.sets}</b><span>sets</span></div>
          <div><b>{Math.round(sum.volume).toLocaleString("en-GB")}</b><span>kg moved</span></div>
        </div>
        {sum.vsLast != null && <p className="s">{Math.round(sum.vsLast * 100)}% of last {w.template}'s volume.</p>}
        {sum.bests.length > 0 && <div className="fin-bests"><span className="k" style={{ color: "var(--gym)" }}>New bests</span>{sum.bests.map((b) => <p key={b.exercise}><b>{b.exercise}</b> {b.kg} kg × {b.reps} · est. 1RM {b.e1rm} kg</p>)}</div>}
        <label className="kfield">How did it feel?<textarea rows={2} value={w.note ?? ""} placeholder="Strong today, left shoulder a bit off…" onChange={(e) => act.updateWorkout(w.id, { note: e.target.value })} /></label>
      </div>
      <button type="button" className="go" onClick={() => act.endWorkout(w.id)}>Finish</button>
      <button type="button" className="kbtn" onClick={onBack}>Keep going</button>
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
