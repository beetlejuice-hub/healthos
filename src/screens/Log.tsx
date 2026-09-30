import { useEffect, useMemo, useRef, useState } from "react";
import { act, newId, offerUndo, useStore } from "../lib/store";
import { searchBasic } from "../lib/foods-basic";
import { SLOTS } from "../lib/types";
import { searchFood } from "../lib/off";
import { groupFoods, plausible, type ResultRow } from "../lib/foodgroup";
import { DRINKS } from "../lib/drinks";
import { forGrams } from "../lib/nutrition";
import { alcoholGrams } from "../lib/alcohol";
import { clock, localDay } from "../lib/time";
import { readRoute, go } from "../lib/nav";
import type { Drink, Entry, Food, Macros, Supplement } from "../lib/types";

type Tab = "food" | "drink" | "stack" | "body";
const TABS: [Tab, string][] = [["food", "Food"], ["drink", "Drink"], ["stack", "Stack"], ["body", "Body"]];

/** "HH:MM" today → epoch ms. Lets you log something you had earlier without a date picker. */
const timeToday = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); };
const nowHHMM = () => clock(Date.now());

export function Log() {
  const [tab, setTab] = useState<Tab>(() => { const s = readRoute()[1] as Tab | undefined; return s && TABS.some(([t]) => t === s) ? s : "food"; });
  // Every log offers itself back as "Undo" (the toast in App), so there's nothing else to show here.
  const setToast = (_: string) => { void _; };
  const pick = (t: Tab) => { setTab(t); go("log", t); };

  return (
    <div className="calm">
      <div className="head"><span>Log</span><a href="#today">Today</a></div>
      <div className="seg" role="group" aria-label="What to log">
        {TABS.map(([t, n]) => <button key={t} type="button" aria-pressed={tab === t} onClick={() => pick(t)}>{n}</button>)}
      </div>
      {tab === "food" && <FoodTab done={setToast} />}
      {tab === "drink" && <DrinkTab done={setToast} />}
      {tab === "stack" && <StackTab />}
      {tab === "body" && <BodyTab done={setToast} />}
      <TodayLog />
    </div>
  );
}

/* ------------------------------------------------------------------ food */

