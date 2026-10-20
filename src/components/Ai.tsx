/**
 * The in-app AI on screen: the chat (#ai), the morning read and quick questions on Today,
 * supplement look-ups in the stack, experiments on Insights, and its card in Settings.
 * Calls: lib/ai/client.ts → Worker /api/ai. Contract and checks: lib/ai/tasks.ts.
 */

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { act, getState, newId, useStore, type Experiment } from "../lib/store";
import { askAi, chatContext, contextNow, nightContext, refreshAiStatus, useAiStatus } from "../lib/ai/client";
import { runChatTool, type ChartSpec } from "../lib/ai/chattools";
import { bandNow, onNights } from "../lib/band-client";
import { ChatChart } from "./ChatChart";
import { Proposals } from "./Proposal";
import type { Proposal } from "../lib/ai/propose";
import { CHAT_ROUNDS, MODELS, estimateMonthUsd, timeless, type ChatTurn, type DigestItem, type ModelChoice, type Question, type Tier } from "../lib/ai/tasks";
import { judge } from "../lib/ai/apply";
import { dailyFacts } from "../lib/insights";
import { addDays, atMinute, clock, dayLabel, localDay } from "../lib/time";
import type { Supplement } from "../lib/types";
import { InboxCard } from "./Inbox";
import { ReviewCard } from "./Review";
import { dueReviews, monthFacts, monthLines, weekFacts, weekLines, type Due } from "../lib/review";
import { Md } from "./Md";
import { digestDue, freshRead, nightIn } from "../lib/ai/morning";
import { dayWindow, eveningOf, nightDue } from "../lib/ai/nightread";
import { byDay, foldLine } from "../lib/ai/thread";

const usd = (x: number) => (x < 0.1 ? `$${x.toFixed(3)}` : `$${x.toFixed(2)}`);
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
const clockOf = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const TASK_WORDS: Record<string, string> = { describe: "food", questions: "questions", chat: "chat", digest: "morning read", night: "night read", supplement: "supplement", review: "week / month read" };

/* ------------------------------------------------------------------ background: morning read + questions */

/** Tried this session already (a failed call isn't retried in a loop). */
const tried = new Set<string>();

async function makeDigest(day: string) {
  const key = `digest:${day}`;
  if (tried.has(key)) return;
  tried.add(key);
  const ai = getState().ai;
  const r = await askAi({ task: "digest", context: contextNow(), shown: ai.shown.slice(-40) });
  if (!r.ok) return;
  const n = r.answer.news, at = Date.now();
  act.setAi((a) => ({
    digest: { day, at, greeting: r.answer.greeting, items: r.answer.items },
    shown: [...a.shown, ...r.answer.items.map((i) => i.title), ...(n ? [n.title] : [])].slice(-80),
    // something new is a message (owner, 16 Oct: "only send message when it has a new finding, a new sttudy"); the rest is on Today
    ...(n && !a.chat.some((m) => m.unprompted && m.text.startsWith(`📰 **${n.title}**`)) ? { chat: [...a.chat, { role: "assistant" as const, text: `📰 **${n.title}**\n\n${n.text}`, at, unprompted: true, source: n.source }].slice(-80) } : {}),
  }));
}

/** Anything logged in that day's evening-to-04:00 window (#107: a beer at 00:40 is that evening's). */
const loggedOn = (day: string) => { const [from, to] = dayWindow(day); return getState().entries.some((e) => e.at >= from && e.at < to); };

async function makeNight(day: string, force = false) {
  const key = `night:${day}:${force ? Date.now() : ""}`;
  if (tried.has(key)) return;
  tried.add(key);
  const r = await askAi({ task: "night", day, context: nightContext(day) });
  if (!r.ok) return;
  const at = Date.now();
  act.setAi((a) => ({
    night: { ...r.answer, day, at },
    // What it learned that lasts: into memory (shown in Settings → AI, deletable), no duplicates.
    memory: [...a.memory, ...r.answer.remember.filter((x) => !a.memory.some((m) => m.text.toLowerCase() === x.toLowerCase())).map((x) => ({ id: newId(), text: x, at }))].slice(-60),
  }));
}

/**
 * The week and month reads (PLAN 65): the app measures, the AI writes it up; both are kept so the card draws the app's
 * numbers. Lasting patterns go to memory like the night read's.
 */
