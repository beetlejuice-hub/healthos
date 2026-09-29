import { useEffect, useMemo, useState } from "react";
import { act, useStore } from "../lib/store";
import { suggestNext, volume, type Suggestion } from "../lib/training";
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

function Pick() {
  const templates = useStore((s) => s.templates);
  const workouts = useStore((s) => s.workouts);
  const entries = useStore((s) => s.entries);
  const sets = useMemo(() => entries.filter((e): e is SetE => e.kind === "set"), [entries]);
  const recent = [...workouts].filter((w) => w.endedAt).slice(-5).reverse();
  return (
    <div className="cockpit">
      <div className="top"><h1>Workout</h1></div>
      {templates.map((t) => {
        const last = [...workouts].reverse().find((w) => w.template === t.name && w.endedAt);
        const first = t.exercises[0], sug = first ? suggestNext(lastSets(sets, first.name), first.reps) : null;
        return (
          <div className="tile tpl" key={t.id}>
            <h2>{t.name}</h2>
            <p>{t.exercises.map((e) => e.name).join(" · ")}<br />{last ? `Last: ${dayLabel(last.startedAt)}` : "Not done yet"}{sug ? ` · ${first.name} ${sug.kg} kg × ${sug.reps}` : ""}</p>
            <button type="button" className="go" onClick={() => act.startWorkout(t.name)}>Start</button>
          </div>
        );
      })}
      {recent.length > 0 && (
        <div className="tile">
          <span className="k">Recent</span>
          <div className="plan">{recent.map((w) => { const ws = sets.filter((s) => s.workoutId === w.id); return <div key={w.id}><span>{w.template} · {dayLabel(w.startedAt)}</span><span>{ws.length} sets · {Math.round(volume(ws)).toLocaleString("en-GB")} kg</span></div>; })}</div>
        </div>
      )}
    </div>
  );
}

function Session({ w }: { w: Workout }) {
  const tpl = useStore((s) => s.templates.find((t) => t.name === w.template));
  const entries = useStore((s) => s.entries);
  const workouts = useStore((s) => s.workouts);
  const sets = useMemo(() => entries.filter((e): e is SetE => e.kind === "set"), [entries]);
  const plan: Template["exercises"] = tpl?.exercises ?? [];
  const done = (ex: string) => sets.filter((s) => s.workoutId === w.id && s.exercise === ex);
  const firstOpen = Math.max(0, plan.findIndex((e) => done(e.name).length < e.sets));
  const [i, setI] = useState(firstOpen === -1 ? 0 : firstOpen);
  const cur = plan[i];
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
    <div className="cockpit"><div className="tile"><p className="s">This workout has no exercises.</p><button type="button" className="go alt" onClick={() => act.endWorkout(w.id)}>End workout</button></div></div>
  );

  return (
    <div className="cockpit">
      <div className="top"><h1>{w.template}</h1><div className="meta"><b>{fmt(el)}</b>elapsed</div></div>
      <div className="prog">{Array.from({ length: total }, (_, k) => <i key={k} className={k < doneN ? "on" : ""} />)}</div>

      <div className="tile cur">
        <div className="ex"><b>{cur.name}</b><span>{exDone ? "Done" : `Set ${mine.length + 1} of ${cur.sets}`}</span></div>
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
        {exDone && i < plan.length - 1
          ? <button type="button" className="go" onClick={() => setI(i + 1)}>Next: {plan[i + 1].name}</button>
          : <button type="button" className="go" onClick={log}>Log set</button>}
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

      <div className="tile plan">
        <span className="k">Session</span>
        {plan.map((e, k) => (
          <div key={e.name} className={k === i ? "cur-ex" : ""}>
            <button type="button" onClick={() => setI(k)}>{e.name}</button>
            <span>{done(e.name).length}/{e.sets} · {e.reps} reps</span>
          </div>
        ))}
      </div>
      <button type="button" className="go alt" onClick={() => { act.endWorkout(w.id); }}>Finish workout</button>
    </div>
  );
}