function FoodTab({ done }: { done: (m: string) => void }) {
  const saved = useStore((s) => s.foods);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Food | null>(null);
  const [custom, setCustom] = useState(false);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); setError(null); return; }
    const t = setTimeout(async () => {
      ctl.current?.abort(); ctl.current = new AbortController();
      setBusy(true); setError(null);
      try { setResults((await searchFood(q, ctl.current.signal)).foods); }
      catch (e) { if ((e as Error).name !== "AbortError") setError("Couldn't reach the food database. Your saved foods still work, or add it yourself."); }
      finally { setBusy(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const mine = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (needle ? saved.filter((f) => `${f.name} ${f.brand ?? ""}`.toLowerCase().includes(needle)) : saved).slice(0, needle ? 8 : 12);
  }, [q, saved]);
  // Built-in everyday foods: instant and offline, shown before the database answers.
  const basic = useMemo(() => searchBasic(q).filter((f) => !mine.some((m) => m.id === f.id)), [q, mine]);
  // Near-identical products collapse into one "typical" row; see lib/foodgroup.ts.
  const rows = useMemo(() => groupFoods(results, q), [results, q]);
  // "Show all" applies to the search it was pressed on; a new search starts short again.
  const [allFor, setAllFor] = useState<string | null>(null);
  const showAll = allFor === q;
  const setShowAll = () => setAllFor(q);

  if (chosen) return <Portion food={chosen} onCancel={() => setChosen(null)} onDone={(m) => { setChosen(null); setQ(""); done(m); }} />;
  if (custom) return <CustomFood onCancel={() => setCustom(false)} onDone={(f) => { setCustom(false); setChosen(f); }} />;

  return (
    <div className="card">
      <input className="search" type="search" inputMode="search" placeholder="Search food: zabpehely, chicken breast…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search food" />
      {mine.length > 0 && <>
        <h3>{q ? "Your foods" : "Recent"}</h3>
        <div className="list">{mine.map((f) => <FoodRow key={f.id} f={f} onPick={() => setChosen(f)} />)}</div>
      </>}
      {basic.length > 0 && <>
        <h3>Everyday foods <span>typical values</span></h3>
        <div className="list">{basic.map((f) => <FoodRow key={f.id} f={f} onPick={() => setChosen(f)} />)}</div>
      </>}
      {q.trim().length >= 2 && <>
        <h3>Food database <span>{busy ? "searching…" : `${results.length} products`}</span></h3>
        {error && <p className="err">{error}</p>}
        <div className="list">
          {(showAll ? rows : rows.slice(0, 8)).map((r) => r.kind === "one"
            ? <FoodRow key={r.food.id} f={r.food} suspect={r.suspect} thumb onPick={() => setChosen(r.food)} />
            : <GroupRow key={r.key} r={r} onPick={setChosen} />)}
        </div>
        {!showAll && rows.length > 8 && <button type="button" className="pill-btn" onClick={setShowAll}>Show all {rows.length}</button>}
      </>}
      <button type="button" className="pill-btn" onClick={() => setCustom(true)}>+ Add your own food</button>
      <p className="note">Everyday foods are built in; the database is Open Food Facts (3M+ products) and USDA. The same food from many brands shows as one typical row (the median); tap “products” to pick your brand. Anything you log — and any values you correct — shows up first next time.</p>
    </div>
  );
}

/** Where a food's numbers come from: "Colavita", "typical of 12", "USDA reference", "your values". */
const origin = (f: Food) => [
  f.source === "typical" ? `typical of ${f.basis}` : f.source === "usda" ? "USDA reference" : f.brand,
  f.edited ? "your values" : "",
].filter(Boolean).join(" · ");
const sub = (f: Food) => [origin(f), `${Math.round(f.per100.kcal)} kcal · P ${Math.round(f.per100.p)} / 100 g`].filter(Boolean).join(" · ");

function Thumb({ src, label }: { src?: string; label?: string }) {
  const [broken, setBroken] = useState(false);
  return <span className="thumb" aria-hidden="true">{src && !broken ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : label}</span>;
}

function FoodRow({ f, onPick, thumb, suspect }: { f: Food; onPick: () => void; thumb?: boolean; suspect?: boolean }) {
  return (
    <div className={`li tap${thumb ? " food" : ""}`} role="button" tabIndex={0} onClick={onPick} onKeyDown={(e) => e.key === "Enter" && onPick()}>
      {thumb && <Thumb src={f.img} label={f.source === "usda" ? "USDA" : ""} />}
      <span>{f.name}<small>{sub(f)}</small>{suspect && <small className="warn">label doesn't add up — check before logging</small>}</span>
      <span className="r">+</span>
    </div>
  );
}

/** One food, many brands: tap the row for the typical values, or open the brands. */
function GroupRow({ r, onPick }: { r: Extract<ResultRow, { kind: "group" }>; onPick: (f: Food) => void }) {
  const [open, setOpen] = useState(false);
  const [lo, hi] = r.kcalRange;
  return <>
    <div className="li tap food" role="button" tabIndex={0} onClick={() => onPick(r.typical)} onKeyDown={(e) => e.key === "Enter" && onPick(r.typical)}>
      <Thumb label={`×${r.items.length}`} />
      <span>{r.typical.name}<small>typical · {r.typical.per100.kcal} kcal · P {Math.round(r.typical.per100.p)} / 100 g{hi > lo ? ` · brands ${lo}–${hi}` : ""}</small>
        {r.varies && <small className="warn">brands differ a lot (dry vs cooked?) — pick yours</small>}</span>
      <button type="button" className="more" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>{r.items.length} products {open ? "▴" : "▾"}</button>
    </div>
    {open && <div className="sublist">{[...r.items].sort((a, b) => Number(plausible(b.per100)) - Number(plausible(a.per100))).map((f) =>
      <FoodRow key={f.id} f={f} thumb suspect={!plausible(f.per100)} onPick={() => onPick(f)} />)}</div>}
  </>;
}

const MACRO_FIELDS: [keyof Macros, string][] = [["kcal", "kcal"], ["p", "Protein"], ["c", "Carbs"], ["f", "Fat"]];
const numIn = (v: string) => Number(v.replace(",", "."));

function Portion({ food, onCancel, onDone }: { food: Food; onCancel: () => void; onDone: (m: string) => void }) {
  const [grams, setGrams] = useState(String(food.servingG ?? 100));
  const [time, setTime] = useState(nowHHMM);
  // Values per 100 g, editable: a database label can be wrong, or your version differs.
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState(() => Object.fromEntries(MACRO_FIELDS.map(([k]) => [k, String(Math.round(food.per100[k] * 10) / 10)])) as Record<keyof Macros, string>);
  const per100: Macros = editing ? { kcal: numIn(vals.kcal) || 0, p: numIn(vals.p) || 0, c: numIn(vals.c) || 0, f: numIn(vals.f) || 0 } : food.per100;
  const changed = editing && MACRO_FIELDS.some(([k]) => Math.abs(per100[k] - food.per100[k]) > 0.05);
  const g = Number(grams) || 0, m = forGrams(per100, g);
  const save = () => {
    if (g <= 0) return;
    const used: Food = changed ? { ...food, per100, edited: true } : food;
    const e = act.addEntry({ kind: "food", at: timeToday(time), foodId: used.id, name: used.name, grams: g, macros: m });
    act.rememberFood(used);
    offerUndo([e.id], `Logged ${used.name}`);
    onDone(`Logged ${used.name}`);
  };
  return (
    <div className="card">
      <div className="portion-head">
        {food.img && <Thumb src={food.img} />}
        <h3>{food.name} <span>{origin(food)}</span></h3>
      </div>
      <div className="row2">
        <label className="field">Grams<input inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} /></label>
        <label className="field">Time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      {food.servingG && <div className="row2">{[0.5, 1, 1.5, 2].map((k) => <button key={k} type="button" className="pill-btn" onClick={() => setGrams(String(Math.round(food.servingG! * k)))}>{k} serving{k === 1 ? "" : "s"}</button>).slice(0, 4)}</div>}
      {editing ? <>
        <h3>Values <span>per 100 g, as on the label</span></h3>
        <div className="row4">
          {MACRO_FIELDS.map(([k, label]) => <label key={k} className="field">{label}<input inputMode="decimal" value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} /></label>)}
        </div>
        <p className="note">{changed ? "Your values are saved with this food and used next time." : "Change any number; the totals below follow."}</p>
      </> : null}
      <div className="row4 num" style={{ fontSize: 13 }}>
        <span><b>{Math.round(m.kcal)}</b> kcal</span><span>P <b>{Math.round(m.p)}</b></span><span>C <b>{Math.round(m.c)}</b></span><span>F <b>{Math.round(m.f)}</b></span>
      </div>
      <div className="row2">
        <button type="button" className="pill-btn" onClick={onCancel}>Back</button>
        <button type="button" className="pill-btn pri" disabled={g <= 0 || per100.kcal < 0} onClick={save}>Log it</button>
      </div>
      {!editing && <button type="button" className="linkish" onClick={() => setEditing(true)}>Edit values</button>}
    </div>
  );
}

