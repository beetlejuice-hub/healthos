import { useEffect, useMemo, useRef, useState } from "react";
import { act, newId, offerUndo, useStore } from "../lib/store";
import { searchBasic } from "../lib/foods-basic";
import { SLOTS } from "../lib/types";
import { searchFood } from "../lib/off";
import { groupFoods, plausible, type ResultRow } from "../lib/foodgroup";
import { StackBadge, useStackCheck } from "../components/StackCheck";
import { SuppResearch, researchSupplement } from "../components/Ai";
import { askAi, shrinkImage, useAiStatus } from "../lib/ai/client";
import { fromDescribed } from "../lib/ai/apply";
import { DRINKS } from "../lib/drinks";
import { forGrams } from "../lib/nutrition";
import { alcoholGrams } from "../lib/alcohol";
import { addDays, clock, localDay } from "../lib/time";
import { readRoute, go } from "../lib/nav";
import { bodyDays, weightTrend } from "../lib/tdee";
import { LineChart } from "../components/Charts";
import type { Drink, Entry, EntryOf, Food, Macros, Supplement } from "../lib/types";
import { amountText, approx, countText, gramsOf, macrosOfLine, mealFood, step, unitsOf, type Line } from "../lib/units";
import { extractTime, matchDrink, parseMeal, readAmount, tokens, type DrinkLine } from "../lib/quickadd";
import { fromDatabase } from "../lib/fillin";
import { caffeinePer100, drinkFromFood, sizesFor } from "../lib/drinkdb";

const fold = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/** A drink matches what you typed by its name or any other name it goes by ("sprite" → soft drink). */
const drinkMatch = (d: Drink, needle: string) => { const n = fold(needle.trim()); return !n || fold(`${d.name} ${d.aka ?? ""}`).includes(n); };

type Tab = "food" | "drink" | "stack" | "body";
const TABS: [Tab, string][] = [["food", "Food"], ["drink", "Drink"], ["stack", "Stack"], ["body", "Body"]];

/** "HH:MM" today → epoch ms. Lets you log something you had earlier without a date picker. */
const timeToday = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); };
const nowHHMM = () => clock(Date.now());
const hhmmOf = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** Logging for earlier is one tap: "1 h ago" instead of fiddling with a clock. */
function WhenChips({ time, setTime }: { time: string; setTime: (t: string) => void }) {
  const ago = (min: number) => clock(Date.now() - min * 60_000);
  const opts: [string, string][] = [["Now", ago(0)], ["30 min ago", ago(30)], ["1 h ago", ago(60)], ["2 h ago", ago(120)], ["3 h ago", ago(180)]];
  return (
    <div className="when">
      <label className="field">When<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      <div className="chips">{opts.map(([n, t]) => <button key={n} type="button" className={`pill-btn${time === t ? " pri" : ""}`} onClick={() => setTime(t)}>{n}</button>)}</div>
    </div>
  );
}