async function makeReview(d: Due) {
  const key = `review:${d.kind}:${d.key}`;
  if (tried.has(key)) return;
  tried.add(key);
  const s = getState();
  const f = d.kind === "week" ? weekFacts(s.entries, s.workouts, s.settings, s.goals, d.from, d.to) : monthFacts(s.entries, s.workouts, s.settings, s.goals, d.from, d.to);
  // a week or month with nothing in it gets no read (a new account, time away)
  if (!f.rows.some((x) => x.value != null) && !f.training.sessions) return;
  const lines = "cols" in f ? monthLines(f) : weekLines(f), cols = "cols" in f ? f.cols : undefined;
  const r = await askAi({ task: "review", kind: d.kind, from: d.from, to: d.to, context: `${contextNow()}\n${lines.join("\n")}` });
  if (!r.ok) return;
  const at = Date.now();
  act.setAi((a) => ({
    reviews: [...(a.reviews ?? []).filter((x) => !(x.kind === d.kind && x.key === d.key)), { ...d, ...r.answer, at, rows: f.rows, ...(cols ? { cols } : {}) }].slice(-12),
    memory: [...a.memory, ...r.answer.remember.filter((x) => !a.memory.some((m) => m.text.toLowerCase() === x.toLowerCase())).map((x) => ({ id: newId(), text: x, at }))].slice(-60),
  }));
}

async function makeQuestions(day: string) {
  const key = `questions:${day}`;
  if (tried.has(key)) return;
  tried.add(key);
  const ai = getState().ai;
  const stopped = new Set(ai.stopped ?? []);
  const r = await askAi({ task: "questions", context: contextNow(), asked: [...ai.asked.slice(-30), ...ai.daily.map((q) => q.text), ...[...stopped].map((k) => `(never ask again) ${k}`)] });
  if (!r.ok) return;
  // one you said to stop asking never comes back, even if the AI writes it again
  const list = r.answer.questions.filter((q) => !stopped.has(q.key)).map((q) => ({ ...q, id: `${day}:${q.key}` }));
  act.setAi((a) => ({
    questions: { day, list },
    asked: [...a.asked, ...list.map((q) => q.text)].slice(-60),
    daily: [...a.daily.filter(timeless), ...list.filter((q) => q.repeat === "daily" && !a.daily.some((d) => d.key === q.key))].slice(-5),
  }));
}


/**
 * Runs in the app shell. The morning read is written in the morning once last night is in (lib/ai/morning; owner,
 * 16 Oct: "looks like app does daily read based on yyesterdays data" — it was written the evening before). Questions
 * come once a day from 10:00.
 */
export function useAiAuto(userId: string | undefined) {
  const { on } = useAiStatus();
  useEffect(() => { if (userId) void refreshAiStatus(); }, [userId]);
  useEffect(() => {
    if (!on) return;
    const tick = () => {
      const now = new Date(), h = now.getHours(), today = localDay(now.getTime()), ai = getState().ai;
      const rated = getState().entries.some((e) => e.kind === "sleep" && e.rating != null && localDay(e.at) === today);
      const target = digestDue(now.getTime(), ai.digest, nightIn(bandNow()?.sleep, rated, now.getTime()));
      if (target) void makeDigest(target);
      if (h >= 10 && h < 22 && ai.questions?.day !== today) void makeQuestions(today);
      // The week just gone from Monday 06:00, the month just gone from the 1st (PLAN 65).
      for (const d of dueReviews(now.getTime(), (ai.reviews ?? []).map((r) => `${r.kind}:${r.key}`))) void makeReview(d);
      // Your day, read back: tonight from 21:00 (past midnight still tonight, until 04:00); or the next morning if the app
      // wasn't opened that evening (lib/ai/nightread).
      const back = nightDue(now.getTime(), ai.night?.day, loggedOn);
      if (back) void makeNight(back);
    };
    tick();
    const t = setInterval(tick, 10 * 60_000);
    // the band's nights arrive a few seconds after the app opens: look again then, not 10 minutes later
    const off = onNights(tick);
    const vis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); off(); document.removeEventListener("visibilitychange", vis); };
  }, [on]);
}

/** Unread unprompted messages, for the tab dot: the AI's, and the app's still waiting for you (PLAN 102). */
export function useAiUnread() {
  const ai = useStore((s) => s.ai);
  return ai.chat.filter((m) => m.unprompted && m.at > ai.seenAt).length + (ai.inbox ?? []).filter((n) => n.at > ai.seenAt && !n.reply && !n.closed).length + (ai.reviews ?? []).filter((r) => r.at > ai.seenAt).length;
}

/* ------------------------------------------------------------------ Today: the morning read */

/** Not opened yet since it was (re)written: highlighted on Today (16 Oct). */
const unseen = (x: { at?: number; seen?: number }) => !x.seen || (x.at != null && x.seen < x.at);

