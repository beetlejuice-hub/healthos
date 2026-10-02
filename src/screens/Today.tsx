import { useEffect, useMemo, useState } from "react";
import { act, getState, offerUndo, useStore } from "../lib/store";
import { DRINKS } from "../lib/drinks";
import { nowItems } from "../lib/today";
import { notice } from "../lib/findings";
import { FEEL_KEYS, feelChange, feelState, latestFeel, type FeelKey } from "../lib/feel";
import { StackAlert } from "../components/StackCheck";
import { ScoutLine } from "../components/Scout";
import { AiQuestions, MorningRead } from "../components/Ai";
import { caffeineAt } from "../lib/caffeine";
import { caffeineDoses } from "../lib/insights";
import { add, byDay, macrosOf, ZERO } from "../lib/nutrition";
import { atMinute, clock, dayLabel, localDay, MIN } from "../lib/time";
import { go } from "../lib/nav";
import type { Drink, Entry, EntryOf, Slot } from "../lib/types";
import { answerSlot, SLOTS, slotsOf } from "../lib/types";
import { parseFat } from "../lib/bodyfat";

/**
 * The current time, re-read on every render and re-rendered every `ms` while open. Read fresh
 * rather than cached in state: a coffee logged a second ago must count as already drunk, not as
 * a dose from the future (found in the first click-through: "+ Usual coffee" left the card at 2 mg).
 */
export function useNow(ms = 30_000) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), ms); return () => clearInterval(t); }, [ms]);
  return Date.now();
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");

/** caffeineAt already counts under 10 mg as none (CLEAR_MG), so 0 means cleared. */
const mgText = (mg: number) => (mg === 0 ? "none" : `${mg} mg`);

