/**
 * Today's brief (owner, 13 Nov: "A A A … make theese better and smarter"; canvas Today A, "the morning brief"). The top
 * of Today: last night and this morning in a line (lib/brief), one thing to watch, and what to do now — the stack that's
 * due (one tap, as For you's card did), a check-in when the last was 4 hours ago or more, the session up next with its
 * first lift's target. Each row only when it applies; nothing to say and nothing to do → nothing drawn.
 */

import { useMemo, useState } from "react";
import { useBand } from "../lib/band-client";
import { briefLine, briefWatch, checkInDue, GREET, usualOf } from "../lib/brief";
import type { Moment } from "../lib/moment";
import { readiness } from "../lib/readiness";
import { nights } from "../lib/sleep";
import { sleepScore } from "../lib/sleepscore";
import { act, useStore } from "../lib/store";
import { addDays, clock, dayLabel, localDay } from "../lib/time";
import { nextTemplate, type LoggedSet } from "../lib/training";
import { targetsFor } from "../lib/workouthome";
import type { EntryOf } from "../lib/types";

export type BriefStack = { title: string; body: string; many: boolean; onTook: () => void; onPick: () => void };

export function Brief({ now, moment, cafBed, bed, stack }: { now: number; moment: Moment; cafBed: number; bed: number; stack: BriefStack | null }) {
  const band = useBand().data, entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), templates = useStore((s) => s.templates);
  const today = localDay(now);
  const sets = useMemo(() => entries.filter((e): e is EntryOf<"set"> => e.kind === "set") as LoggedSet[], [entries]);
  const facts = useMemo(() => {
    if (!band) return { night: null, hrv: null, ready: null };
    const ns = nights(band.sleep, band.hr, band.rhr, band.hrv), n = ns.find((x) => x.day === today) ?? null;
    const rating = (entries.find((e) => e.kind === "sleep" && localDay(e.at) === today && e.rating != null) as { rating?: number } | undefined)?.rating;
    const usual = usualOf(band.hrv, today), h = band.hrv?.[today];
    const r = n ? readiness(today, ns, rating, sets, now, { hrv: band.hrv, rhr: band.rhr }) : null;
    return { night: n ? { asleepMin: n.asleep, score: sleepScore(n, rating, ns).score } : null, hrv: h != null && usual != null ? { today: h, usual } : null, ready: r ? { score: r.score, word: r.word } : null };
  }, [band, entries, sets, today, now]);
  const b = { moment, ...facts, cafBed, bedClock: clock(bed) };
  const line = briefLine(b), watch = briefWatch(b);
  // the session up next, until 21:00, when none is running or was started today
  const running = workouts.some((w) => w.endedAt == null);
  const dayStart = new Date(now); dayStart.setHours(5, 0, 0, 0);
  const trainedToday = workouts.some((w) => w.startedAt >= dayStart.getTime() && w.startedAt <= now);
  const next = !running && !trainedToday && new Date(now).getHours() < 21 ? nextTemplate(templates, workouts) : undefined;
  const first = next ? targetsFor(next, sets).find((t) => t.kg != null) ?? null : null;
  const lastFeel = entries.filter((e) => e.kind === "feel" && e.at <= now).reduce<number | null>((a, e) => (a == null || e.at > a ? e.at : a), null);
  const feelDue = checkInDue(lastFeel, now);
  // a row that's been done stays, as done, until Today is opened again: a row vanishing under a finger moved the page,
  // and the next tap landed on the row below (found 13 Nov — a check-in slider tap started a workout)
  const [asked] = useState(() => ({ feel: feelDue, stack: stack ? { title: stack.title, body: stack.body, many: stack.many } : null }));
  const [took, setTook] = useState(false);
  const feel = feelDue || asked.feel, stackDone = !stack && asked.stack ? asked.stack : took && stack ? stack : null;
  if (!line && !watch && !stack && !stackDone && !feel && !next) return null;
  return (
    <section className="card brief" aria-label="Your brief">
      <span className="brief-k">{GREET[moment]}</span>
      {line && <p className="brief-say">{line}</p>}
      {watch && <p className="brief-watch">{watch}</p>}
      {(stack || stackDone || feel || next) && <div className="brief-now">
        {/* taken: the same row, its buttons kept (disabled) so nothing under it moves */}
        {(stackDone ?? stack) && (() => { const r = (stackDone ?? stack)!, done = !!stackDone; return (
          <div className={`brief-row${done ? " done" : ""}`} data-row="stack"><div><b>{r.title}</b><span>{done ? "✓ Taken" : r.body}</span></div>
            <span className="brief-acts"><button type="button" className="pill-btn pri" disabled={done} onClick={() => { setTook(true); stack?.onTook(); }}>{done ? "Done" : r.many ? "Took all" : "Took it"}</button>
              {r.many && <button type="button" className="pill-btn" disabled={done} onClick={() => stack?.onPick()}>Pick…</button>}</span></div>); })()}
        {feel && !feelDue ? <div className="brief-row done" data-row="feel"><div><b>How do you feel?</b><span>✓ Checked in {lastFeel ? clock(lastFeel) : ""}</span></div></div>
          : feel && <div className="brief-row" data-row="feel"><div><b>How do you feel?</b><span>{lastFeel ? `last ${localDay(lastFeel) === today ? clock(lastFeel) : localDay(lastFeel) === addDays(today, -1) ? `yesterday ${clock(lastFeel)}` : dayLabel(lastFeel)}` : "not yet"}</span></div>
          <button type="button" className="pill-btn" onClick={() => document.getElementById("feel")?.scrollIntoView({ block: "center", behavior: "smooth" })}>Check in</button></div>}
        {next && <div className="brief-row" data-row="workout"><div><b>{next.name}</b><span>{first ? `${first.name} ${first.kg} × ${first.reps}${first.change ? ` (${first.change})` : ""}` : `${next.exercises.length} exercises`}{next.cardio ? ` · then ${next.cardio}` : ""}</span></div>
          <button type="button" className="pill-btn" onClick={() => { act.startWorkout(next.name); location.hash = "#workout"; }}>Start</button></div>}
      </div>}
    </section>
  );
}
