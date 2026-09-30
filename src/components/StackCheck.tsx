/**
 * Stack check on screen: About me (Settings), badges in the stack editor (Log), the full table
 * (Insights) and a Today alert for "avoid" flags only. Logic: lib/stackcheck.
 */

import { useMemo, useState } from "react";
import { act, useStore, type Profile } from "../lib/store";
import { badgeFor, check, resolveAll, type Badge, type Flag, type Report } from "../lib/stackcheck/check";
import type { Verdict } from "../lib/stackcheck/kb";
import { DAY } from "../lib/time";

const WORD: Record<Verdict | "unknown", string> = { avoid: "Avoid", caution: "Caution", timing: "Timing", mixed: "Mixed evidence", "may-help": "May help", none: "No known link", unknown: "Not checked yet" };

/** The check for the signed-in account: active stack + About me + drinks logged in the last 30 days. */
export function useStackCheck(includePaused = false): Report {
  const supplements = useStore((s) => s.supplements);
  const profile = useStore((s) => s.profile);
  const entries = useStore((s) => s.entries);
  const recent = useMemo(() => {
    const since = Date.now() - 30 * DAY;
    const drinks = entries.filter((e) => e.kind === "drink" && e.at > since);
    return { alcohol: drinks.some((d) => d.kind === "drink" && d.alcoholG > 0), caffeine: drinks.some((d) => d.kind === "drink" && d.caffeineMg > 0) };
  }, [entries]);
  return useMemo(() => check({
    stack: supplements.filter((s) => s.active || includePaused).map((s) => s.name),
    meds: profile.meds, conditions: profile.conditions,
    drinks: [...(recent.alcohol ? ["alcohol" as const] : []), ...(recent.caffeine ? ["caffeine" as const] : [])],
  }), [supplements, profile, recent, includePaused]);
}

export function VerdictChip({ v }: { v: Verdict | "unknown" }) {
  return <span className={`vchip v-${v}`}>{WORD[v]}</span>;
}

/** One flag, in full: what, why, how sure, where it's from. */
export function FlagText({ f }: { f: Flag }) {
  return (
    <div className="flag">
      <div><VerdictChip v={f.rule.verdict} /> <b>{f.a.label} + {f.b.label}</b></div>
      <p>{f.rule.say}</p>
      <small>Evidence: {f.rule.grade} · reviewed {f.rule.reviewed}{f.rule.verified ? "" : " · to verify"} · {f.rule.sources.map((s, i) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{i ? ", " : ""}{s.title}</a>)}</small>
    </div>
  );
}

/** The badge next to a supplement in the stack editor; tap for the reasons. */
export function StackBadge({ name, report }: { name: string; report: Report }) {
  const [open, setOpen] = useState(false);
  const b: Badge = badgeFor(name, report);
  if (!name.trim()) return null;
  return <div className="sbadge">
    <button type="button" className="linkish" onClick={() => setOpen(!open)} aria-expanded={open} disabled={!b.flags.length}>
      <VerdictChip v={b.verdict} />{b.flags.length > 0 && <span> {b.flags.length === 1 ? `with ${other(b.flags[0], name)}` : `${b.flags.length} notes`} {open ? "▴" : "▾"}</span>}
    </button>
    {open && b.flags.map((f) => <FlagText key={f.rule.a + f.rule.b} f={f} />)}
  </div>;
}
const other = (f: Flag, name: string) => (f.a.label === name ? f.b.label : f.a.label);

/* ------------------------------------------------------------------ About me */

function Tags({ label, hint, values, onChange, recognise }: { label: string; hint: string; values: string[]; onChange: (v: string[]) => void; recognise?: boolean }) {
  const [draft, setDraft] = useState("");
  const add = () => { const v = draft.trim(); if (v && !values.includes(v)) onChange([...values, v]); setDraft(""); };
  const known = recognise && draft.trim() ? resolveAll(draft) : [];
  return (
    <div className="tags">
      <span className="tl">{label}</span>
      <div className="chips">
        {values.map((v) => <span className="chip" key={v}>{v}{recognise && !resolveAll(v).length && <i title="Not in the checked list yet"> ?</i>}<button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>✕</button></span>)}
      </div>
      <div className="row-add">
        <input value={draft} placeholder={hint} aria-label={label} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" className="pill-btn" disabled={!draft.trim()} onClick={add}>Add</button>
      </div>
      {recognise && draft.trim().length > 2 && <small className="note">{known.length ? `Recognised: ${known.map((k) => k.name).join(", ")}` : "Not in the checked list yet — it's saved, and the AI phase will look it up."}</small>}
    </div>
  );
}

