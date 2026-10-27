/**
 * How now? — the check-in, at the top of Today. One tap per feeling on a 1–10 row (the slider's
 * detail without the dragging), then optionally what you were up to since the last one. It stays
 * open while you're answering, shrinks to one line once you've rated, and asks again after ~2 hours.
 * Owner, 2 Oct: keep the slider's detail; your own words (since 27 Oct every word kept, several at once); the small reward; not cluttered.
 */

import { useMemo, useRef, useState } from "react";
import { act, getState, useStore } from "../lib/store";
import type { Entry } from "../lib/types";
import { clock, stamp } from "../lib/time";
import {
  ASK_AGAIN_MS, DOING_SHOWN, FEEL_KEYS, OPEN_MS, doingOrder, feelChange, feelState, inferredDoing, labelOf, latestFeel,
  phraseOf, previousCheckIn, sinceLast, tagOf, tagsOf, type FeelKey,
} from "../lib/feel";
import { BETWEEN, gaps } from "../lib/detectors/between";
import { CAF_SLEEP } from "../lib/caffeine-sleep";
import { localDay } from "../lib/time";
import { FeelSlider } from "./FeelSlider";
import { useBand } from "../lib/band-client";
import { sleepScore } from "../lib/sleepscore";
import { fellAsleep, nights } from "../lib/sleep";
import { nightLabel, nightTagOrder, PHONE_STEPS, phoneLabel } from "../lib/lastnight";

const WORDS: Record<FeelKey, string[]> = {
  energy: ["drained", "low", "ok", "steady", "high"], mood: ["low", "flat", "ok", "good", "great"],
  focus: ["foggy", "scattered", "ok", "sharp", "locked in"], stress: ["calm", "low", "some", "high", "maxed"],
};
const wordOf = (k: FeelKey, v: number) => WORDS[k][Math.min(4, Math.floor((v - 1) / 2))];
const COLOR: Record<FeelKey, string> = { energy: "var(--gym)", mood: "var(--mood)", focus: "var(--supp)", stress: "var(--hr)" };
const SLEEP_WORDS = ["awful", "poor", "ok", "good", "great"];
const sleepWord = (v: number) => SLEEP_WORDS[Math.min(4, Math.floor((v - 1) / 2))];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const signed = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `−${-d}` : "±0");

