import { useEffect, useMemo, useState } from "react";
import { act, useStore } from "../lib/store";
import { nowItems } from "../lib/today";
import { caffeineAt } from "../lib/caffeine";
import { caffeineDoses } from "../lib/insights";
import { add, byDay, macrosOf, ZERO } from "../lib/nutrition";
import { atMinute, clock, dayLabel, localDay, MIN } from "../lib/time";
import { go } from "../lib/nav";
import type { Entry, EntryOf } from "../lib/types";

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

export function Today() {
  const now = useNow();
  const s = useStore((x) => x);
  const day = localDay(now);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const items = useMemo(() => nowItems({ now, entries: s.entries, supplements: s.supplements, goals: s.goals, ...s.settings }), [now, s.entries, s.supplements, s.goals, s.settings]);
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

  const answer = (suppId: string, status: "taken" | "skipped") => act.addEntry({ kind: "supp", at: Date.now(), suppId, status });

  return (
    <div className="calm">
      <div className="head">
        <span>{dayLabel(now)} · {clock(now)}</span>
        <a href="#settings">Settings</a>
      </div>
      <p className="sum">
        {todays.some((e) => e.kind === "food") ? <>{fmt(totals.kcal)} kcal in{usual ? `, usual day ${fmt(usual)}` : ""}. </> : <>Nothing eaten logged yet. </>}
        {doses.some((d) => d.at > now - 24 * 60 * MIN)
          ? <>There's <em>{cafNow} mg</em> of caffeine in you, falling to {cafBed} mg by {clock(bed)}.</>
          : <>No caffeine logged today.</>}
      </p>

      <div className="h"><span>Now</span><span>{shown.length ? `${shown.length} to do` : "all clear"}</span></div>
      {shown.length === 0 && <p className="empty-ok">Nothing needs you right now.</p>}
      {shown.map((it) => (
        <div key={it.id} className={`item ${it.kind.startsWith("supp") ? "supp" : it.kind === "caffeine" ? "warn" : it.kind}`}>
          <span className="ic" aria-hidden="true">{it.kind.startsWith("supp") ? "✓" : it.kind === "caffeine" ? "!" : it.kind === "food" ? "+" : "~"}</span>
          <div><b>{it.title}</b><p>{it.body}</p></div>
          <div className="acts">
            {(it.kind === "supp-missed" || it.kind === "supp-due") && <>
              <button type="button" className="pill-btn pri" onClick={() => answer(it.suppId, "taken")}>Took it</button>
              <button type="button" className="pill-btn" onClick={() => answer(it.suppId, "skipped")}>Skip today</button>
            </>}
            {it.kind === "caffeine" && <button type="button" className="pill-btn" onClick={() => setDismissed((d) => [...d, it.id])}>Got it</button>}
            {it.kind === "food" && <button type="button" className="pill-btn pri" onClick={() => go("log", "food")}>Log food</button>}
            {it.kind === "feel" && <button type="button" className="pill-btn" onClick={() => document.getElementById("feel")?.scrollIntoView({ behavior: "smooth" })}>Rate now</button>}
          </div>
        </div>
      ))}

      <Fuel totals={totals} goals={s.goals} />
      <CaffeineCard doses={doses} now={now} bed={bed} halfLife={s.settings.halfLifeMin} cafNow={cafNow} cafBed={cafBed} />
      <Stack now={now} />
      <Feel now={now} todays={todays} />
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
  const W = 320, H = 96, pl = 26, pr = 6, pt = 8, pb = 16, max = Math.max(200, Math.ceil(Math.max(...Array.from({ length: 37 }, (_, i) => caffeineAt(doses, t0 + i * 30 * MIN, halfLife))) / 100) * 100);
  const x = (t: number) => pl + ((t - t0) / (t1 - t0)) * (W - pl - pr), y = (mg: number) => pt + (1 - mg / max) * (H - pt - pb);
  // Always end exactly on `b`, so the solid past meets the "now" dot instead of stopping up to 5 min short.
  const pts = (a: number, b: number) => { const p: string[] = []; const push = (t: number) => p.push(`${x(t).toFixed(1)},${y(caffeineAt(doses, t, halfLife)).toFixed(1)}`); for (let t = a; t < b; t += 5 * MIN) push(t); push(b); return p.join(" "); };
  const cut = Math.min(Math.max(now, t0), t1);
  return (
    <div className="card">
      <h3>Caffeine <span>{cafNow} mg now · {cafBed} mg at {clock(bed)}</span></h3>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Caffeine in your body today: ${cafNow} mg now, ${cafBed} mg at bedtime`}>
        {[0, max / 2, max].map((v) => <g key={v}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--c-track)" /><text x={pl - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--c-dim)">{v}</text></g>)}
        {[6, 12, 18, 24].map((h) => <text key={h} x={x(t0 + (h - 6) * 60 * MIN)} y={H - 3} textAnchor="middle" fontSize="9" fill="var(--c-dim)">{String(h % 24).padStart(2, "0")}</text>)}
        <polygon points={`${x(t0)},${y(0)} ${pts(t0, cut)} ${x(cut)},${y(0)}`} fill="var(--caf)" fillOpacity=".18" />
        <polyline points={pts(t0, cut)} fill="none" stroke="var(--caf)" strokeWidth="2.2" />
        <polyline points={pts(cut, t1)} fill="none" stroke="var(--caf)" strokeWidth="2" strokeDasharray="3 3" strokeOpacity=".7" />
        {now >= t0 && now <= t1 && <circle cx={x(now)} cy={y(cafNow)} r="3.5" fill="var(--caf)" />}
        {bed <= t1 && <circle cx={x(bed)} cy={y(cafBed)} r="3" fill="none" stroke="var(--caf)" strokeWidth="1.5" />}
      </svg>
      <div className="row2">
        <button type="button" className="pill-btn" onClick={() => go("log", "drink")}>+ Drink</button>
        <button type="button" className="pill-btn" onClick={() => act.addEntry({ kind: "drink", at: Date.now(), name: "Filter coffee", ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 })}>+ Usual coffee</button>
      </div>
    </div>
  );
}

function Stack({ now }: { now: number }) {
  // Select the stored array itself; filtering inside the selector would hand React a new array
  // on every read and loop forever.
  const all = useStore((s) => s.supplements);
  const supps = all.filter((x) => x.active);
  const entries = useStore((s) => s.entries);
  const day = localDay(now);
  const answers = new Map(entries.filter((e): e is EntryOf<"supp"> => e.kind === "supp" && localDay(e.at) === day).map((e) => [e.suppId, e]));
  const set = (id: string, status: "taken" | "skipped") => {
    const cur = answers.get(id);
    if (cur && cur.status === status) act.removeEntry(cur.id);
    else if (cur) act.updateEntry(cur.id, { status } as Partial<Entry>);
    else act.addEntry({ kind: "supp", at: Date.now(), suppId: id, status });
  };
  const taken = [...answers.values()].filter((a) => a.status === "taken").length;
  return (
    <div className="card">
      <h3>Stack <span>{taken} of {supps.length} taken</span></h3>
      {supps.map((s) => {
        const a = answers.get(s.id);
        return (
          <div className="stack-row" key={s.id}>
            <span>{s.name} {s.dose}<small>{`${String(Math.floor(s.at / 60)).padStart(2, "0")}:${String(s.at % 60).padStart(2, "0")}`}{a ? ` · ${a.status} ${clock(a.at)}` : ""}</small></span>
            <div className="tick">
              <button type="button" className="yes" aria-pressed={a?.status === "taken"} aria-label={`Took ${s.name}`} onClick={() => set(s.id, "taken")}>✓</button>
              <button type="button" className="no" aria-pressed={a?.status === "skipped"} aria-label={`Skipped ${s.name}`} onClick={() => set(s.id, "skipped")}>✗</button>
            </div>
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
function Feel({ now, todays }: { now: number; todays: Entry[] }) {
  const last = [...todays].reverse().find((e): e is EntryOf<"feel"> => e.kind === "feel");
  const recent = last && now - last.at < 2 * 60 * MIN ? last : undefined;
  const val = (k: "energy" | "mood" | "focus" | "stress") => recent?.[k] ?? (k === "stress" ? 4 : 6);
  const set = (k: "energy" | "mood" | "focus" | "stress", v: number) => {
    if (recent) act.updateEntry(recent.id, { [k]: v } as Partial<Entry>);
    else act.addEntry({ kind: "feel", at: Date.now(), energy: val("energy"), mood: val("mood"), focus: val("focus"), stress: val("stress"), [k]: v });
  };
  return (
    <div className="card" id="feel">
      <h3>How do you feel? <span>{last ? `last rated ${clock(last.at)}` : "not rated today"}</span></h3>
      {(["energy", "mood", "focus", "stress"] as const).map((k) => (
        <div className="feel" key={k}>
          <span>{k[0].toUpperCase() + k.slice(1)}</span>
          <input type="range" min={1} max={10} value={val(k)} aria-label={k} onChange={(e) => set(k, +e.target.value)} />
          <em>{val(k)} · {WORDS[k][Math.min(4, Math.floor((val(k) - 1) / 2))]}</em>
        </div>
      ))}
    </div>
  );
}