/** Your own food: per 100 g, or just "about 900 kcal" for a restaurant meal. */
function CustomFood({ onCancel, onDone }: { onCancel: () => void; onDone: (f: Food) => void }) {
  const [name, setName] = useState(""), [kcal, setKcal] = useState(""), [p, setP] = useState(""), [c, setC] = useState(""), [f, setF] = useState(""), [serving, setServing] = useState("100");
  const n = (v: string) => Number(v.replace(",", ".")) || 0;
  const s = n(serving) || 100;
  const ok = name.trim() && n(kcal) > 0;
  return (
    <div className="card">
      <h3>Add your own food <span>values for one portion</span></h3>
      <label className="field">Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Restaurant burger, grandma's pörkölt…" /></label>
      <label className="field">Portion size (g)<input inputMode="decimal" value={serving} onChange={(e) => setServing(e.target.value)} /></label>
      <div className="row4">
        <label className="field">kcal<input inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} /></label>
        <label className="field">Protein<input inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} /></label>
        <label className="field">Carbs<input inputMode="decimal" value={c} onChange={(e) => setC(e.target.value)} /></label>
        <label className="field">Fat<input inputMode="decimal" value={f} onChange={(e) => setF(e.target.value)} /></label>
      </div>
      <p className="note">Only calories are required. It's saved to your foods.</p>
      <div className="row2">
        <button type="button" className="pill-btn" onClick={onCancel}>Back</button>
        <button type="button" className="pill-btn pri" disabled={!ok} onClick={() => onDone({ id: `custom:${newId()}`, name: name.trim(), source: "custom", servingG: s, per100: { kcal: (n(kcal) / s) * 100, p: (n(p) / s) * 100, c: (n(c) / s) * 100, f: (n(f) / s) * 100 } })}>Next</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ drink */