export function AboutMe() {
  const p = useStore((s) => s.profile);
  const set = (patch: Partial<Profile>) => act.setProfile({ ...p, ...patch });
  return (
    <div className="card" id="about">
      <h3>About me <span>used by the stack check</span></h3>
      <Tags label="Conditions" hint="psoriasis, asthma…" values={p.conditions} onChange={(conditions) => set({ conditions })} recognise />
      <Tags label="Medications" hint="name as on the box: Daivobet, Otezla…" values={p.meds} onChange={(meds) => set({ meds })} recognise />
      <Tags label="Allergies" hint="nuts, penicillin…" values={p.allergies} onChange={(allergies) => set({ allergies })} />
      <label className="field">Notes<textarea rows={2} value={p.notes} placeholder="Anything else worth knowing" onChange={(e) => set({ notes: e.target.value })} /></label>
      <p className="note">Synced to your account only. Everything you take is checked against this — see Insights → Stack check.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ Insights panel */

export function StackCheckPanel() {
  const r = useStackCheck();
  const profile = useStore((s) => s.profile);
  const real = r.flags.filter((f) => f.rule.verdict !== "none");
  const quiet = r.flags.filter((f) => f.rule.verdict === "none");
  return (
    <section className="p w12" id="stackcheck">
      <h2>Stack check <span>{profile.conditions.length || profile.meds.length ? `against ${[...profile.conditions, ...profile.meds].join(", ")}` : "add conditions and medications in Settings → About me"}</span></h2>
      {real.length === 0 && <p className="needs">Nothing you take has a known clash{profile.conditions.length ? ` with ${profile.conditions.join(", ")}` : ""}.</p>}
      {real.length > 0 && <table>
        <thead><tr><th>Verdict</th><th>What</th><th>Why</th><th>Evidence</th></tr></thead>
        <tbody>{real.map((f) => (
          <tr key={f.rule.a + f.rule.b}>
            <td><VerdictChip v={f.rule.verdict} /></td>
            <td>{f.a.label} + {f.b.label}</td>
            <td>{f.rule.say}</td>
            <td className="src">{f.rule.grade}{f.rule.verified ? "" : " · to verify"}<br />{f.rule.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.title}</a>)}</td>
          </tr>
        ))}</tbody>
      </table>}
      {quiet.length > 0 && <p className="note">Checked, no link found: {quiet.map((f) => `${f.a.label} + ${f.b.label}`).join(", ")}.</p>}
      {r.ask.length > 0 && <div className="sub"><h3>Worth asking your doctor about</h3>
        <ul className="notes">{r.ask.map((a) => <li key={a.item}>{a.say} <a href={a.sources[0].url} target="_blank" rel="noreferrer">source</a></li>)}</ul></div>}
      {r.unknown.length > 0 && <p className="note">Not checked yet: {r.unknown.map((t) => t.label).join(", ")} — the AI phase will research these.</p>}
      <p className="note">Curated from guidelines, drug labels and studies; every row links its source. Not medical advice — talk to your doctor before starting or stopping anything.</p>
    </section>
  );
}

/* ------------------------------------------------------------------ Today: reds only */

export function StackAlert() {
  const r = useStackCheck();
  const red = r.flags.filter((f) => f.rule.verdict === "avoid");
  if (!red.length) return null;
  return (
    <a className="noticed-line alert" href="#insights" onClick={() => setTimeout(() => document.getElementById("stackcheck")?.scrollIntoView({ behavior: "smooth" }), 150)}>
      <span><small>Stack check</small>{red.map((f) => `${f.a.label} + ${f.b.label}`).join("; ")}: avoid combining — tap for why.</span>
    </a>
  );
}