const KIND: Record<DigestItem["type"], string> = { fact: "Fun fact", study: "New study", pattern: "Your data", protocol: "Try this" };

export function startExperiment(p: NonNullable<DigestItem["protocol"]>) {
  const x: Experiment = { id: newId(), name: p.name, how: p.how, days: p.days, measure: p.measure, start: localDay(Date.now()) };
  act.setAi((a) => ({ experiments: [...a.experiments, x] }));
}

/**
 * Today's morning read (owner, 15 Oct: "the morning read looks a bit too big on front page, its at least should be
 * collapsable, and also lets make it a tiny bit nicer"): folded to its greeting and what's inside — a line per item with
 * its kind — and each item opens on its own. Folded or open is kept for the day on this phone.
 */
export function MorningRead() {
  const d = useStore((s) => s.ai.digest);
  const experiments = useStore((s) => s.ai.experiments);
  const running = experiments.filter((x) => !x.ended).map((x) => x.name);
  const today = localDay(Date.now());
  // folded every time Today opens; highlighted until you've opened it once (owner, 16 Oct: "collapsed at default … a
  // subtle highlight … when it wasnt opened … after opening its just sits tehre collapsed not highlighted")
  const [open, setOpenState] = useState(false);
  const [row, setRow] = useState<number | null>(null);
  // only a read written that morning: one written the evening before talks about the wrong night (16 Oct)
  if (!d || d.day > today || d.day < addDays(today, -1) || !freshRead(d)) return null;
  const fresh = unseen(d);
  const setOpen = (v: boolean) => { setOpenState(v); if (v && fresh) act.setAi((a) => ({ digest: a.digest ? { ...a.digest, seen: Date.now() } : a.digest })); };
  return (
    <section className={`card morning${open ? " open" : ""}`} aria-label="Morning read" data-new={fresh || undefined}>
      <button type="button" className="mr-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="k">Morning read</span><span className="when">{d.day === today ? "today" : "yesterday"}{d.at != null && <> · <time>{clock(d.at)}</time></>}</span>{fresh && <span className="rd-new">new</span>}
        {!open && <span className="mr-dots" aria-hidden="true">{d.items.map((i, k) => <i key={k} className={`mr-${i.type}`} />)}</span>}
        <span className="chev" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      <p className="greet">{d.greeting}</p>
      {!open && <button type="button" className="linkish mr-more" onClick={() => setOpen(true)}>{d.items.length} thing{d.items.length === 1 ? "" : "s"} to read — {d.items.map((i) => i.title).slice(0, 2).join(" · ")}{d.items.length > 2 ? " …" : ""}</button>}
      {open && <ul className="mr-list">{d.items.map((i, k) => (
        <li key={k} className={`mr mr-${i.type}`} data-open={row === k || undefined}>
          <button type="button" className="mr-row" aria-expanded={row === k} onClick={() => setRow(row === k ? null : k)}>
            <span className="mr-kind">{KIND[i.type]}</span><b>{i.title}</b><span className="chev" aria-hidden="true">{row === k ? "▴" : "▾"}</span>
          </button>
          {row === k && <div className="mr-body">
            <p>{i.text}</p>
            {i.source && <a href={i.source.url} target="_blank" rel="noreferrer">{i.source.title} ↗</a>}
            {i.protocol && (running.includes(i.protocol.name)
              ? <p className="note">Running — see Insights → Experiments.</p>
              : <button type="button" className="pill-btn pri" onClick={() => startExperiment(i.protocol!)}>Try it for {i.protocol.days} days</button>)}
          </div>}
        </li>
      ))}</ul>}
    </section>
  );
}

/* ------------------------------------------------------------------ Today: your day, read back */

/**
 * The nightly read-back (owner, 2 Oct): what happened, how your own notes read, and one or two small
 * things to try tomorrow. Shown from when it's written until noon the next day.
 */