function DrinkTab({ done }: { done: (m: string) => void }) {
  const custom = useStore((s) => s.drinks);
  const [time, setTime] = useState(nowHHMM);
  const [making, setMaking] = useState(false);
  const log = (d: Drink) => {
    const e = act.addEntry({ kind: "drink", at: timeToday(time), drinkId: d.id, name: d.name, ml: d.ml, caffeineMg: d.caffeineMg, alcoholG: d.alcoholG, kcal: d.kcal });
    offerUndo([e.id], `Logged ${d.name}`);
    done(`Logged ${d.name}`);
  };
  if (making) return <CustomDrink onCancel={() => setMaking(false)} onDone={(d) => { act.saveDrink(d); setMaking(false); log(d); }} />;
  return (
    <div className="card">
      <label className="field">Time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      <div className="drinks">
        {[...custom, ...DRINKS].map((d) => (
          <button key={d.id} type="button" onClick={() => log(d)}>
            <b>{d.name}</b>
            <span>{[d.caffeineMg ? `${d.caffeineMg} mg caffeine` : "", d.alcoholG ? `${d.alcoholG} g alcohol` : "", d.kcal > 5 ? `${d.kcal} kcal` : ""].filter(Boolean).join(" · ") || "no caffeine"}</span>
          </button>
        ))}
      </div>
      <button type="button" className="pill-btn" onClick={() => setMaking(true)}>+ Your own drink</button>
      <p className="note">One tap logs it at the time above. Values are typical label numbers.</p>
    </div>
  );
}