/** `always`: the /now page — open even if you rated recently (until you tap Done). */
export function HowNow({ now, always = false }: { now: number; always?: boolean }) {
  const entries = useStore((s) => s.entries);
  const workouts = useStore((s) => s.workouts);
  const [again, setAgain] = useState(false);
  const [closedId, setClosedId] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [own, setOwn] = useState("");
  const [sleepEdit, setSleepEdit] = useState(false);
  const [nightOwn, setNightOwn] = useState<string | null>(null);
  const [noting, setNoting] = useState(false);

  const last = latestFeel(entries);
  const open = last && now - last.at < OPEN_MS && now >= last.at ? last : undefined;
  const recent = last && now - last.at < ASK_AGAIN_MS ? last : undefined;
  const st = feelState(entries, now);
  const expanded = (open && closedId !== open.id) || !recent || again || (always && closedId !== last?.id);

  // What the logs already say happened since the last check-in today: pre-ticked.
  const since = (() => {
    if (open) return previousCheckIn(entries, open)?.at;
    const d = new Date(now); const prev = last && new Date(last.at).toDateString() === d.toDateString() ? last.at : undefined;
    return prev;
  })();
  const startOfDay = new Date(now).setHours(5, 0, 0, 0);
  const inferred = inferredDoing(entries, workouts, since ?? startOfDay, now);

  const rate = (k: FeelKey, v: number) => {
    const c = feelChange(getState().entries, Date.now(), k, v);
    if (c.op === "update") act.updateEntry(c.id, c.patch as Partial<Entry>);
    else act.addEntry({ ...c.entry, ...(inferred.length ? { doing: inferred } : {}) });
    setAgain(false);
  };
  // A note on its own is a check-in too (PLAN 89; owner, 13 Oct: "leave notes on mood logging, like head hurts, or
  // parents made me mad"): written first, the sliders you touch next join it.
  const noteNew = (note: string) => { act.addEntry({ kind: "feel", at: Date.now(), note, ...(inferred.length ? { doing: inferred } : {}) }); setNoting(false); };
  const toggle = (tag: string) => {
    if (!open) return;
    const cur = open.doing ?? [];
    act.updateEntry(open.id, { doing: cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag] } as Partial<Entry>);
  };
  // every word kept, several tags at once (27 Oct: "one drink and work" became "one")
  const addOwn = () => {
    const cur = open?.doing ?? [], ts = tagsOf(own).filter((t) => !cur.includes(t));
    if (open && ts.length) act.updateEntry(open.id, { doing: [...cur, ...ts] } as Partial<Entry>);
    if (open) setOwn("");
  };

  // Mornings: last night's sleep, one entry per night (re-tapping changes it). It's what tells the app
  // whether caffeine at bedtime goes with worse sleep for you (caffeine-sleep.ts).
  const hour = new Date(now).getHours(), morning = hour >= CAF_SLEEP.morningFromHour && hour < CAF_SLEEP.morningUntilHour;
  const night = entries.find((e): e is Extract<Entry, { kind: "sleep" }> => e.kind === "sleep" && localDay(e.at) === localDay(now));
  const rateSleep = (patch: { rating?: number; slow?: boolean; tags?: string[]; phoneMin?: number }) => {
    if (night) act.updateEntry(night.id, patch as Partial<Entry>);
    else act.addEntry({ kind: "sleep", at: Date.now(), ...patch });
  };
  // Asked once a morning (owner, 9 Oct: "i logged my sleep score … now it asks again when i click log again"): open until
  // it's rated, and for a moment after to adjust; from then on one line you can tap to change — "Rate again" is for feelings.
  const sleepOpen = morning && (!night || night.rating == null || now - night.at < OPEN_MS || sleepEdit);
  const sleptLine = morning && !sleepOpen && night?.rating != null;
  // What last night held, in a tap (PLAN 90): with gf, worked late, out — and your own words; and the phone (PLAN 88).
  const nightOrder = useMemo(() => nightTagOrder(entries, now), [entries, now]);
  const nightTags = night?.tags ?? [];
  const toggleNight = (t: string) => rateSleep({ tags: nightTags.includes(t) ? nightTags.filter((x) => x !== t) : [...nightTags, t] });
  const addNightOwn = () => { const ts = tagsOf(nightOwn ?? "").filter((t) => !nightTags.includes(t)); if (ts.length) rateSleep({ tags: [...nightTags, ...ts] }); setNightOwn(null); };

  const order = useMemo(() => doingOrder(entries, now), [entries, now]);
  // Last night's minutes to fall asleep from the band, when it has the night (PLAN 77) — no need to ask then.
  const band = useBand().data, bandSleep = band?.sleep;
  const fell = useMemo(() => (bandSleep ? fellAsleep(bandSleep, now) : null), [bandSleep, now]);
  // Last night out of 100 (PLAN 97), with your rating in it as you move it; the parts are on Insights → Sleep.
  const rated = night?.rating;
  const score = useMemo(() => {
    if (!band) return null;
    const ns = nights(band.sleep, band.hr, band.rhr, band.hrv), n = ns.find((x) => x.day === localDay(now));
    return n ? sleepScore(n, rated, ns) : null;
  }, [band, now, rated]);
  const scoreLink = score && <a className="hn-score" href="#insights/sleep" data-score={score.score}>{score.score}/100{rated == null ? " so far" : ""}</a>;
  const ticked = open?.doing ?? [];
  const shown = [...new Set([...ticked, ...order.slice(0, DOING_SHOWN)])];
  const hidden = order.filter((t) => !shown.includes(t));
  const reward = open ? sinceLast(entries, open, workouts) : null;
  const pairs = useMemo(() => gaps(entries.filter((e) => e.at >= now - BETWEEN.days * 86_400_000)).length, [entries, now]);
  const needPairs = BETWEEN.minWith + BETWEEN.minWithout;

  if (!expanded && recent) {
    const set = FEEL_KEYS.filter((k) => recent[k] != null).map((k) => `${k} ${recent[k]}`).join(" · ");
    return (
      <div className="hownow calm-line" id="feel">
        <span>{set ? "Rated" : "Noted"} {clock(recent.at)}{set ? ` · ${set}` : ""}{recent.note ? <em className="hn-said"> · “{recent.note}”</em> : null}</span>
        <span className="hn-btns">
          <button type="button" className="pill-btn" aria-expanded={noting} onClick={() => setNoting(!noting)}>{recent.note ? "Edit note" : "Add a note"}</button>
          <button type="button" className="pill-btn" onClick={() => { setAgain(true); setNoting(false); }}>{morning && night?.rating == null ? "Rate sleep" : "Rate again"}</button>
        </span>
        {noting && <NoteField key={recent.id} id={recent.id} initial={recent.note ?? ""} onSaved={() => setNoting(false)} autoFocus />}
      </div>
    );
  }

  return (
    <div className="card hownow" id="feel">
      <h3>How now? <span>{open ? "saved as you tap" : last ? `last ${stamp(last.at, Date.now())}` : "tap or slide any you want to log"}</span></h3>
      {sleptLine && <div className="hn-slept"><span>Last night <b>{night!.rating} / 10</b>{scoreLink && <> · {scoreLink}</>}{night!.slow ? " · slow to fall asleep" : ""}{nightTags.length ? ` · ${nightTags.map(nightLabel).join(", ")}` : ""}{night?.phoneMin != null ? ` · ${phoneLabel(night.phoneMin)}` : ""}</span>
        <button type="button" aria-label="Change last night's sleep" onClick={() => setSleepEdit(true)}>change</button></div>}
      {sleepOpen && <div className="hn-sleep">
        <FeelSlider label="Sleep" name="sleep" value={night?.rating} word={sleepWord} color="var(--ok)" empty="last night" onChange={(n) => rateSleep({ rating: n })} />
        {fell ? <p className="hn-fell" data-fell={fell.min}>Fell asleep in <b>{fell.min} min</b> — from your band{fell.usual != null ? `, ${fell.min > fell.usual + 10 ? "longer than" : fell.min < fell.usual - 10 ? "quicker than" : "about"} your usual ${fell.usual}` : ""}{scoreLink && <> · score {scoreLink}</>}</p>
          : <div className="hn-tags"><button type="button" aria-pressed={!!night?.slow} onClick={() => rateSleep({ slow: !night?.slow })}>took long to fall asleep</button></div>}
        {/* once it's rated, like "What were you up to?" — the card stays small until you're answering (owner, 2 Oct: "big and bad on phone") */}
        {(night?.rating != null || nightTags.length > 0 || night?.phoneMin != null) && <>
        <div className="hn-head"><b>Last night</b><em>optional · what it held</em></div>
        <div className="hn-tags hn-night" role="group" aria-label="Last night">
          {[...new Set([...nightOrder, ...nightTags])].map((t) => <button key={t} type="button" aria-pressed={nightTags.includes(t)} onClick={() => toggleNight(t)}>{nightLabel(t)}</button>)}
          {nightOwn == null && <button type="button" className="hn-more" onClick={() => setNightOwn("")}>+ your own</button>}
        </div>
        {nightOwn != null && <form className="hn-own" onSubmit={(e) => { e.preventDefault(); addNightOwn(); }}>
          <input autoFocus value={nightOwn} onChange={(e) => setNightOwn(e.target.value)} placeholder="sauna, argument, one drink and gaming…" aria-label="Last night, your own word" maxLength={80} />
          <button type="submit" className="pill-btn" disabled={!tagOf(nightOwn)}>Add</button>
        </form>}
        {/* owner, 13 Oct: "a question in the morning … estimated time of phone before bed … 0 to like an hour or more" */}
        <div className="hn-head"><b>Phone before sleep</b><em>about how long</em></div>
        <div className="hn-tags hn-phone" role="radiogroup" aria-label="Phone before sleep">
          {PHONE_STEPS.map((p) => <button key={p.min} type="button" role="radio" aria-checked={night?.phoneMin === p.min} onClick={() => rateSleep({ phoneMin: night?.phoneMin === p.min ? undefined : p.min })}>{p.label}</button>)}
        </div>
        </>}
      </div>}
      <div className="hn-sliders">
        {FEEL_KEYS.map((k) => (
          <FeelSlider key={k} label={cap(k)} name={k} value={open?.[k]} ghost={open?.[k] == null ? st[k].last?.v : undefined}
            word={(v) => wordOf(k, v)} color={COLOR[k]} inverted={k === "stress"} onChange={(n) => rate(k, n)} />
        ))}
      </div>

      {open && <div className="hn-doing">
        <div className="hn-head"><b>What were you up to?</b><em>{since ? `since ${clock(since)}` : "today"} · optional</em></div>
        <div className="hn-tags" role="group" aria-label="What were you up to">
          {[...shown, ...(more ? hidden : [])].map((t) => (
            <button key={t} type="button" aria-pressed={ticked.includes(t)} onClick={() => toggle(t)}>{labelOf(t)}</button>
          ))}
          {!more && <button type="button" className="hn-more" onClick={() => setMore(true)}>{hidden.length ? `+ ${hidden.length} more / your own` : "+ your own"}</button>}
        </div>
        {more && <form className="hn-own" onSubmit={(e) => { e.preventDefault(); addOwn(); }}>
          <input value={own} onChange={(e) => setOwn(e.target.value)} placeholder="sauna, reading, one drink and work…" aria-label="Your own words" maxLength={80} />
          <button type="submit" className="pill-btn" disabled={!tagOf(own)}>Add</button>
        </form>}
      </div>}

      {open ? <NoteField key={open.id} id={open.id} initial={open.note ?? ""} />
        : noting ? <NoteField key="new" initial="" onNew={noteNew} autoFocus />
        : <button type="button" className="hn-addnote" onClick={() => setNoting(true)}>+ Add a note <em>why you feel this way</em></button>}

      {open && reward && reward.changes.length > 0 && <p className="hn-reward" role="status">
        Since {clock(reward.at)}: {reward.changes.map((c) => `${c.k} ${signed(c.d)}`).join(", ")}{reward.between.length ? ` · ${reward.between.map(phraseOf).join(", ")} in between` : ""}.
      </p>}
      {open && pairs < needPairs && <p className="note">{pairs} of {needPairs} check-in pairs so far. From {needPairs}, Insights starts telling you what changes how you feel.</p>}

      {open && <button type="button" className="pill-btn" onClick={() => setClosedId(open.id)}>Done</button>}
    </div>
  );
}