export function NightRead() {
  const n = useStore((s) => s.ai.night);
  const entries = useStore((s) => s.entries);
  // folded every time Today opens, highlighted until opened (owner, 16 Oct: "the your day, read back cannot be made
  // collapsed and i read it first time, now its just sitting there taking up space")
  const [open, setOpenState] = useState(false);
  const now = Date.now(), today = localDay(now), tonight = n ? eveningOf(now) === n.day : false;
  if (!n || !(n.day === today || (n.day === addDays(today, -1) && new Date(now).getHours() < 12))) return null;
  // still that evening (to 04:00): logged more since → read it again; at 00:40 it's still "tonight" (#107)
  const newer = tonight && entries.some((e) => e.at > n.at && e.at >= dayWindow(n.day)[0] && e.at < dayWindow(n.day)[1]);
  const fresh = unseen(n);
  const setOpen = (v: boolean) => { setOpenState(v); if (v && fresh) act.setAi((a) => ({ night: a.night ? { ...a.night, seen: Date.now() } : a.night })); };
  return (
    <section className={`card night${open ? " open" : ""}`} aria-label="Your day, read back" data-new={fresh || undefined}>
      <button type="button" className="mr-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="k">Your day, read back</span><span className="when">{tonight ? "tonight" : "last night"} · <time>{clock(n.at)}</time></span>{fresh && <span className="rd-new">new</span>}
        <span className="chev" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      <p className={`greet${open ? "" : " clamp2"}`} onClick={() => !open && setOpen(true)}>{n.summary}</p>
      {open && <>
        {n.happened.length > 0 && <ul className="night-list">{n.happened.map((h, i) => <li key={i}>{h}</li>)}</ul>}
        {n.notes && <p className="night-notes"><small>Your notes</small>{n.notes}</p>}
        {n.change.length > 0 && <div className="night-change"><small>Tomorrow, maybe</small>{n.change.map((c, i) => <p key={i}><b>{c.what}</b> {c.why}</p>)}</div>}
      </>}
      {newer && <button type="button" className="linkish" onClick={() => void makeNight(n.day, true)}>You logged more since — read it again</button>}
    </section>
  );
}

/* ------------------------------------------------------------------ Today: quick questions */