export function Log() {
  const [tab, setTab] = useState<Tab>(() => { const s = readRoute()[1] as Tab | undefined; return s && TABS.some(([t]) => t === s) ? s : "food"; });
  // Every log offers itself back as "Undo" (the toast in App), so there's nothing else to show here.
  const setToast = (_: string) => { void _; };
  const pick = (t: Tab) => { setTab(t); go("log", t); };
  // Follow links to another tab while already on Log (#log/drink → #log/stack).
  useEffect(() => {
    const on = () => { const sub = readRoute()[1] as Tab | undefined; if (sub && TABS.some(([t]) => t === sub)) setTab(sub); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

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

/* ------------------------------------------------------------------ the AI, for what the parser and the database don't know */

/**
 * Ask the AI what a description or photo is; every item comes back saved as your own food or drink
 * (marked "AI estimate"), so typing the same words next time is free. One item → it also
 * remembers exactly what you typed.
 */
async function aiDescribe(text: string | undefined, image?: File): Promise<{ items: Item[]; drinks: Drink[]; message?: string }> {
  const img = image ? await shrinkImage(image) : undefined;
  const r = await askAi({ task: "describe", ...(text ? { text } : {}), ...(img ? { image: img } : {}) });
  if (!r.ok) return { items: [], drinks: [], message: r.message };
  const items: Item[] = [], drinks: Drink[] = [];
  for (const it of r.answer.items) {
    const made = fromDescribed(it, `${it.kind === "drink" ? "drink" : "custom"}:ai-${newId()}`, r.answer.items.length === 1 ? text : undefined);
    if ("food" in made) { act.rememberFood(made.food); items.push({ ...made.line, est: `AI estimate${it.note ? ` · ${it.note}` : ""}` }); }
    else { act.saveDrink(made.drink); drinks.push(made.drink); items.push(made.line); }
  }
  const dropped = r.answer.dropped.length ? `Left out ${r.answer.dropped.join(", ")} — the numbers didn't add up.` : undefined;
  return { items, drinks, message: dropped };
}

/** The camera / photo button: iPhone offers "Take photo" or the library. */
function PhotoButton({ onPick, label = "📷 Photo", disabled }: { onPick: (f: File) => void; label?: string; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement | null>(null);
  return <>
    <button type="button" className="pill-btn" disabled={disabled} onClick={() => ref.current?.click()}>{label}</button>
    <input ref={ref} type="file" accept="image/*" hidden aria-label="Photo of food or drink" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }} />
  </>;
}

/* ------------------------------------------------------------------ food */

/** The basket survives a reload or a tab switch until it's logged (this device only). */
const BASKET_KEY = "healthos.basket";
/** `est`: how a line was estimated, shown under it ("median of 12 products", "AI estimate"). */
type Item = (Line & { alts?: Food[]; est?: string }) | DrinkLine;
const isDrink = (x: Item): x is DrinkLine => "drink" in x;
const loadBasket = (): Item[] => { try { return JSON.parse(localStorage.getItem(BASKET_KEY) ?? "[]") as Item[]; } catch { return []; } };

/**
 * Food, the simple way (owner: "type scrambled eggs, choose it, add 2 eggs, add toast, an apple,
 * and that's it"): everything you pick or type lands in a meal basket, counted in eggs, slices,
 * apples; one tap logs the lot. Grams and exact values are one tap deeper for when they matter.
 */
function FoodTab({ done }: { done: (m: string) => void }) {
  const saved = useStore((s) => s.foods);
  const entries = useStore((s) => s.entries);
  const [q, setQ] = useState("");
  const [typed, setTyped] = useState("");
  const [missed, setMissed] = useState<string[]>([]);
  const [results, setResults] = useState<Food[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drinksMine = useStore((s) => s.drinks);
  const [basket, setBasketRaw] = useState<Item[]>(loadBasket);
  const setBasket = (b: Item[]) => { setBasketRaw(b); try { localStorage.setItem(BASKET_KEY, JSON.stringify(b.map((x) => (isDrink(x) ? x : (({ alts, ...l }) => { void alts; return l; })(x))))); } catch { /* private mode */ } };
  const [detail, setDetail] = useState<number | null>(null);
  const [custom, setCustom] = useState(false);
  const [time, setTime] = useState(nowHHMM);
  const [crafting, setCrafting] = useState(false);
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
  const basic = useMemo(() => searchBasic(q).filter((f) => !mine.some((m) => m.id === f.id)), [q, mine]);
  // Drinks are searchable here too: by name, or by what people call them ("kávé", "beer").
  const drinkHits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    const all = [...drinksMine, ...DRINKS];
    const byWord = matchDrink(needle.normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/), drinksMine);
    return all.filter((d) => drinkMatch(d, needle) || d === byWord).slice(0, 6);
  }, [q, drinksMine]);
  const rows = useMemo(() => groupFoods(results, q), [results, q]);
  const [allFor, setAllFor] = useState<string | null>(null);
  const showAll = allFor === q;
  const setShowAll = () => setAllFor(q);

  /** How you usually have a food: the amount you logged it with last time, else its first unit. */
  const usual = (f: Food): Line => {
    const last = [...entries].reverse().find((e): e is EntryOf<"food"> => e.kind === "food" && e.foodId === f.id);
    const units = unitsOf(f);
    if (last?.unit && units.some((u) => u.name === last.unit)) return { food: f, count: last.count ?? 1, unit: last.unit };
    if (units.length) return { food: f, count: 1, unit: units[0].name };
    return { food: f, count: 1, unit: null, grams: last?.grams ?? 100 };
  };
  const add = (f: Food) => { setBasket([...basket, usual(f)]); setQ(""); };
  const [looking, setLooking] = useState(false);
  const [asking, setAsking] = useState<string[]>([]);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const { on: aiOn } = useAiStatus();
  const addTyped = async () => {
    // "coffee at 11" → the whole meal is logged for 11:00.
    const { text, minute } = extractTime(typed);
    if (minute != null) setTime(hhmmOf(minute));
    const parsed = parseMeal(text, saved, drinksMine);
    const found = parsed.flatMap((p): Item[] => (p.drink ? [p.drink] : p.line ? [{ ...p.line, alts: p.unsure ? p.alternatives : undefined }] : []));
    const missing = parsed.filter((p) => !p.line && !p.drink).map((p) => p.text);
    setBasket([...basket, ...found]);
    setTyped("");
    setMissed(missing);
    if (!missing.length) return;
    // Not one of yours or the everyday foods: the food database's median, marked as an estimate.
    setLooking(true);
    const fromDb = await Promise.all(missing.map(async (m) => {
      try { return fromDatabase(m, (await searchFood(readAmount(tokens(m)).words.join(" "))).foods); } catch { return null; }
    }));
    setLooking(false);
    const extra: Item[] = fromDb.flatMap((e) => (e ? [{ ...e.line, est: `${e.basis > 1 ? `median of ${e.basis} products` : "1 product"} · ${e.how}` }] : []));
    setBasketRaw((b) => { const next = [...b, ...extra]; try { localStorage.setItem(BASKET_KEY, JSON.stringify(next.map((x) => (isDrink(x) ? x : (({ alts, ...l }) => { void alts; return l; })(x))))); } catch { /* private mode */ } return next; });
    const still = missing.filter((_, i) => !fromDb[i]);
    setMissed(still);
    if (!still.length || !aiOn) return;
    // Neither yours, the everyday foods, nor the database: the AI, once — saved, so it's free next time.
    setAsking(still);
    const got = await Promise.all(still.map((m) => aiDescribe(m)));
    setAsking([]);
    setBasketRaw((b) => { const next = [...b, ...got.flatMap((g) => g.items)]; try { localStorage.setItem(BASKET_KEY, JSON.stringify(next.map((x) => (isDrink(x) ? x : (({ alts, ...l }) => { void alts; return l; })(x))))); } catch { /* private mode */ } return next; });
    setMissed(still.filter((_, i) => !got[i].items.length));
    setAiNote(got.map((g) => g.message).filter(Boolean).join(" ") || null);
  };
  const photo = async (f: File) => {
    setAsking(["your photo"]); setAiNote(null);
    const g = await aiDescribe(typed.trim() || undefined, f);
    setAsking([]);
    setBasket([...basket, ...g.items]);
    setTyped("");
    setAiNote(g.message ?? (g.items.length ? null : "The AI couldn't make out food in that photo."));
  };
  const upd = (i: number, l: Item) => setBasket(basket.map((x, j) => (j === i ? l : x)));
  const opened = detail != null ? basket[detail] : undefined;

  if (detail != null && opened && !isDrink(opened)) return <Portion line={opened} onCancel={() => setDetail(null)} onDone={(l) => { upd(detail, l); setDetail(null); }} />;
  if (custom) return <CustomFood onCancel={() => setCustom(false)} onDone={(f) => { setCustom(false); act.rememberFood(f); add(f); }} />;

  return <>
    <div className="card">
      <label className="field">What did you eat?
        <div className="row-add">
          <input value={typed} placeholder="2 scrambled eggs, toast, an apple, coffee" onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && typed.trim()) addTyped(); }} aria-label="Type what you ate" />
          <button type="button" className="pill-btn" disabled={!typed.trim()} onClick={addTyped}>Add</button>
          {aiOn && <PhotoButton onPick={(f) => void photo(f)} disabled={asking.length > 0} />}
        </div>
      </label>
      {asking.length > 0 && <p className="note">Asking the AI about {asking.map((m) => `“${m}”`).join(", ")}… it's saved after, so next time it's instant.</p>}
      {aiNote && <p className="err">{aiNote}</p>}
      {looking && <p className="note">Looking up {missed.map((m) => `“${m}”`).join(", ")} in the food database…</p>}
      {!looking && !asking.length && missed.length > 0 && <p className="err">Couldn't find {missed.map((m) => `“${m}”`).join(", ")} — search it below or add it yourself.</p>}
      {crafting && <p className="note">Making your own food: type what's in it, roughly — “200 g chicken, 1 bowl rice, 1 tbsp oil, salad” — then <b>Save as a meal</b> and say how many portions it makes.</p>}
      {basket.length > 0 && <Basket lines={basket} time={time} setTime={setTime} crafting={crafting} onChange={setBasket} onDetail={setDetail} onLogged={(m) => { setBasket([]); setMissed([]); setCrafting(false); done(m); }} />}
    </div>
    <div className="card">
      <input className="search" type="search" inputMode="search" placeholder="Or search: zabpehely, chicken breast…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search food" />
      {mine.length > 0 && <>
        <h3>{q ? "Your foods" : "Recent"} <span>tap to add</span></h3>
        <div className="list">{mine.map((f) => <FoodRow key={f.id} f={f} amount={amountOf(usual(f))} onPick={() => add(f)} />)}</div>
      </>}
      {basic.length > 0 && <>
        <h3>Everyday foods <span>typical values</span></h3>
        <div className="list">{basic.map((f) => <FoodRow key={f.id} f={f} amount={amountOf(usual(f))} onPick={() => add(f)} />)}</div>
      </>}
      {q.trim().length >= 2 && <>
        <h3>Food database <span>{busy ? "searching…" : `${results.length} products`}</span></h3>
        {error && <p className="err">{error}</p>}
        <div className="list">
          {(showAll ? rows : rows.slice(0, 8)).map((r) => r.kind === "one"
            ? <FoodRow key={r.food.id} f={r.food} suspect={r.suspect} thumb onPick={() => add(r.food)} />
            : <GroupRow key={r.key} r={r} onPick={add} />)}
        </div>
        {!showAll && rows.length > 8 && <button type="button" className="pill-btn" onClick={setShowAll}>Show all {rows.length}</button>}
      </>}
      {drinkHits.length > 0 && <>
        <h3>Drinks <span>caffeine and alcohol count</span></h3>
        <div className="list">{drinkHits.map((d) => <div key={d.id} className="li tap" role="button" tabIndex={0} onClick={() => { setBasket([...basket, { drink: d, count: 1 }]); setQ(""); }} onKeyDown={(e) => e.key === "Enter" && setBasket([...basket, { drink: d, count: 1 }])}>
          <span>{d.name}<small>{[d.caffeineMg ? `${d.caffeineMg} mg caffeine` : "", d.alcoholG ? `${d.alcoholG} g alcohol` : "", d.kcal > 5 ? `${d.kcal} kcal` : ""].filter(Boolean).join(" · ") || "drink"}</small></span><span className="r">+</span></div>)}</div>
      </>}
      <div className="row2">
        <button type="button" className="pill-btn" onClick={() => { setCrafting(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>+ Make your own food</button>
        <button type="button" className="pill-btn" onClick={() => setCustom(true)}>+ Enter label values</button>
      </div>
      <p className="note">Count it, don't weigh it: “2 eggs” is close enough, and the weekly numbers even out. The same food from many brands shows as one typical row; anything you log comes back first, with the amount you had.</p>
    </div>
  </>;
}

const amountOf = (l: Line) => (l.unit ? amountText(l.count, l.unit) : `${Math.round(l.grams ?? 100)} g`);

/** The meal being built: − / + per line, ≈ totals, one tap to log, or save it as a meal. */
function Basket({ lines, time, setTime, crafting, onChange, onDetail, onLogged }: { lines: Item[]; time: string; setTime: (t: string) => void; crafting: boolean; onChange: (l: Item[]) => void; onDetail: (i: number) => void; onLogged: (m: string) => void }) {
  const [saving, setSaving] = useState(false);
  const [mealName, setMealName] = useState(""), [pieces, setPieces] = useState("1");
  const tot = lines.reduce((a, l) => { if (isDrink(l)) return { kcal: a.kcal + l.drink.kcal * l.count, p: a.p }; const m = macrosOfLine(l); return { kcal: a.kcal + m.kcal, p: a.p + m.p }; }, { kcal: 0, p: 0 });
  const foods = lines.filter((l): l is Line & { alts?: Food[] } => !isDrink(l));
  const set = (i: number, l: Item) => onChange(lines.map((x, j) => (j === i ? l : x)));
  const log = () => {
    const at = timeToday(time);
    const ids = lines.map((l) => {
      if (isDrink(l)) {
        const k = l.count, d = l.drink;
        const g = (v?: number) => (v ? Math.round(v * k * 10) / 10 : undefined);
        return act.addEntry({ kind: "drink", at, drinkId: d.id, name: k === 1 ? d.name : `${countText(k)} × ${d.name}`, ml: d.ml * k, caffeineMg: Math.round(d.caffeineMg * k), alcoholG: Math.round(d.alcoholG * k * 10) / 10, kcal: Math.round(d.kcal * k), p: g(d.p), c: g(d.c), f: g(d.f) }).id;
      }
      act.rememberFood(l.food);
      return act.addEntry({ kind: "food", at, foodId: l.food.id, name: l.food.name, grams: gramsOf(l), macros: macrosOfLine(l), ...(l.unit ? { count: l.count, unit: l.unit } : {}) }).id;
    });
    const one = lines[0];
    const label = lines.length === 1 ? (isDrink(one) ? `${countText(one.count)} × ${one.drink.name}` : `${amountOf(one)} ${one.food.name}`) : `${lines.length} ${lines.some(isDrink) ? "items" : "foods"}, ≈${approx(tot.kcal)} kcal`;
    offerUndo(ids, `Logged ${label}`);
    onLogged(`Logged ${label}`);
  };
  const saveMeal = () => {
    const n = Math.max(1, Number(pieces) || 1);
    const f = mealFood(`custom:${newId()}`, mealName.trim(), foods, n);
    act.rememberFood(f);
    onChange([{ food: f, count: n, unit: "piece" }, ...lines.filter(isDrink)]);
    setSaving(false); setMealName("");
  };
  return (
    <div className="basket">
      <h3>This meal <span>≈ {approx(tot.kcal)} kcal · P {Math.round(tot.p)}</span></h3>
      {lines.map((l, i) => {
        if (isDrink(l)) return (
          <div className="bline" key={i}>
            <span className="bname">{l.drink.name}<small>{[l.drink.caffeineMg ? `${Math.round(l.drink.caffeineMg * l.count)} mg caffeine` : "", l.drink.alcoholG ? `${Math.round(l.drink.alcoholG * l.count)} g alcohol` : "", l.drink.kcal > 5 ? `≈ ${approx(l.drink.kcal * l.count)} kcal` : ""].filter(Boolean).join(" · ") || "drink"}</small></span>
            <div className="stepper">
              <button type="button" aria-label={`Less ${l.drink.name}`} onClick={() => set(i, { ...l, count: step(l.count, -1) })}>−</button>
              <span className="amt">{countText(l.count)} ×</span>
              <button type="button" aria-label={`More ${l.drink.name}`} onClick={() => set(i, { ...l, count: step(l.count, 1) })}>+</button>
            </div>
            <button type="button" className="x" aria-label={`Remove ${l.drink.name}`} onClick={() => onChange(lines.filter((_, j) => j !== i))}>×</button>
          </div>
        );
        const units = unitsOf(l.food);
        return (
          <div className="bline" key={i}>
            <button type="button" className="bname" onClick={() => onDetail(i)}>{l.food.name}<small>≈ {approx(macrosOfLine(l).kcal)} kcal{l.est ? ` · ${l.est}` : l.unit ? "" : " · exact"}</small></button>
            <div className="stepper">
              {l.unit ? <>
                <button type="button" aria-label={`Less ${l.food.name}`} onClick={() => set(i, { ...l, count: step(l.count, -1) })}>−</button>
                <button type="button" className="amt" disabled={units.length < 2} title={units.length > 1 ? "Change unit" : undefined}
                  onClick={() => { const k = units.findIndex((u) => u.name === l.unit); set(i, { ...l, unit: units[(k + 1) % units.length].name }); }}>{amountText(l.count, l.unit)}</button>
                <button type="button" aria-label={`More ${l.food.name}`} onClick={() => set(i, { ...l, count: step(l.count, 1) })}>+</button>
              </> : <button type="button" className="amt" onClick={() => onDetail(i)}>{Math.round(l.grams ?? 100)} g</button>}
            </div>
            <button type="button" className="x" aria-label={`Remove ${l.food.name}`} onClick={() => onChange(lines.filter((_, j) => j !== i))}>×</button>
            {l.alts && l.alts.length > 0 && <div className="alts"><small>Did you mean</small>{l.alts.map((f) => <button type="button" key={f.id} className="pill-btn" onClick={() => { const u = unitsOf(f); set(i, u.length ? { food: f, count: l.count, unit: u[0].name } : { food: f, count: 1, unit: null, grams: 100 }); }}>{f.name}</button>)}
              <button type="button" className="pill-btn" onClick={() => set(i, { ...l, alts: undefined })}>✓ it's right</button></div>}
          </div>
        );
      })}
      {saving ? <div className="save-meal">
        <label className="field">Meal name<input value={mealName} placeholder="Arnold's special" onChange={(e) => setMealName(e.target.value)} /></label>
        <label className="field">Makes how many pieces?<input inputMode="numeric" value={pieces} onChange={(e) => setPieces(e.target.value)} /></label>
        <div className="row2"><button type="button" className="pill-btn" onClick={() => setSaving(false)}>Cancel</button><button type="button" className="pill-btn pri" disabled={!mealName.trim()} onClick={saveMeal}>Save meal</button></div>
        <p className="note">Next time type “2 {mealName.trim() || "Arnold's special"}” or pick it from Recent.</p>
      </div> : <div className="row-log">
        <WhenChips time={time} setTime={setTime} />
        <button type="button" className="pill-btn pri" onClick={log}>Log {lines.length === 1 ? "it" : `${lines.length} ${lines.some(isDrink) ? "items" : "foods"}`}</button>
      </div>}
      {!saving && (foods.length > 1 || (crafting && foods.length > 0)) && <button type="button" className="linkish" onClick={() => setSaving(true)}>Save as a meal…</button>}
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

function FoodRow({ f, onPick, thumb, suspect, amount }: { f: Food; onPick: () => void; thumb?: boolean; suspect?: boolean; amount?: string }) {
  return (
    <div className={`li tap${thumb ? " food" : ""}`} role="button" tabIndex={0} onClick={onPick} onKeyDown={(e) => e.key === "Enter" && onPick()}>
      {thumb && <Thumb src={f.img} label={f.source === "usda" ? "USDA" : ""} />}
      <span>{f.name}<small>{sub(f)}</small>{suspect && <small className="warn">label doesn't add up — check before logging</small>}</span>
      <span className="r">{amount ? `+ ${amount}` : "+"}</span>
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

/** One basket line in detail: exact grams instead of a count, and the food's values, editable. */
function Portion({ line, onCancel, onDone }: { line: Line; onCancel: () => void; onDone: (l: Line) => void }) {
  const food = line.food;
  const [grams, setGrams] = useState(String(Math.round(gramsOf(line))));
  // Values per 100 g, editable: a database label can be wrong, or your version differs.
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState(() => Object.fromEntries(MACRO_FIELDS.map(([k]) => [k, String(Math.round(food.per100[k] * 10) / 10)])) as Record<keyof Macros, string>);
  const per100: Macros = editing ? { kcal: numIn(vals.kcal) || 0, p: numIn(vals.p) || 0, c: numIn(vals.c) || 0, f: numIn(vals.f) || 0 } : food.per100;
  const changed = editing && MACRO_FIELDS.some(([k]) => Math.abs(per100[k] - food.per100[k]) > 0.05);
  const g = Number(grams) || 0, m = forGrams(per100, g);
  const gramsChanged = Math.abs(g - gramsOf(line)) > 0.5;
  const save = () => {
    if (g <= 0) return;
    const used: Food = changed ? { ...food, per100, edited: true } : food;
    if (changed) act.rememberFood(used);
    onDone(gramsChanged ? { food: used, count: 1, unit: null, grams: g } : { ...line, food: used });
  };
  return (
    <div className="card">
      <div className="portion-head">
        {food.img && <Thumb src={food.img} />}
        <h3>{food.name} <span>{origin(food)}</span></h3>
      </div>
      <label className="field">Grams (exact)<input inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} /></label>
      {unitsOf(food).length > 0 && <div className="chips">{unitsOf(food).map((u) => <button key={u.name} type="button" className="pill-btn" onClick={() => setGrams(String(u.g))}>1 {u.name} = {u.g} g</button>)}</div>}
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
        <button type="button" className="pill-btn pri" disabled={g <= 0 || per100.kcal < 0} onClick={save}>Done</button>
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
  const entries = useStore((s) => s.entries);
  // Your last 4 different drinks, newest first: the one-tap re-log.
  const recent = useMemo(() => {
    const out: Drink[] = [];
    for (let i = entries.length - 1; i >= 0 && out.length < 4; i--) {
      const e = entries[i];
      if (e.kind !== "drink" || out.some((d) => d.id === (e.drinkId ?? e.name))) continue;
      out.push([...custom, ...DRINKS].find((d) => d.id === e.drinkId) ?? { id: e.drinkId ?? e.name, name: e.name, ml: e.ml, caffeineMg: e.caffeineMg, alcoholG: e.alcoholG, kcal: e.kcal, p: e.p, c: e.c, f: e.f });
    }
    return out;
  }, [entries, custom]);
  const [time, setTime] = useState(nowHHMM);
  const [making, setMaking] = useState(false);
  const [dq, setDq] = useState("");
  const { on: aiOn } = useAiStatus();
  const usual = useStore((s) => s.settings.usualDrink);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [made, setMade] = useState<Drink[]>([]);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const ask = async (f?: File) => {
    setAiBusy(true); setAiMsg(null);
    const g = await aiDescribe(aiText.trim() || dq.trim() || undefined, f);
    setAiBusy(false);
    setMade(g.drinks);
    setAiMsg(g.message ?? (g.drinks.length ? null : "That didn't come back as a drink — try describing it."));
    if (g.drinks.length) { setAiText(""); setDq(""); }
  };
  const log = (d: Drink) => {
    const e = act.addEntry({ kind: "drink", at: timeToday(time), drinkId: d.id, name: d.name, ml: d.ml, caffeineMg: d.caffeineMg, alcoholG: d.alcoholG, kcal: d.kcal, p: d.p, c: d.c, f: d.f });
    offerUndo([e.id], `Logged ${d.name}`);
    done(`Logged ${d.name}`);
  };
  if (making) return <CustomDrink onCancel={() => setMaking(false)} onDone={(d) => { act.saveDrink(d); setMaking(false); log(d); }} />;
  return (
    <div className="card">
      <WhenChips time={time} setTime={setTime} />
      <input className="search" type="search" placeholder="Search drinks: sprite, espresso, dreher…" value={dq} onChange={(e) => setDq(e.target.value)} aria-label="Find a drink" />
      {(() => {
        // Empty search: only what you drank lately, so the screen isn't a wall of options.
        // Typing: your drinks and the everyday ones that match (a few), then the online database.
        const shown = dq.trim()
          ? [...custom, ...DRINKS].filter((d) => drinkMatch(d, dq) || d === matchDrink(fold(dq.trim()).split(/\s+/), custom)).slice(0, 4)
          : recent;
        if (!shown.length) return null;
        return <>
          <h3>{dq.trim() ? "Yours and everyday" : "Recent"}</h3>
          <div className="drinks">
            {shown.map((d) => (
              <button key={d.id} type="button" onClick={() => log(d)}>
                <b>{d.name}</b>
                <span>{[d.caffeineMg ? `${d.caffeineMg} mg caffeine` : "", d.alcoholG ? `${d.alcoholG} g alcohol` : "", d.kcal > 5 ? `${d.kcal} kcal` : ""].filter(Boolean).join(" · ") || "no caffeine"}</span>
              </button>
            ))}
          </div>
        </>;
      })()}
      <DrinkDatabase q={dq} onLog={(d) => { act.saveDrink(d); log(d); setDq(""); }} />
      {aiOn && <div className="ai-drink">
        <label className="field">Not here? Describe it or snap it
          <div className="row-add">
            <input value={aiText} placeholder="my usual: a long coffee, big cup" onChange={(e) => setAiText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && aiText.trim()) void ask(); }} aria-label="Describe a drink to the AI" />
            <button type="button" className="pill-btn" disabled={aiBusy || !(aiText.trim() || dq.trim())} onClick={() => void ask()}>{aiBusy ? "…" : "Ask AI"}</button>
            <PhotoButton onPick={(f) => void ask(f)} disabled={aiBusy} />
          </div>
        </label>
        {aiMsg && <p className="err">{aiMsg}</p>}
        {made.map((d) => <div key={d.id} className="made">
          <span><b>{d.name}</b><small>{d.caffeineMg} mg caffeine{d.alcoholG ? ` · ${d.alcoholG} g alcohol` : ""}{d.kcal > 5 ? ` · ${d.kcal} kcal` : ""} · AI estimate{d.note ? ` — ${d.note}` : ""}. Saved to your drinks.</small></span>
          <div className="row2">
            <button type="button" className="pill-btn" disabled={usual?.id === d.id} onClick={() => act.setSettings({ usualDrink: d })}>{usual?.id === d.id ? "✓ Your usual" : "Make it my usual"}</button>
            <button type="button" className="pill-btn pri" onClick={() => log(d)}>Log it</button>
          </div>
        </div>)}
      </div>}
      <button type="button" className="pill-btn" onClick={() => setMaking(true)}>+ Your own drink</button>
      <p className="note">One tap logs it at the time above. Values are typical label numbers{aiOn ? "; ones the AI made say so" : ""}.</p>
    </div>
  );
}

/**
 * Drinks from the food database (Open Food Facts + USDA), for anything the built-in list doesn't have.
 * Pick a product, pick a size; it's logged and saved to your drinks, so next time it's in the list.
 */
function DrinkDatabase({ q, onLog }: { q: string; onLog: (d: Drink) => void }) {
  const [found, setFound] = useState<{ q: string; foods: Food[] } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const needle = q.trim();
  useEffect(() => {
    if (needle.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      searchFood(needle, ctl.signal)
        .then((r) => { setFound({ q: needle, foods: r.foods.filter((f) => plausible(f.per100)).slice(0, 8) }); setFailed(null); })
        .catch((e: Error) => { if (e.name !== "AbortError") setFailed(needle); });
    }, 350);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [needle]);
  if (needle.length < 2) return null;
  const list = found?.q === needle ? found.foods : null;
  return (
    <div className="drinkdb">
      <h3>Food database <span>labels from Open Food Facts</span></h3>
      {failed === needle ? <p className="err">The food database didn't answer. Check the connection and type again.</p>
        : !list ? <p className="note">Searching…</p>
        : !list.length ? <p className="note">Nothing called "{needle}" there. Add it as your own drink below.</p>
        : <div className="list">{list.map((f) => {
          const caf = caffeinePer100(f), sizes = sizesFor(f), on = open === f.id;
          return <div key={f.id} className={`li dbdrink${on ? " on" : ""}`}>
            <button type="button" className="dbrow" aria-expanded={on} onClick={() => setOpen(on ? null : f.id)}>
              {f.img && <img src={f.img} alt="" loading="lazy" />}
              <span>{f.name}{f.brand && !f.name.toLowerCase().includes(f.brand.toLowerCase()) ? <i> · {f.brand}</i> : null}
                <small>{f.per100.kcal} kcal / 100 ml{caf.mg ? ` · ${Math.round(caf.mg)} mg caffeine / 100 ml${caf.typical ? " (typical)" : ""}` : ""}{f.alcohol100 ? ` · ${f.alcohol100}% alcohol` : ""}</small></span>
              <span className="r">{on ? "–" : "+"}</span>
            </button>
            {on && <div className="sizes" role="group" aria-label={`Size of ${f.name}`}>
              {sizes.map((ml) => { const d = drinkFromFood(f, ml); return <button key={ml} type="button" className="pill-btn" onClick={() => onLog(d)}>{ml >= 1000 ? `${ml / 1000} l` : `${ml} ml`}<small>{d.kcal} kcal{d.caffeineMg ? ` · ${d.caffeineMg} mg` : ""}</small></button>; })}
            </div>}
          </div>;
        })}</div>}
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

type SuppStatus = "taking" | "low" | "out" | "stopped";
const STATUSES: [SuppStatus, string][] = [["taking", "Taking"], ["low", "Running low"], ["out", "Ran out"], ["stopped", "Stopped"]];
const statusOf = (s: Supplement): SuppStatus => (s.active ? (s.status === "low" ? "low" : "taking") : s.status === "stopped" ? "stopped" : "out");
const STATUS_PATCH: Record<SuppStatus, Partial<Supplement>> = {
  taking: { active: true, status: undefined }, low: { active: true, status: "low" }, out: { active: false, status: "out" }, stopped: { active: false, status: "stopped" },
};
const STATUS_NOTE: Record<SuppStatus, string> = {
  taking: "On Today in its slot.",
  low: "Still on Today, plus a reminder to buy more.",
  out: "Off Today until you tap Restocked. Its history stays — and the days without it show what it does.",
  stopped: "Off Today. Its history stays in Insights.",
};

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function StackTab() {
  const list = useStore((s) => s.supplements);
  const profile = useStore((s) => s.profile);
  const upd = (id: string, patch: Partial<Supplement>) => act.setSupplements(list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  // Checked live as you type a name, so a clash shows before you start taking something.
  const report = useStackCheck(true);
  // "No known link" only means something once you've said what to check against.
  const quiet = !profile.conditions.length && !profile.meds.length;
  const [editing, setEditing] = useState<string | null>(null);
  const research = useStore((st) => st.ai.research);
  const { on } = useAiStatus();
  // A new supplement gets looked up by the AI: what it is, the dose, and clashes with your About me.
  const done = (s: Supplement) => {
    if (!s.name.trim()) act.setSupplements(list.filter((x) => x.id !== s.id));
    else if (on && (!research[s.id] || research[s.id].asked.toLowerCase() !== s.name.trim().toLowerCase())) void researchSupplement(s);
    setEditing(null);
  };
  const slotName = (s: Supplement) => { const x = SLOTS.find((y) => y.id === s.slot)!; return `${x.name} · ${hhmm(x.at)}`; };
  return (
    <div className="card">
      <h3>Your stack <span>ticked daily on Today · checked against <a href="#settings">About me</a></span></h3>
      <div className="list">
        {list.map((s) => editing === s.id ? (
          <div key={s.id} className="supp-edit">
            <div className="row2">
              <label className="field">Name<input autoFocus value={s.name} placeholder="Omega-3, zinc…" onChange={(e) => upd(s.id, { name: e.target.value })} /></label>
              <label className="field">Dose<input value={s.dose} placeholder="1 capsule" onChange={(e) => upd(s.id, { dose: e.target.value })} /></label>
            </div>
            <StackBadge name={s.name} report={report} hideNone={quiet} />
            <label className="field">When<select value={s.slot} onChange={(e) => upd(s.id, { slot: e.target.value as Supplement["slot"] })}>{SLOTS.map((x) => <option key={x.id} value={x.id}>{x.name} · {hhmm(x.at)}</option>)}</select></label>
            <div className="seg sstatus" role="group" aria-label="Status">
              {STATUSES.map(([v, label]) => <button key={v} type="button" aria-pressed={statusOf(s) === v} onClick={() => upd(s.id, STATUS_PATCH[v])}>{label}</button>)}
            </div>
            <p className="note">{STATUS_NOTE[statusOf(s)]}</p>
            <div className="row2">
              <button type="button" className="pill-btn" onClick={() => { if (confirm(`Delete ${s.name || "this"} completely? Use “Stopped” instead to keep its history.`)) { act.setSupplements(list.filter((x) => x.id !== s.id)); setEditing(null); } }}>Delete</button>
              <button type="button" className="pill-btn pri" onClick={() => done(s)}>Done</button>
            </div>
          </div>
        ) : (
          <div key={s.id} className={`li supp-row${s.active ? "" : " paused"}`}>
            <span>{s.name}{s.dose ? <em> {s.dose}</em> : null}<small>{s.active ? `${slotName(s)}${s.status === "low" ? " · running low" : ""}` : s.status === "out" ? "ran out — back when you restock" : s.status === "stopped" ? "stopped" : "paused"}</small><StackBadge name={s.name} report={report} hideNone={quiet} /><SuppResearch s={s} /></span>
            <button type="button" className="pill-btn" onClick={() => setEditing(s.id)}>Edit</button>
          </div>
        ))}
      </div>
      <button type="button" className="pill-btn" onClick={() => { const id = newId(); act.setSupplements([...list, { id, name: "", dose: "", slot: "morning", at: 8 * 60, active: true }]); setEditing(id); }}>+ Add supplement</button>
    </div>
  );
}

/* ------------------------------------------------------------------ body */

function BodyTab({ done }: { done: (m: string) => void }) {
  const entries = useStore((s) => s.entries);
  const all = entries.filter((e): e is EntryOf<"weight"> => e.kind === "weight");
  const weights = all.slice(-7).reverse();
  const [kg, setKg] = useState(weights[0] ? String(weights[0].kg) : "");
  const n = Number(kg.replace(",", "."));
  // The last 30 days with the same trend line Noticed uses (typos and one-offs left out).
  const today = localDay(Date.now());
  const days = bodyDays(entries, addDays(today, -29), today);
  const trend = weightTrend(days);
  const pts: [number, number][] = days.flatMap((d, i) => (d.kg == null ? [] : [[i, d.kg] as [number, number]]));
  const ys = pts.map((p) => p[1]);
  return (
    <div className="card">
      <h3>Weight <span>morning, before food, is most comparable</span></h3>
      <div className="row2">
        <label className="field">kg<input inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} /></label>
        <div style={{ display: "flex", alignItems: "end" }}>
          <button type="button" className="pill-btn pri" disabled={!(n > 20 && n < 400)} onClick={() => { const e = act.addEntry({ kind: "weight", at: Date.now(), kg: Math.round(n * 10) / 10 }); offerUndo([e.id], `Logged ${n} kg`); done(`Logged ${n} kg`); }}>Log weight</button>
        </div>
      </div>
      {pts.length >= 2 && <div className="wchart">
        <LineChart label="Weight, last 30 days" h={130} lo={Math.floor(Math.min(...ys) - 0.5)} hi={Math.ceil(Math.max(...ys) + 0.5)} xs={[0, 29]} yfmt={(v) => v.toFixed(1)}
          xlabels={[[0, "30 days ago"], [29, "today"]]}
          series={[{ pts, color: "var(--wt)", dots: true, line: false, dotOpacity: 0.9 }, ...(trend ? [{ pts: trend.fit, color: "var(--c-ink)", width: 1.5 }] : [])]} />
        <p className="note">{trend ? `Trend ${trend.perDay * 7 >= 0 ? "+" : "−"}${Math.abs(trend.perDay * 7).toFixed(2)} kg a week · trend weight ${trend.nowKg.toFixed(1)} kg` : `The trend line appears after 8 weigh-ins over 2 weeks (${pts.length} so far).`}</p>
      </div>}
      <div className="list">{weights.map((w) => <div className="li" key={w.id}><span>{w.kg} kg<small>{localDay(w.at)} {clock(w.at)}</small></span><button type="button" className="x" aria-label="Delete" onClick={() => act.removeEntry(w.id)}>×</button></div>)}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ today's log */

const describe = (e: Entry, supps: Supplement[]): [string, string] => {
  switch (e.kind) {
    case "food": return [e.name, `${e.unit && e.count ? `${amountText(e.count, e.unit)} · ≈ ${approx(e.macros.kcal)}` : Math.round(e.macros.kcal)} kcal · P ${Math.round(e.macros.p)}${!e.unit && e.grams ? ` · ${Math.round(e.grams)} g` : ""}`];
    case "drink": return [e.name, [e.caffeineMg ? `${e.caffeineMg} mg caffeine` : "", e.alcoholG ? `${e.alcoholG} g alcohol` : "", e.kcal > 5 ? `${e.kcal} kcal` : ""].filter(Boolean).join(" · ")];
    case "supp": return [supps.find((s) => s.id === e.suppId)?.name ?? "Supplement", e.status];
    case "set": return [e.exercise, `${e.kg} kg × ${e.reps}`];
    case "weight": return ["Weight", `${e.kg} kg`];
    case "feel": return ["Feeling", `energy ${e.energy ?? "–"} · mood ${e.mood ?? "–"} · focus ${e.focus ?? "–"}`];
    case "answer": return [e.question, e.answer];
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