function CustomDrink({ onCancel, onDone }: { onCancel: () => void; onDone: (d: Drink) => void }) {
  const [name, setName] = useState(""), [ml, setMl] = useState("250"), [caf, setCaf] = useState("0"), [abv, setAbv] = useState("0"), [kcal, setKcal] = useState("0");
  const n = (v: string) => Number(v.replace(",", ".")) || 0;
  return (
    <div className="card">
      <h3>Your own drink</h3>
      <label className="field">Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Office coffee, Hell energy…" /></label>
      <div className="row4">
        <label className="field">ml<input inputMode="decimal" value={ml} onChange={(e) => setMl(e.target.value)} /></label>
        <label className="field">Caffeine mg<input inputMode="decimal" value={caf} onChange={(e) => setCaf(e.target.value)} /></label>
        <label className="field">Alcohol %<input inputMode="decimal" value={abv} onChange={(e) => setAbv(e.target.value)} /></label>
        <label className="field">kcal<input inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} /></label>
      </div>
      <div className="row2">
        <button type="button" className="pill-btn" onClick={onCancel}>Back</button>
        <button type="button" className="pill-btn pri" disabled={!name.trim()} onClick={() => onDone({ id: `drink:${newId()}`, name: name.trim(), ml: n(ml), caffeineMg: n(caf), alcoholG: Math.round(alcoholGrams(n(ml), n(abv)) * 10) / 10, kcal: n(kcal) })}>Save and log</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ stack */

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function StackTab() {
  const list = useStore((s) => s.supplements);
  const upd = (id: string, patch: Partial<Supplement>) => act.setSupplements(list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  return (
    <div className="card">
      <h3>Your stack <span>ticked daily on Today</span></h3>
      {list.map((s) => (
        <div key={s.id} style={{ display: "grid", gap: 6, paddingBottom: 8, borderBottom: "1px solid #ffffff0d" }}>
          <div className="row2">
            <label className="field">Name<input value={s.name} onChange={(e) => upd(s.id, { name: e.target.value })} /></label>
            <label className="field">Dose<input value={s.dose} onChange={(e) => upd(s.id, { dose: e.target.value })} /></label>
          </div>
          <div className="row2">
            <label className="field">When<select value={s.slot} onChange={(e) => upd(s.id, { slot: e.target.value as Supplement["slot"] })}>{SLOTS.map((x) => <option key={x.id} value={x.id}>{x.name} · {hhmm(x.at)}</option>)}</select></label>
            <div style={{ display: "flex", gap: 6, alignItems: "end" }}>
              <button type="button" className="pill-btn" onClick={() => upd(s.id, { active: !s.active })}>{s.active ? "Pause" : "Resume"}</button>
              <button type="button" className="pill-btn" onClick={() => act.setSupplements(list.filter((x) => x.id !== s.id))}>Remove</button>
            </div>
          </div>
          {!s.active && <p className="note">Paused: not shown on Today. Pausing on purpose for a few weeks is how Insights can tell whether it does anything.</p>}
        </div>
      ))}
      <button type="button" className="pill-btn" onClick={() => act.setSupplements([...list, { id: newId(), name: "New supplement", dose: "", slot: "morning", at: 8 * 60, active: true }])}>+ Add supplement</button>
    </div>
  );
}

/* ------------------------------------------------------------------ body */

function BodyTab({ done }: { done: (m: string) => void }) {
  const entries = useStore((s) => s.entries);
  const weights = entries.filter((e) => e.kind === "weight").slice(-7).reverse();
  const [kg, setKg] = useState(weights[0]?.kind === "weight" ? String(weights[0].kg) : "");
  const n = Number(kg.replace(",", "."));
  return (
    <div className="card">
      <h3>Weight <span>morning, before food, is most comparable</span></h3>
      <div className="row2">
        <label className="field">kg<input inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} /></label>
        <div style={{ display: "flex", alignItems: "end" }}>
          <button type="button" className="pill-btn pri" disabled={!(n > 20 && n < 400)} onClick={() => { const e = act.addEntry({ kind: "weight", at: Date.now(), kg: Math.round(n * 10) / 10 }); offerUndo([e.id], `Logged ${n} kg`); done(`Logged ${n} kg`); }}>Log weight</button>
        </div>
      </div>
      <div className="list">{weights.map((w) => w.kind === "weight" && <div className="li" key={w.id}><span>{w.kg} kg<small>{localDay(w.at)} {clock(w.at)}</small></span><button type="button" className="x" aria-label="Delete" onClick={() => act.removeEntry(w.id)}>×</button></div>)}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ today's log */

const describe = (e: Entry, supps: Supplement[]): [string, string] => {
  switch (e.kind) {
    case "food": return [e.name, `${Math.round(e.macros.kcal)} kcal · P ${Math.round(e.macros.p)}${e.grams ? ` · ${e.grams} g` : ""}`];
    case "drink": return [e.name, [e.caffeineMg ? `${e.caffeineMg} mg caffeine` : "", e.alcoholG ? `${e.alcoholG} g alcohol` : "", e.kcal > 5 ? `${e.kcal} kcal` : ""].filter(Boolean).join(" · ")];
    case "supp": return [supps.find((s) => s.id === e.suppId)?.name ?? "Supplement", e.status];
    case "set": return [e.exercise, `${e.kg} kg × ${e.reps}`];
    case "weight": return ["Weight", `${e.kg} kg`];
    case "feel": return ["Feeling", `energy ${e.energy ?? "–"} · mood ${e.mood ?? "–"} · focus ${e.focus ?? "–"}`];
  }
};

function TodayLog() {
  const entries = useStore((s) => s.entries);
  const supps = useStore((s) => s.supplements);
  const today = localDay(Date.now());
  const list = entries.filter((e) => localDay(e.at) === today && e.kind !== "set").reverse();
  return (
    <div className="card">
      <h3>Logged today <span>{list.length}</span></h3>
      {list.length === 0 && <p className="note">Nothing yet.</p>}
      <div className="list">
        {list.map((e) => { const [a, b] = describe(e, supps); return (
          <div className="li" key={e.id}>
            <span>{a}<small>{clock(e.at)} · {b}</small></span>
            <button type="button" className="x" aria-label={`Delete ${a}`} onClick={() => act.removeEntry(e.id)}>×</button>
          </div>
        ); })}
      </div>
    </div>
  );
}