export function AiQuestions() {
  const ai = useStore((s) => s.ai);
  const entries = useStore((s) => s.entries);
  const today = localDay(Date.now());
  const answeredToday = useMemo(() => new Set(entries.filter((e) => e.kind === "answer" && localDay(e.at) === today).map((e) => (e.kind === "answer" ? e.key : ""))), [entries, today]);
  const fresh = ai.questions?.day === today ? ai.questions.list : [];
  const stopped = new Set(ai.stopped ?? []), skipped = new Set(ai.skipped?.day === today ? ai.skipped.keys : []);
  // a daily question kept from before 20 Oct with a day's numbers in it ("Stress is at 6 this morning") isn't asked again
  const list: Question[] = [...fresh, ...ai.daily.filter(timeless).filter((d) => !fresh.some((q) => q.key === d.key))].filter((q) => !answeredToday.has(q.key) && !stopped.has(q.key) && !skipped.has(q.key));
  const [q] = list;
  // owner, 15 Oct: "for questions make sure i can write custom reply"
  const [own, setOwn] = useState("");
  if (!q) return null;
  const answer = (a: string) => { if (a.trim()) act.addEntry({ kind: "answer", at: Date.now(), key: q.key, question: q.text, answer: a.trim() }); setOwn(""); };
  return (
    <section className="card question" aria-label="Quick question">
      <h3>Quick question <span>{list.length > 1 ? `1 of ${list.length}` : "one tap"}</span></h3>
      <p className="q">{q.text}</p>
      <div className="chips">{q.options.map((o) => <button key={o} type="button" className="pill-btn" onClick={() => answer(o)}>{o}</button>)}</div>
      <div className="row-add q-own">
        <input value={own} placeholder="or in your own words…" aria-label="Your answer, in your own words" onChange={(e) => setOwn(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") answer(own); }} />
        <button type="button" className="pill-btn" disabled={!own.trim()} onClick={() => answer(own)}>Send</button>
      </div>
      <small className="why">Why: {q.why}{q.repeat === "daily" ? " · asked daily" : ""}</small>
      <div className="q-acts">
        {/* skip: gone for today, no answer saved; a daily one comes back tomorrow */}
        <button type="button" className="linkish" onClick={() => act.setAi((a) => ({ skipped: { day: today, keys: [...(a.skipped?.day === today ? a.skipped.keys : []), q.key] } }))}>Skip</button>
        {/* stop: gone now and for good — the AI is told never to ask it again */}
        {q.repeat === "daily" && <button type="button" className="linkish" onClick={() => act.setAi((a) => ({ daily: a.daily.filter((d) => d.key !== q.key), stopped: [...new Set([...(a.stopped ?? []), q.key])].slice(-60) }))}>Stop asking this</button>}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ the chat (#ai) */

/** When the AI wrote (owner, 16 Oct: "Should add a time stamp for ai sendning messages"): the time today, else yesterday or the day. */
export const stampOf = (at: number, now: number) => {
  const d = localDay(at), today = localDay(now);
  return d === today ? clock(at) : d === addDays(today, -1) ? `yesterday ${clock(at)}` : `${dayLabel(at)} ${clock(at)}`;
};
/** What each tool looked at, for the line under a reply. */
const LOOKED: Record<string, string> = { day: "day", series: "numbers over time", find: "log", show_chart: "numbers over time", compare: "days with and without", nights: "nights", sessions: "training" };
/** "log, numbers over time" — what the reply's tools looked at; remembering and proposing aren't looking (empty: no line). */
const lookedAt = (tools?: string[]) => [...new Set((tools ?? []).filter((t) => t !== "remember" && t !== "propose").map((t) => LOOKED[t] ?? t))].join(", ");
const STARTERS = ["Why am I flat in the afternoon?", "Recommend a supplement or protocol to try", "What's worth logging more of?", "Explain my latest pattern"];

export function AiScreen() {
  const ai = useStore((s) => s.ai);
  const { on, busy } = useAiStatus();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  const inbox = ai.inbox ?? [], reviews = ai.reviews ?? [], now = Date.now();
  useEffect(() => { act.setAi({ seenAt: Date.now() }); }, [ai.chat.length, inbox.length, reviews.length]);
  // opened from the badge: start at the first new message, not the bottom (later ones scroll to the end as they come)
  const [since] = useState(() => getState().ai.seenAt), landed = useRef(false);
  useEffect(() => {
    const first = landed.current ? null : document.querySelector(".chat [data-new]");
    landed.current = true;
    if (first) first.scrollIntoView({ block: "start" }); else end.current?.scrollIntoView({ block: "end" });
  }, [ai.chat.length, inbox.length, reviews.length, busy]);
  // one thread: the AI's messages and yours, the app's (PLAN 102) and the week reads (PLAN 65), by time
  const thread = [...ai.chat.map((m, i) => ({ at: m.at, key: `c${i}`, m })), ...inbox.map((n) => ({ at: n.at, key: n.id, n })), ...reviews.map((r) => ({ at: r.at, key: `r${r.kind}${r.key}`, r }))].sort((a, b) => a.at - b.at);

  const send = async (t: string) => {
    const msg = t.trim();
    if (!msg) return;
    setText(""); setErr(null);
    act.setAi((a) => ({ chat: [...a.chat, { role: "user" as const, text: msg, at: Date.now() }].slice(-80) }));
    // The API wants the conversation to start with you: earlier AI-first messages ride along as context.
    const hist = getState().ai.chat.slice(-20);
    const first = hist.findIndex((m) => m.role === "user");
    const messages = hist.slice(first).map((m) => ({ role: m.role, text: m.text }));
    // built once: every tool round of this message sends it byte for byte (it's cached, and the AI's thinking is tied to it)
    const context = `${chatContext()}${first > 0 ? `\n\n## Your earlier messages to me\n${hist.slice(0, first).map((m) => m.text).join("\n")}` : ""}`;
    // The AI may ask the app for exact data (PLAN 67): run its calls here, send the results back, until it answers.
    let turn: ChatTurn[] = [];
    const charts: ChartSpec[] = [], looked: string[] = [], learned: string[] = [], proposals: Proposal[] = [];
    for (let round = 0; ; round++) {
      const r = await askAi({ task: "chat", messages, context, ...(turn.length ? { turn } : {}), ...(round >= CHAT_ROUNDS ? { final: true } : {}) });
      if (!r.ok) { setErr(r.message); return; }
      if (!r.answer.calls?.length || round >= CHAT_ROUNDS) {
        const at = Date.now();
        act.setAi((a) => ({
          chat: [...a.chat, { role: "assistant" as const, text: r.answer.reply, at, ...(charts.length ? { charts: charts.slice(0, 2) } : {}), ...(looked.length ? { looked } : {}), ...(proposals.length ? { proposals } : {}) }].slice(-80),
          memory: [...a.memory, ...learned.filter((x) => !a.memory.some((m) => m.text.toLowerCase() === x.toLowerCase())).map((x) => ({ id: newId(), text: x, at }))].slice(-40),
        }));
        return;
      }
      const data = { state: getState(), band: bandNow(), now: Date.now() };
      const results = r.answer.calls.map((c) => {
        const out = runChatTool(c, data);
        if (out.chart) charts.push(out.chart);
        // the same change twice in one reply is one card
        if (out.proposal) { if (proposals.some((p) => p.label === out.proposal!.label)) return { type: "tool_result", tool_use_id: c.id, content: "Already proposed in this reply." }; proposals.push(out.proposal); }
        if (out.remember) learned.push(out.remember);
        looked.push(c.name);
        return { type: "tool_result", tool_use_id: c.id, content: out.text, ...(out.error ? { is_error: true } : {}) };
      });
      // every result in one message, after the AI's turns exactly as they came
      turn = [...turn, ...(r.answer.turn ?? []), { role: "user", content: results }];
    }
  };

  const byApp = (y: (typeof thread)[number]) => "n" in y || "r" in y || !!y.m?.unprompted;
  const render = (x: (typeof thread)[number], i: number) => {
            const isNew = x.at > since && byApp(x) && !thread.slice(0, i).some((y) => y.at > since && byApp(y));
        if ("r" in x) return <ReviewCard key={x.key} r={x.r!} first={isNew} />;
        return "n" in x ? <InboxCard key={x.key} n={x.n!} now={now} first={isNew} /> : (
          <div key={x.key} className={`msg ${x.m!.role}${x.m!.unprompted ? " first" : ""}`} data-new={isNew || undefined}>
            {x.m!.role === "assistant" ? <Md text={x.m!.text} /> : x.m!.text}
            {x.m!.charts?.map((c, k) => <ChatChart key={k} c={c} />)}
            {x.m!.source && /^https:\/\//.test(x.m!.source.url) && <a className="msg-src" href={x.m!.source.url} target="_blank" rel="noopener noreferrer">{x.m!.source.title} ↗</a>}
            {x.m!.proposals?.length ? <Proposals at={x.m!.at} list={x.m!.proposals} now={now} onAdded={(s) => { if (on) void researchSupplement(s); }} /> : null}
            {lookedAt(x.m!.looked) && <small className="looked">looked at your {lookedAt(x.m!.looked)}</small>}
            {x.m!.role === "assistant" && <time className="ts" dateTime={new Date(x.m!.at).toISOString()}>{stampOf(x.m!.at, now)}</time>}
          </div>
        );
      
  };
  // old days fold to one line each (owner, 16 Oct: "chats should be deleted? or like collapsed"): today, anything unseen
  // and the last 6 hours stay open (lib/ai/thread)
  const index = new Map(thread.map((x, i) => [x.key, i]));
  const days = byDay(thread, now, (x) => x.at > since && byApp(x));
  const said = (x: (typeof thread)[number]) => ("m" in x && x.m ? { mine: x.m.role === "user", text: x.m.text } : { mine: false, text: "n" in x && x.n ? x.n.title : "r" in x && x.r ? x.r.title : "" });
  return (
    <div className="calm ai-screen">
      <div className="head"><span>Your AI</span><a href="#settings">Settings</a></div>
      <div className="chat" aria-live="polite">
        {thread.length === 0 && <p className="note">Ask me anything about your data — I see your numbers, patterns, stack and About me. The morning read and your day read back are on Today — ask me about them here. I only write here myself with something new: a heart-rate stretch the app can't explain, a new finding to comment on, your week and month.</p>}
        {days.map((g) => (g.open ? <Fragment key={g.day}>{g.items.map((x) => render(x, index.get(x.key)!))}</Fragment> : (
          <details key={g.day} className="day-fold">
            <summary><b>{dayLabel(atMinute(g.day, 720))}</b> · {g.items.length} message{g.items.length > 1 ? "s" : ""}{foldLine(g.items.map(said)) && <span> · {foldLine(g.items.map(said))}</span>}</summary>
            {g.items.map((x) => render(x, index.get(x.key)!))}
          </details>
        )))}
        {busy > 0 && <div className="msg assistant typing">…</div>}
        {err && <p className="err">{err}</p>}
        <div ref={end} />
      </div>
      {on === false && <AiOff />}
      <div className="chips starters">{STARTERS.map((s) => <button key={s} type="button" className="pill-btn" disabled={!on || busy > 0} onClick={() => void send(s)}>{s}</button>)}</div>
      <div className="row-add chatbox">
        <input value={text} placeholder="Ask…" aria-label="Message the AI" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void send(text); }} />
        <button type="button" className="pill-btn pri" disabled={!text.trim() || !on || busy > 0} onClick={() => void send(text)}>Send</button>
      </div>
      {ai.memory.length > 0 && <p className="note">I remember {ai.memory.length} thing{ai.memory.length > 1 ? "s" : ""} about you — see or delete them in <a href="#settings">Settings → AI</a>.</p>}
    </div>
  );
}

function AiOff() {
  return (
    <div className="card">
      <h3>The AI is off <span>needs your Anthropic key</span></h3>
      <ol className="steps">
        <li>Get a key at console.anthropic.com → API keys (add a few dollars of credit).</li>
        <li>Cloudflare → Workers &amp; Pages → healthos → Settings → Variables and secrets → Add → type <b>Secret</b>, name <code>ANTHROPIC_API_KEY</code>, paste the key → Deploy.</li>
        <li>Reopen the app. Don't paste the key in a chat.</li>
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ stack: what the AI found about a supplement */

export async function researchSupplement(s: Supplement) {
  const key = `supp:${s.id}:${s.name}`;
  if (tried.has(key) || !s.name.trim()) return;
  tried.add(key);
  const r = await askAi({ task: "supplement", name: s.name.trim(), dose: s.dose, context: contextNow() });
  if (r.ok) act.setAi((a) => ({ research: { ...a.research, [s.id]: { ...r.answer, at: Date.now(), asked: s.name.trim() } } }));
  else tried.delete(key);
  return r;
}

export function SuppResearch({ s }: { s: Supplement }) {
  const found = useStore((st) => st.ai.research[s.id]);
  const { on, busy } = useAiStatus();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!found) return on ? <button type="button" className="linkish" disabled={busy > 0} onClick={async () => { const r = await researchSupplement(s); if (r && !r.ok) setErr(r.message); }}>{busy > 0 ? "Looking it up…" : "AI: what is it?"}{err && <small className="err"> {err}</small>}</button> : null;
  const flagged = found.interactions.filter((i) => i.verdict !== "none");
  return (
    <div className="research">
      <button type="button" className="linkish" onClick={() => setOpen(!open)} aria-expanded={open}>AI: {found.what} · evidence {found.evidence}{flagged.length ? ` · ${flagged.length} note${flagged.length > 1 ? "s" : ""}` : ""} {open ? "▴" : "▾"}</button>
      {open && <div className="rbody">
        <p><b>Usual dose</b> {found.usualDose} · <b>Timing</b> {found.timing}</p>
        {found.uses.length > 0 && <p><b>Used for</b> {found.uses.join(", ")}</p>}
        {found.cautions.length > 0 && <ul className="notes">{found.cautions.map((c) => <li key={c}>{c}</li>)}</ul>}
        {flagged.map((i) => <p key={i.with} className={`v-${i.verdict}`}><span className={`vchip v-${i.verdict}`}>{i.verdict}</span> <b>with {i.with}</b> — {i.say}</p>)}
        <small>AI-researched {new Date(found.at).toLocaleDateString()} · to verify · {found.sources.map((x, k) => <a key={x.url} href={x.url} target="_blank" rel="noreferrer">{k ? ", " : ""}{x.title}</a>)}</small>
      </div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Insights: experiments */

const STATE_TEXT = { running: "running", "too-few": "not enough ratings to tell", better: "better", worse: "worse", "no-clear-change": "no clear change" } as const;

export function Experiments() {
  const xs = useStore((s) => s.ai.experiments);
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), settings = useStore((s) => s.settings);
  const today = localDay(Date.now());
  const days = useMemo(() => dailyFacts(entries, workouts, settings, addDays(today, -120), addDays(today, -1)), [entries, workouts, settings, today]);
  if (!xs.length) return null;
  return (
    <section className="p w12" id="experiments">
      <h2>Experiments <span>protocols you chose to try · the 14 days before vs the days since, weekends accounted for</span></h2>
      <div className="list">{xs.map((x) => {
        const v = judge(x, days, today);
        return (
          <div key={x.id} className="li exp">
            <span><b>{x.name}</b><small>{x.how}</small>
              <small>Day {Math.min(v.daysIn, x.days)} of {x.days} · {x.measure}: {v.before != null ? v.before.toFixed(1) : "–"} before → {v.during != null ? v.during.toFixed(1) : "–"} since ({v.n[0]} + {v.n[1]} rated days) · <b>{STATE_TEXT[v.state]}</b>{v.ci ? ` (${v.diff! >= 0 ? "+" : ""}${v.diff!.toFixed(1)}, 95% ${v.ci[0].toFixed(1)} to ${v.ci[1].toFixed(1)})` : ""}</small></span>
            {!x.ended ? <button type="button" className="pill-btn" onClick={() => act.setAi((a) => ({ experiments: a.experiments.map((y) => (y.id === x.id ? { ...y, ended: today } : y)) }))}>End</button>
              : <button type="button" className="pill-btn" onClick={() => act.setAi((a) => ({ experiments: a.experiments.filter((y) => y.id !== x.id) }))}>Remove</button>}
          </div>
        );
      })}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ Settings */

export function AiSettings() {
  const ai = useStore((s) => s.ai);
  const { on, usage, cap, budget } = useAiStatus();
  const [seeing, setSeeing] = useState(false);
  useEffect(() => { void refreshAiStatus(); }, []);
  const recent = usage?.recent ?? [];
  const est = estimateMonthUsd(ai.models, recent);
  const now = new Date(), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projected = usage ? (usage.monthUsd / now.getDate()) * dim : null;
  const pick = (tier: Tier, m: ModelChoice) => act.setAi((a) => ({ models: { ...a.models, [tier]: m } }));
  const option = (tier: Tier) => (Object.keys(MODELS) as ModelChoice[]).map((m) => {
    const e = estimateMonthUsd({ ...ai.models, [tier]: m }, recent)[tier];
    return <option key={m} value={m}>{MODELS[m].label} · ≈ {usd(e)}/month</option>;
  });
  return (
    <div className="card" id="ai">
      <h3>AI <span>{on == null ? "checking…" : on ? "on" : "off — add the key"}</span></h3>
      {on === false && <AiOff />}
      {usage && <p className="usage">Today <b>{usage.calls} of {cap}</b> calls · {usd(usage.dayUsd)} · this month <b>{usd(usage.monthUsd)} of {usd(budget)}</b>{projected != null && now.getDate() > 2 ? ` · on track for ≈ ${usd(projected)}` : ""}</p>}
      {usage && usage.monthUsd >= budget && <p className="note">This month's {usd(budget)} is used: everything runs on {MODELS.haiku.label} until the 1st.</p>}
      {/* owner, 15 Oct: "for harder or more important request can leave a better model but for food or simple everyday things can add a cheaper one" */}
      <label className="field">Food, photos and quick questions<select value={ai.models.light} onChange={(e) => pick("light", e.target.value as ModelChoice)}>{option("light")}</select></label>
      <label className="field">Chat (your questions about your data)<select value={ai.models.everyday} onChange={(e) => pick("everyday", e.target.value as ModelChoice)}>{option("everyday")}</select></label>
      <label className="field">Research (morning and nightly reads, supplement look-ups — with web search)<select value={ai.models.research} onChange={(e) => pick("research", e.target.value as ModelChoice)}>{option("research")}</select></label>
      <p className="note">Estimate for a month with these: ≈ {usd(est.total)} — {est.measured ? `from your last ${est.measured} call${est.measured > 1 ? "s" : ""}` : "a first guess until you've used it"}. Past {usd(budget)} in a month everything drops to {MODELS.haiku.label} until the 1st; hard stop at {cap} calls a day.</p>
      {recent.length > 0 && <details className="ai-calls"><summary>Last calls — what each cost</summary>
        <ul>{[...recent].reverse().slice(0, 12).map((c) => <li key={c.at}><span>{clockOf(c.at)} · {TASK_WORDS[c.task]} · {MODELS[c.model].label.replace("Claude ", "")}</span><span>{k(c.in + c.cached + c.written)} in{c.cached ? ` (${k(c.cached)} cached)` : ""} · {k(c.out)} out{c.searches ? ` · ${c.searches} search${c.searches > 1 ? "es" : ""}` : ""}</span><b>{usd(c.usd)}</b></li>)}</ul>
        <p className="note">"In" is mostly your data summary, sent with chats, questions and the reads — your words are a few tokens of it. "Out" includes the model's thinking.</p>
      </details>}
      {ai.chat.length > 0 && <>
        <h3>The chat <span>old days fold on their own</span></h3>
        {/* owner, 16 Oct: "chats should be deleted? or like collapsed or whatever" */}
        <button type="button" className="pill-btn" onClick={() => { if (confirm(`Clear the chat — all ${ai.chat.length} messages? What the AI remembers about you stays, and so do the app's findings.`)) act.setAi({ chat: [] }); }}>Clear the chat ({ai.chat.length} messages)</button>
      </>}
      <h3>What the AI knows about me <span>it adds lines as you chat · delete any</span></h3>
      {ai.memory.length === 0 ? <p className="note">Nothing yet.</p> : <div className="chips mem">{ai.memory.map((m) => <span className="chip" key={m.id}>{m.text}<button type="button" aria-label={`Forget ${m.text}`} onClick={() => act.setAi((a) => ({ memory: a.memory.filter((x) => x.id !== m.id) }))}>✕</button></span>)}</div>}
      <button type="button" className="linkish" onClick={() => setSeeing(!seeing)}>{seeing ? "Hide" : "What the AI sees about me"}</button>
      {seeing && <><pre className="ctx">{contextNow()}</pre><p className="note">That's what the reads get. Chat gets the top of it (a week of days, no nights or journal) and looks the rest up when you ask.</p></>}
    </div>
  );
}