/**
 * Why you feel this way, in your words (owner, 2 Oct: "a reason why i am stressed/sad… ai should take
 * this seriously"; 13 Oct: "head hurts, or parents made me mad"). Saved on the check-in when you leave the
 * field or press Enter; with no check-in open (`onNew`) the note starts one. The AI and the nightly read-back
 * quote it.
 */
export function NoteField({ id, initial, onNew, onSaved, autoFocus }: { id?: string; initial: string; onNew?: (note: string) => void; onSaved?: () => void; autoFocus?: boolean }) {
  const [text, setText] = useState(initial);
  // Enter saves and then blurs, which saves again: only write what changed since the last write (a second new check-in otherwise).
  const wrote = useRef(initial.trim());
  const save = () => {
    const t = text.trim();
    if (t === wrote.current) return;
    wrote.current = t;
    if (id) act.updateEntry(id, { note: t || undefined } as Partial<Entry>); else if (t) onNew?.(t);
  };
  const fid = `note-${id ?? "new"}`;
  return (
    <form className="hn-note" onSubmit={(e) => { e.preventDefault(); save(); (document.activeElement as HTMLElement | null)?.blur(); onSaved?.(); }}>
      <label className="hn-head" htmlFor={fid}><b>Why?</b><em>optional · in your words</em></label>
      <input id={fid} autoFocus={autoFocus} value={text} onChange={(e) => setText(e.target.value)} onBlur={save} maxLength={200} placeholder="head hurts, parents, deadline…" aria-label="Why? A note on this check-in" />
    </form>
  );
}