export function Today() {
  const now = useNow();
  const s = useStore((x) => x);
  const day = localDay(now);
  const [dismissed, setDismissed] = useState<string[]>([]);

  // The cut-off is phrased around the drink you'd actually have next: your usual one if chosen.
  const coffeeMg = s.settings.usualDrink?.caffeineMg || s.settings.coffeeMg;
  const items = useMemo(() => nowItems({ now, entries: s.entries, supplements: s.supplements, goals: s.goals, ...s.settings, coffeeMg }), [now, s.entries, s.supplements, s.goals, s.settings, coffeeMg]);
  const shown = items.filter((i) => !dismissed.includes(i.id));
  const todays = s.entries.filter((e) => localDay(e.at) === day);
  const totals = todays.reduce((a, e) => { const m = macrosOf(e); return m ? add(a, m) : a; }, ZERO);
  const doses = caffeineDoses(s.entries);
  const bed = atMinute(day, s.settings.bedMinute);
  const cafNow = Math.round(caffeineAt(doses, now, s.settings.halfLifeMin));
  const cafBed = Math.round(caffeineAt(doses.filter((d) => d.at <= now), bed, s.settings.halfLifeMin));
  const usual = (() => {
    const d = [...byDay(s.entries).values()].filter((x) => x.logged && x.day < day).slice(-14);
    return d.length ? d.reduce((a, x) => a + x.totals.kcal, 0) / d.length : null;
  })();

  const answer = (suppIds: string[], status: "taken" | "skipped", slot: Slot) => {
    const ids = suppIds.map((suppId) => act.addEntry({ kind: "supp", at: Date.now(), suppId, status, slot }).id);
    offerUndo(ids, `${status === "taken" ? "Ticked" : "Skipped"} ${suppIds.length} supplement${suppIds.length > 1 ? "s" : ""}`);
  };

  return (
    <div className="calm">
      <div className="head">
        <span>{dayLabel(now)} · {clock(now)}</span>
        <a href="#settings">Settings</a>
      </div>
      <p className="sum">
        {todays.some((e) => e.kind === "food") ? <>{fmt(totals.kcal)} kcal in{usual ? `, usual day ${fmt(usual)}` : ""}. </> : <>Nothing eaten logged yet. </>}
        {doses.some((d) => d.at > now - 24 * 60 * MIN)
          ? cafNow === 0 ? <>Today's caffeine has cleared out.</> : <>There's <em>{cafNow} mg</em> of caffeine in you, falling to {mgText(cafBed)} by {clock(bed)}.</>
          : <>No caffeine logged today.</>}
      </p>

      <MorningRead />
      <DayChips now={now} />
      <AiQuestions />
      <NextAnswer />
      <WorkoutRunning now={now} />
      <StackAlert />
      <NoticedLine />
      <ScoutLine />

      <div className="h"><span>Now</span><span>{shown.length ? `${shown.length} to do` : "all clear"}</span></div>
      {shown.length === 0 && <p className="empty-ok">Nothing needs you right now.</p>}
      {shown.map((it) => (
        <div key={it.id} className={`item ${it.kind.startsWith("supp") || it.kind === "restock" ? "supp" : it.kind === "caffeine" ? "warn" : it.kind}`}>
          <span className="ic" aria-hidden="true">{it.kind.startsWith("supp") ? "✓" : it.kind === "caffeine" ? "!" : it.kind === "food" ? "+" : it.kind === "weight" ? "kg" : it.kind === "restock" ? "↻" : "~"}</span>
          <div><b>{it.title}</b><p>{it.body}</p></div>
          <div className="acts">
            {(it.kind === "supp-missed" || it.kind === "supp-due") && <>
              <button type="button" className="pill-btn pri" onClick={() => answer(it.suppIds, "taken", it.slot)}>{it.suppIds.length > 1 ? "Took all" : "Took it"}</button>
              {it.suppIds.length > 1
                ? <button type="button" className="pill-btn" onClick={() => document.getElementById("stack")?.scrollIntoView({ behavior: "smooth" })}>Pick…</button>
                : <button type="button" className="pill-btn" onClick={() => answer(it.suppIds, "skipped", it.slot)}>Skip</button>}
            </>}
            {it.kind === "caffeine" && <button type="button" className="pill-btn" onClick={() => setDismissed((d) => [...d, it.id])}>Got it</button>}
            {it.kind === "food" && <button type="button" className="pill-btn pri" onClick={() => go("log", "food")}>Log food</button>}
            {it.kind === "weight" && <WeighIn lastKg={it.lastKg} />}
            {it.kind === "restock" && <>
              {it.out.length > 0 && <button type="button" className="pill-btn pri" onClick={() => act.setSupplements(s.supplements.map((x) => (it.out.includes(x.id) || it.low.includes(x.id) ? { ...x, active: true, status: undefined } : x)))}>Restocked</button>}
              {it.out.length === 0 && <button type="button" className="pill-btn" onClick={() => act.setSupplements(s.supplements.map((x) => (it.low.includes(x.id) ? { ...x, active: true, status: undefined } : x)))}>Bought more</button>}
              {it.out.length === 0 && <button type="button" className="pill-btn" onClick={() => act.setSupplements(s.supplements.map((x) => (it.low.includes(x.id) ? { ...x, active: false, status: "out" } : x)))}>It's out</button>}
            </>}
            {it.kind === "feel" && <button type="button" className="pill-btn pri" onClick={() => document.getElementById("feel")?.scrollIntoView({ behavior: "smooth" })}>Rate it</button>}
          </div>
        </div>
      ))}

      <Fuel totals={totals} goals={s.goals} />
      <CaffeineCard doses={doses} now={now} bed={bed} halfLife={s.settings.halfLifeMin} cafNow={cafNow} cafBed={cafBed} />
      <Stack now={now} />
      <Feel now={now} />
    </div>
  );
}

function Fuel({ totals, goals }: { totals: { kcal: number; p: number; c: number; f: number }; goals: { kcal: number; p: number; c: number; f: number } }) {
  const pct = Math.min(1, totals.kcal / goals.kcal);
  return (
    <div className="card">
      <h3>Fuel <span>goal {fmt(goals.kcal)} kcal</span></h3>
      <div className="fuel">
        <div className="ring">
          <svg viewBox="0 0 112 112" width="112" height="112" aria-hidden="true">
            <circle cx="56" cy="56" r="48" fill="none" stroke="var(--c-track)" strokeWidth="9" />
            <circle cx="56" cy="56" r="48" fill="none" stroke="var(--kcal)" strokeWidth="9" strokeLinecap="round" transform="rotate(-90 56 56)" strokeDasharray={`${(pct * 301.6).toFixed(1)} 302`} />
          </svg>
          <div><b>{fmt(totals.kcal)}</b><span>{totals.kcal <= goals.kcal ? `${fmt(goals.kcal - totals.kcal)} left` : `${fmt(totals.kcal - goals.kcal)} over`}</span></div>
        </div>
        <div className="macros">
          {([["Protein", totals.p, goals.p, "var(--pro)"], ["Carbs", totals.c, goals.c, "var(--carb)"], ["Fat", totals.f, goals.f, "var(--fat)"]] as const).map(([n, v, g, c]) => (
            <div className="mac" key={n}>
              <div><span>{n}</span><span><b>{fmt(v)}</b> / {g} g</span></div>
              <div className="track"><i style={{ width: `${Math.min(100, (v / g) * 100)}%`, background: c }} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CaffeineCard({ doses, now, bed, halfLife, cafNow, cafBed }: { doses: { at: number; mg: number }[]; now: number; bed: number; halfLife: number; cafNow: number; cafBed: number }) {
  const d0 = new Date(now); d0.setHours(6, 0, 0, 0);
  const t0 = d0.getTime(), t1 = t0 + 18 * 60 * MIN;
  const W = 320, H = 110, pl = 26, pr = 6, pt = 18, pb = 16;
  const peak = Math.max(...Array.from({ length: 37 }, (_, i) => caffeineAt(doses, t0 + i * 30 * MIN, halfLife)));
  const max = Math.max(200, Math.ceil(peak / 100) * 100);
  const x = (t: number) => pl + ((t - t0) / (t1 - t0)) * (W - pl - pr), y = (mg: number) => pt + (1 - mg / max) * (H - pt - pb);
  // Always end exactly on `b`, so the solid past meets the "now" dot instead of stopping up to 5 min short.
  const pts = (a: number, b: number) => { const p: string[] = []; const push = (t: number) => p.push(`${x(t).toFixed(1)},${y(caffeineAt(doses, t, halfLife)).toFixed(1)}`); for (let t = a; t < b; t += 5 * MIN) push(t); push(b); return p.join(" "); };
  const cut = Math.min(Math.max(now, t0), t1);
  // Touch or hover anywhere on the curve to read it: "14:20 · 119 mg".
  const [probe, setProbe] = useState<number | null>(null);
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    const t = t0 + ((vx - pl) / (W - pl - pr)) * (t1 - t0);
    setProbe(Math.round(Math.max(t0, Math.min(t1, t)) / (5 * MIN)) * 5 * MIN);
  };
  const pmg = probe != null ? Math.round(caffeineAt(doses, probe, halfLife)) : 0;
  const px = probe != null ? x(probe) : 0;
  return (
    <div className="card">
      <h3>Caffeine <span>{mgText(cafNow)} now · {mgText(cafBed)} at {clock(bed)}</span></h3>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Caffeine in your body today: ${cafNow} mg now, ${cafBed} mg at your planned bedtime`}
        style={{ touchAction: "pan-y", cursor: "crosshair" }} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setProbe(null)}>
        {[0, max / 2, max].map((v) => <g key={v}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--c-track)" /><text x={pl - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--c-dim)">{v}</text></g>)}
        {[6, 12, 18, 24].map((h) => <text key={h} x={x(t0 + (h - 6) * 60 * MIN)} y={H - 3} textAnchor="middle" fontSize="9" fill="var(--c-dim)">{String(h % 24).padStart(2, "0")}</text>)}
        <polygon points={`${x(t0)},${y(0)} ${pts(t0, cut)} ${x(cut)},${y(0)}`} fill="var(--caf)" fillOpacity=".18" />
        <polyline points={pts(t0, cut)} fill="none" stroke="var(--caf)" strokeWidth="2.2" />
        <polyline points={pts(cut, t1)} fill="none" stroke="var(--caf)" strokeWidth="2" strokeDasharray="3 3" strokeOpacity=".7" />
        {doses.filter((d) => d.at >= t0 && d.at <= t1).map((d) => <line key={d.at} x1={x(d.at)} x2={x(d.at)} y1={y(0)} y2={y(0) + 4} stroke="var(--caf)" strokeWidth="2" />)}
        {now >= t0 && now <= t1 && <circle cx={x(now)} cy={y(cafNow)} r="3.5" fill="var(--caf)" />}
        {bed <= t1 && <circle cx={x(bed)} cy={y(cafBed)} r="3" fill="none" stroke="var(--caf)" strokeWidth="1.5" />}
        {probe != null && <g pointerEvents="none">
          <line x1={px} x2={px} y1={pt - 4} y2={y(0)} stroke="var(--c-ink)" strokeOpacity=".45" />
          <circle cx={px} cy={y(pmg)} r="3.5" fill="var(--c-bg)" stroke="var(--caf)" strokeWidth="2" />
          {/* Anchored toward the middle near either edge, so "21:55 · 16 mg (forecast)" is never cut off. */}
          <text x={px > W * 0.66 ? W - pr : px < W * 0.33 ? pl : px} y={10} textAnchor={px > W * 0.66 ? "end" : px < W * 0.33 ? "start" : "middle"} fontSize="10.5" fontWeight="600" fill="var(--c-ink)">{clock(probe)} · {pmg} mg{probe > now ? " (forecast)" : ""}</text>
        </g>}
      </svg>
      <UsualDrink />
    </div>
  );
}

/**
 * One tap for the drink you have most. Empty at first; tapping it lets you pick (or make) your
 * usual, which stays until you ✕ it. Owner: "keep the button, but at first it's clear".
 */
function UsualDrink() {
  const usual = useStore((s) => s.settings.usualDrink);
  const custom = useStore((s) => s.drinks);
  const [picking, setPicking] = useState(false);
  const log = (d: Drink) => {
    const e = act.addEntry({ kind: "drink", at: Date.now(), drinkId: d.id, name: d.name, ml: d.ml, caffeineMg: d.caffeineMg, alcoholG: d.alcoholG, kcal: d.kcal });
    offerUndo([e.id], `Logged ${d.name}`);
  };
  if (picking) return (
    <div className="card" style={{ background: "var(--c-card-2)", padding: 12 }}>
      <h3>Choose your usual drink <span>stays until you ✕ it</span></h3>
      <div className="drinks">
        {[...custom, ...DRINKS].filter((d) => d.caffeineMg > 0).map((d) => (
          <button key={d.id} type="button" style={{ background: "var(--c-card)" }} onClick={() => { act.setSettings({ usualDrink: d }); setPicking(false); }}>
            <b>{d.name}</b><span>{d.caffeineMg} mg caffeine</span>
          </button>
        ))}
      </div>
      <div className="row2">
        <button type="button" className="pill-btn" onClick={() => setPicking(false)}>Cancel</button>
        <button type="button" className="pill-btn" onClick={() => go("log", "drink")}>Make your own…</button>
      </div>
    </div>
  );
  return (
    <div className="row2">
      <button type="button" className="pill-btn" onClick={() => go("log", "drink")}>+ Drink</button>
      {usual
        ? <div style={{ display: "flex", gap: 4 }}>
            <button type="button" className="pill-btn pri" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} onClick={() => log(usual)}>+ {usual.name}</button>
            <button type="button" className="pill-btn" aria-label={`Clear usual drink (${usual.name})`} onClick={() => act.setSettings({ usualDrink: null })}>✕</button>
          </div>
        : <button type="button" className="pill-btn" onClick={() => setPicking(true)}>☆ Set usual drink</button>}
    </div>
  );
}

/** The daily stack as three short lists — morning, midday, evening — each ✓ took / ✗ skipped. */
function Stack({ now }: { now: number }) {
  const all = useStore((s) => s.supplements);
  const entries = useStore((s) => s.entries);
  const day = localDay(now);
  const supps = all.filter((x) => x.active);
  // One answer per supplement per slot: theanine at breakfast and again at lunch are two ticks.
  const key = (id: string, slot: Slot) => `${id}|${slot}`;
  const answers = new Map(entries.filter((e): e is EntryOf<"supp"> => e.kind === "supp" && localDay(e.at) === day).map((e) => [key(e.suppId, answerSlot(e, all.find((x) => x.id === e.suppId))), e]));
  const set = (id: string, slot: Slot, status: "taken" | "skipped") => {
    const cur = answers.get(key(id, slot));
    if (cur && cur.status === status) act.removeEntry(cur.id);
    else if (cur) act.updateEntry(cur.id, { status } as Partial<Entry>);
    else act.addEntry({ kind: "supp", at: Date.now(), suppId: id, status, slot });
  };
  const doses = supps.flatMap((s) => slotsOf(s).map((slot) => key(s.id, slot)));
  const taken = doses.filter((k) => answers.get(k)?.status === "taken").length;
  return (
    <div className="card" id="stack">
      <h3>Stack <span>{taken} of {doses.length} taken</span></h3>
      {SLOTS.map((slot) => {
        const list = supps.filter((s) => slotsOf(s).includes(slot.id));
        if (!list.length) return null;
        const open = list.filter((s) => !answers.has(key(s.id, slot.id)));
        return (
          <div key={slot.id} style={{ display: "grid", gap: 8 }}>
            <div className="h" style={{ padding: 0 }}>
              <span>{slot.name} · {clock(atMinute(day, slot.at))}</span>
              {open.length > 1 && <button type="button" className="pill-btn" style={{ padding: "3px 10px", fontSize: 11 }} onClick={() => { const ids = open.map((s) => act.addEntry({ kind: "supp", at: Date.now(), suppId: s.id, status: "taken", slot: slot.id }).id); offerUndo(ids, `Ticked ${ids.length} supplements`); }}>Took all</button>}
            </div>
            {list.map((s) => {
              const a = answers.get(key(s.id, slot.id));
              return (
                <div className="stack-row" key={s.id}>
                  <span style={{ opacity: a ? 0.6 : 1 }}>{s.name} <span style={{ color: "var(--c-dim)", fontSize: 12.5 }}>{s.dose}</span></span>
                  <div className="tick">
                    <button type="button" className="yes" aria-pressed={a?.status === "taken"} aria-label={`Took ${s.name}`} onClick={() => set(s.id, slot.id, "taken")}>✓</button>
                    <button type="button" className="no" aria-pressed={a?.status === "skipped"} aria-label={`Skipped ${s.name}`} onClick={() => set(s.id, slot.id, "skipped")}>✗</button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      {supps.length === 0 && <p className="note">No supplements set up. Add your stack in Log → Stack.</p>}
    </div>
  );
}

const WORDS: Record<string, string[]> = {
  energy: ["drained", "low", "ok", "steady", "high"], mood: ["low", "flat", "ok", "good", "great"],
  focus: ["foggy", "scattered", "ok", "sharp", "locked in"], stress: ["calm", "low", "some", "high", "maxed"],
};

/** One rating per ~2 hours: moving a slider updates the latest rating if it's recent, otherwise starts a new one. */
function Feel({ now }: { now: number }) {
  const entries = useStore((x) => x.entries);
  const st = feelState(entries, now);
  // While a finger is on a slider its value lives here; it's logged when the finger lifts, so a
  // tap on the value it already shows still counts as "logged 7" (owner: "I should at least touch it").
  const [drag, setDrag] = useState<Partial<Record<FeelKey, number>>>({});
  const record = (k: FeelKey, v: number) => {
    const c = feelChange(getState().entries, Date.now(), k, v);
    if (c.op === "update") act.updateEntry(c.id, c.patch as Partial<Entry>); else act.addEntry(c.entry);
    setDrag((d) => ({ ...d, [k]: undefined }));
  };
  const lastAt = latestFeel(entries)?.at;
  return (
    <div className="card" id="feel">
      <h3>How do you feel? <span>{lastAt ? `last rated ${clock(lastAt)}` : "tap the ones you want to log"}</span></h3>
      {FEEL_KEYS.map((k) => {
        const unset = drag[k] == null && st[k].now == null;
        const v = drag[k] ?? st[k].now ?? st[k].last?.v ?? 5;
        const word = WORDS[k][Math.min(4, Math.floor((v - 1) / 2))];
        return (
          <div className="feel" key={k}>
            <span>{k[0].toUpperCase() + k.slice(1)}</span>
            <input type="range" min={1} max={10} value={v} aria-label={k} className={unset ? "unset" : ""}
              onChange={(e) => setDrag((d) => ({ ...d, [k]: +e.target.value }))}
              onPointerUp={(e) => record(k, +e.currentTarget.value)}
              onTouchEnd={(e) => record(k, +e.currentTarget.value)}
              onKeyUp={(e) => { if (/Arrow|Home|End|Page/.test(e.key)) record(k, +e.currentTarget.value); }} />
            <em>{unset ? (st[k].last ? `was ${st[k].last!.v}` : "tap") : `${v} · ${word}`}</em>
          </div>
        );
      })}
      <p className="note">Only the ones you touch are logged — a tap on the same number logs it too.</p>
    </div>
  );
}

/**
 * One line from Noticed: the top finding, until you ✕ it. It comes back only when the finding
 * itself changes (a new number), so Today stays calm.
 */
function NoticedLine() {
  const now = useNow(10 * 60_000);
  const entries = useStore((x) => x.entries);
  const goals = useStore((x) => x.goals);
  const settings = useStore((x) => x.settings);
  const workouts = useStore((x) => x.workouts);
  const supplements = useStore((x) => x.supplements);
  // Today shows one line: the strongest finding that isn't just a description of you.
  const top = useMemo(() => notice(entries, goals, now, settings.bodyKg, { workouts, supplements, settings }).found.find((f) => f.id !== "baseline"), [entries, goals, now, settings, workouts, supplements]);
  const key = top ? `${top.id}:${top.value}` : "";
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem("healthos.noticed.hidden") ?? ""; } catch { return ""; } });
  if (!top || hidden === key) return null;
  const hide = (e: React.MouseEvent) => { e.preventDefault(); setHidden(key); try { localStorage.setItem("healthos.noticed.hidden", key); } catch { /* private mode */ } };
  return (
    <a className="noticed-line" href={`#insights`} onClick={() => setTimeout(() => document.getElementById(`n-${top.id}`)?.scrollIntoView({ behavior: "smooth" }), 150)}>
      <span><small>Noticed</small>{top.title}.</span>
      <button type="button" aria-label="Hide this" onClick={hide}>✕</button>
    </a>
  );
}

/** A workout left open shows here too, so it isn't only visible from the Workout tab. */
function WorkoutRunning({ now }: { now: number }) {
  const w = useStore((x) => x.workouts.find((v) => v.endedAt === null));
  const entries = useStore((x) => x.entries);
  if (!w) return null;
  const last = entries.reduce((m, e) => (e.kind === "set" && e.workoutId === w.id ? Math.max(m, e.at) : m), 0);
  const ends = last ? last + 60 * MIN : w.startedAt + 30 * MIN;
  return (
    <div className="noticed-line running">
      <span><small>Workout running</small>{w.template} · {last ? `last set ${clock(last)}` : `started ${clock(w.startedAt)}, no sets yet`}<small className="sub">{now < ends ? `ends by itself at ${clock(ends)} if you forget` : "ending now"}</small></span>
      <span className="acts"><button type="button" className="pill-btn" onClick={() => go("workout")}>Open</button><button type="button" className="pill-btn pri" onClick={() => (last ? act.endWorkout(w.id, Date.now() - last > 10 * MIN ? last + 2 * MIN : Date.now()) : act.tidyWorkouts(Date.now(), true))}>Finish</button></span>
    </div>
  );
}

/** Weigh in right from Today: yesterday's weight is pre-filled, so it's usually one small edit. */
function WeighIn({ lastKg }: { lastKg: number | null }) {
  const [kg, setKg] = useState(lastKg != null ? String(lastKg) : "");
  const [fat, setFat] = useState("");
  const n = Number(kg.replace(",", "."));
  const fatPct = parseFat(fat);
  const ok = n > 20 && n < 400 && (fat.trim() === "" || fatPct != null);
  return (
    <div className="weighin">
      <input inputMode="decimal" aria-label="Weight in kg" value={kg} placeholder="kg" onChange={(e) => setKg(e.target.value)} />
      <input inputMode="decimal" aria-label="Body fat % (optional)" value={fat} placeholder="fat %" className="fatin" onChange={(e) => setFat(e.target.value)} />
      <button type="button" className="pill-btn pri" disabled={!ok} onClick={() => { const e = act.addEntry({ kind: "weight", at: Date.now(), kg: Math.round(n * 100) / 100, ...(fatPct != null ? { fatPct } : {}) }); offerUndo([e.id], `Logged ${Math.round(n * 100) / 100} kg`); }}>Log kg</button>
    </div>
  );
}

/**
 * Today at a glance, five chips: what's in, what's missing — one tap to fill a gap. No streaks,
 * no guilt: a missing chip is just a shortcut (owner: "hard to be consistent … the app should make
 * me want to do it").
 */
function DayChips({ now }: { now: number }) {
  const entries = useStore((x) => x.entries);
  const supplements = useStore((x) => x.supplements);
  const day = localDay(now);
  const todays = entries.filter((e) => localDay(e.at) === day);
  const kcal = todays.reduce((a, e) => a + (e.kind === "food" ? e.macros.kcal : 0), 0);
  const drinks = todays.filter((e) => e.kind === "drink").length;
  const active = supplements.filter((x) => x.active).flatMap((s) => slotsOf(s).map((slot) => `${s.id}|${slot}`));
  const ticked = new Set(todays.flatMap((e) => (e.kind === "supp" ? [`${e.suppId}|${answerSlot(e, supplements.find((x) => x.id === e.suppId))}`] : []))).size;
  const weighed = todays.some((e) => e.kind === "weight"), rated = todays.some((e) => e.kind === "feel");
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const chips: [string, boolean, () => void][] = [
    [kcal ? `Food ${fmt(kcal)} kcal` : "Food", kcal > 0, () => go("log", "food")],
    [drinks ? `Drinks ${drinks}` : "Drinks", drinks > 0, () => go("log", "drink")],
    [`Stack ${Math.min(ticked, active.length)}/${active.length}`, active.length > 0 && ticked >= active.length, () => scrollTo("stack")],
    [weighed ? "Weighed" : "Weight", weighed, () => go("log", "body")],
    [rated ? "Rated" : "Rating", rated, () => scrollTo("feel")],
  ];
  const doneN = chips.filter((c) => c[1]).length;
  return (
    <div className="daychips" aria-label="Today at a glance">
      {chips.map(([label, ok, onTap]) => <button key={label} type="button" className={ok ? "ok" : ""} onClick={onTap}>{ok ? "✓ " : "+ "}{label}</button>)}
      <span className="dc-sum">{doneN === 5 ? "Today's picture is complete." : `${5 - doneN} tap${5 - doneN > 1 ? "s" : ""} to complete today's picture`}</span>
    </div>
  );
}

/** The nearest answer Noticed is working towards, and what it still needs — progress you can see. */
function NextAnswer() {
  const now = useNow(10 * 60_000);
  const entries = useStore((x) => x.entries);
  const goals = useStore((x) => x.goals);
  const settings = useStore((x) => x.settings);
  const workouts = useStore((x) => x.workouts);
  const supplements = useStore((x) => x.supplements);
  const next = useMemo(() => notice(entries, goals, now, settings.bodyKg, { workouts, supplements, settings }).checking[0], [entries, goals, now, settings, workouts, supplements]);
  if (!next) return null;
  return (
    <a className="nextanswer" href="#insights">
      <span><small>Next answer</small>{next.question}<em>needs {next.missing}</em></span>
      <span className="bar" aria-label={`${Math.round(next.progress * 100)}% there`}><i style={{ width: `${Math.round(next.progress * 100)}%` }} /></span>
    </a>
  );
}
