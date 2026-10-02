/**
 * How now? — the check-in, at the top of Today. One tap per feeling on a 1–10 row (the slider's
 * detail without the dragging), then optionally what you were up to since the last one. It stays
 * open while you're answering, shrinks to one line once you've rated, and asks again after ~2 hours.
 * Owner, 2 Oct: keep the slider's detail; one word of your own; the small reward; not cluttered.
 */

import { useMemo, useState } from "react";
import { act, getState, useStore } from "../lib/store";
import type { Entry } from "../lib/types";
import { clock } from "../lib/time";
import {
  ASK_AGAIN_MS, DOING_SHOWN, FEEL_KEYS, OPEN_MS, doingOrder, feelChange, feelState, inferredDoing, labelOf, latestFeel,
  phraseOf, previousCheckIn, sinceLast, tagOf, type FeelKey,
} from "../lib/feel";
import { BETWEEN, gaps } from "../lib/detectors/between";
import { CAF_SLEEP } from "../lib/caffeine-sleep";
import { localDay } from "../lib/time";
import { FeelSlider } from "./FeelSlider";

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
  const toggle = (tag: string) => {
    if (!open) return;
    const cur = open.doing ?? [];
    act.updateEntry(open.id, { doing: cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag] } as Partial<Entry>);
  };
  const addOwn = () => { const t = tagOf(own); if (t && open) { if (!(open.doing ?? []).includes(t)) toggle(t); setOwn(""); } };

  // Mornings: last night's sleep, one entry per night (re-tapping changes it). It's what tells the app
  // whether caffeine at bedtime goes with worse sleep for you (caffeine-sleep.ts).
  const morning = new Date(now).getHours() < CAF_SLEEP.morningUntilHour;
  const night = entries.find((e): e is Extract<Entry, { kind: "sleep" }> => e.kind === "sleep" && localDay(e.at) === localDay(now));
  const rateSleep = (patch: { rating?: number; slow?: boolean }) => {
    if (night) act.updateEntry(night.id, patch as Partial<Entry>);
    else act.addEntry({ kind: "sleep", at: Date.now(), ...patch });
  };
  const sleepOpen = morning && (!night || now - night.at < OPEN_MS || again);

  const order = useMemo(() => doingOrder(entries, now), [entries, now]);
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
        <span>Rated {clock(recent.at)}{set ? ` · ${set}` : ""}</span>
        <button type="button" className="pill-btn" onClick={() => setAgain(true)}>{morning && night?.rating == null ? "Rate sleep" : "Rate again"}</button>
      </div>
    );
  }

  return (
    <div className="card hownow" id="feel">
      <h3>How now? <span>{open ? "saved as you tap" : last ? `last ${clock(last.at)}` : "tap or slide any you want to log"}</span></h3>
      {sleepOpen && <div className="hn-sleep">
        <FeelSlider label="Sleep" name="sleep" value={night?.rating} word={sleepWord} color="var(--ok)" empty="last night" onChange={(n) => rateSleep({ rating: n })} />
        <div className="hn-tags"><button type="button" aria-pressed={!!night?.slow} onClick={() => rateSleep({ slow: !night?.slow })}>took long to fall asleep</button></div>
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
          <input value={own} onChange={(e) => setOwn(e.target.value)} placeholder="one word: sauna, reading…" aria-label="Your own, one word" maxLength={24} />
          <button type="submit" className="pill-btn" disabled={!tagOf(own)}>Add</button>
        </form>}
      </div>}

      {open && <NoteField key={open.id} id={open.id} initial={open.note ?? ""} />}

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
 * this seriously"). Saved on the check-in when you leave the field or press Enter; the nightly
 * read-back quotes it.
 */
function NoteField({ id, initial }: { id: string; initial: string }) {
  const [text, setText] = useState(initial);
  const save = () => { const t = text.trim(); if (t !== initial) act.updateEntry(id, { note: t || undefined } as Partial<Entry>); };
  return (
    <form className="hn-note" onSubmit={(e) => { e.preventDefault(); save(); (document.activeElement as HTMLElement | null)?.blur(); }}>
      <label className="hn-head" htmlFor={`note-${id}`}><b>Why?</b><em>optional · in your words</em></label>
      <input id={`note-${id}`} value={text} onChange={(e) => setText(e.target.value)} onBlur={save} maxLength={200} placeholder="deadline, slept badly, good news…" aria-label="Why? A note on this check-in" />
    </form>
  );
}
