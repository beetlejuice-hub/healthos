/**
 * The in-app AI on screen: the chat (#ai), the morning read and quick questions on Today,
 * supplement look-ups in the stack, experiments on Insights, and its card in Settings.
 * Calls: lib/ai/client.ts → Worker /api/ai. Contract and checks: lib/ai/tasks.ts.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { act, getState, newId, useStore, type Experiment } from "../lib/store";
import { askAi, contextNow, nightContext, refreshAiStatus, useAiStatus } from "../lib/ai/client";
import { MODELS, estimateMonthUsd, type DigestItem, type ModelChoice, type Question } from "../lib/ai/tasks";
import { judge } from "../lib/ai/apply";
import { dailyFacts } from "../lib/insights";
import { addDays, localDay } from "../lib/time";
import type { Supplement } from "../lib/types";

const usd = (x: number) => (x < 0.1 ? `$${x.toFixed(3)}` : `$${x.toFixed(2)}`);

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
  act.setAi((a) => ({ digest: { day, greeting: r.answer.greeting, items: r.answer.items }, shown: [...a.shown, ...r.answer.items.map((i) => i.title)].slice(-80) }));
}

/** From this hour the day is read back; it can be refreshed if you log more after. */
export const NIGHT_FROM_H = 21;
const loggedOn = (day: string) => getState().entries.some((e) => localDay(e.at) === day);

async function makeNight(day: string, force = false) {
  const key = `night:${day}:${force ? Date.now() : ""}`;
  if (tried.has(key)) return;
  tried.add(key);
  const r = await askAi({ task: "night", day, context: nightContext(day) });
  if (!r.ok) return;
  const at = Date.now();
  act.setAi((a) => ({
    night: { ...r.answer, day, at },
    chat: [...a.chat, { role: "assistant" as const, text: `🌙 ${r.answer.summary}${r.answer.change.length ? `\n\nTomorrow, maybe: ${r.answer.change.map((c) => c.what).join("; ")}.` : ""}`, at, unprompted: true }].slice(-80),
  }));
}

async function makeQuestions(day: string) {
  const key = `questions:${day}`;
  if (tried.has(key)) return;
  tried.add(key);
  const ai = getState().ai;
  const r = await askAi({ task: "questions", context: contextNow(), asked: [...ai.asked.slice(-30), ...ai.daily.map((q) => q.text)] });
  if (!r.ok) return;
  const list = r.answer.questions.map((q) => ({ ...q, id: `${day}:${q.key}` }));
  act.setAi((a) => ({
    questions: { day, list },
    asked: [...a.asked, ...list.map((q) => q.text)].slice(-60),
    daily: [...a.daily, ...list.filter((q) => q.repeat === "daily" && !a.daily.some((d) => d.key === q.key))].slice(-5),
  }));
}

/** The morning read lands in the chat as a message from the AI once its day has come. */
function postDigest() {
  const { ai } = getState(), d = ai.digest, today = localDay(Date.now());
  if (!d || d.day > today || ai.chat.some((m) => m.unprompted && m.text.startsWith(`☀️ ${d.greeting}`))) return;
  act.setAi((a) => ({ chat: [...a.chat, { role: "assistant" as const, text: `☀️ ${d.greeting}\n${d.items.map((i) => `• ${i.title}`).join("\n")}\n\nIt's on Today — ask me about any of it.`, at: Date.now(), unprompted: true }].slice(-80) }));
}

/**
 * Runs in the app shell. The morning read is written in the evening for the next day (owner: "at
 * quiet hours it should send me fun facts, news, patterns, protocols so in the morning I can
 * review"), or first thing in the morning if the app wasn't opened the evening before. Questions
 * come once a day from 10:00.
 */
export function useAiAuto(userId: string | undefined) {
  const { on } = useAiStatus();
  const digest = useStore((s) => s.ai.digest);
  useEffect(() => { postDigest(); }, [digest]);
  useEffect(() => { if (userId) void refreshAiStatus(); }, [userId]);
  useEffect(() => {
    if (!on) return;
    const tick = () => {
      const now = new Date(), h = now.getHours(), today = localDay(now.getTime()), ai = getState().ai;
      const target = h >= 20 ? addDays(today, 1) : h >= 5 ? today : null;
      if (target && ai.digest?.day !== target && !(target === today && ai.digest?.day === addDays(today, 1))) void makeDigest(target);
      if (h >= 10 && h < 22 && ai.questions?.day !== today) void makeQuestions(today);
      // Your day, read back: tonight from 21:00; or next morning if the app wasn't opened that evening.
      const yesterday = addDays(today, -1);
      if (h >= NIGHT_FROM_H && ai.night?.day !== today && loggedOn(today)) void makeNight(today);
      else if (h >= 5 && h < 12 && ai.night?.day !== yesterday && ai.night?.day !== today && loggedOn(yesterday)) void makeNight(yesterday);
      postDigest();
    };
    tick();
    const t = setInterval(tick, 10 * 60_000);
    const vis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [on]);
}

/** Unread unprompted messages, for the tab dot. */
export function useAiUnread() {
  const ai = useStore((s) => s.ai);
  return ai.chat.filter((m) => m.unprompted && m.at > ai.seenAt).length;
}

/* ------------------------------------------------------------------ Today: the morning read */

const KIND: Record<DigestItem["type"], string> = { fact: "Fun fact", study: "New study", pattern: "Your data", protocol: "Try this" };

export function startExperiment(p: NonNullable<DigestItem["protocol"]>) {
  const x: Experiment = { id: newId(), name: p.name, how: p.how, days: p.days, measure: p.measure, start: localDay(Date.now()) };
  act.setAi((a) => ({ experiments: [...a.experiments, x] }));
}

export function MorningRead() {
  const d = useStore((s) => s.ai.digest);
  const experiments = useStore((s) => s.ai.experiments);
  const running = experiments.filter((x) => !x.ended).map((x) => x.name);
  const today = localDay(Date.now());
  const [open, setOpen] = useState(false);
  if (!d || d.day > today || d.day < addDays(today, -1)) return null;
  const items = open ? d.items : d.items.slice(0, 2);
  return (
    <section className="card morning" aria-label="Morning read">
      <h3>Morning read <span>{d.day === today ? "written for today" : "from yesterday"}</span></h3>
      <p className="greet">{d.greeting}</p>
      {items.map((i, k) => (
        <article key={k} className={`mr mr-${i.type}`}>
          <small>{KIND[i.type]}</small>
          <b>{i.title}</b>
          <p>{i.text}</p>
          {i.source && <a href={i.source.url} target="_blank" rel="noreferrer">{i.source.title} ↗</a>}
          {i.protocol && (running.includes(i.protocol.name)
            ? <p className="note">Running — see Insights → Experiments.</p>
            : <button type="button" className="pill-btn pri" onClick={() => startExperiment(i.protocol!)}>Try it for {i.protocol.days} days</button>)}
        </article>
      ))}
      {d.items.length > 2 && <button type="button" className="linkish" onClick={() => setOpen(!open)}>{open ? "Less" : `${d.items.length - 2} more`}</button>}
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
  const now = Date.now(), today = localDay(now);
  if (!n || !(n.day === today || (n.day === addDays(today, -1) && new Date(now).getHours() < 12))) return null;
  const newer = n.day === today && entries.some((e) => localDay(e.at) === today && e.at > n.at);
  return (
    <section className="card night" aria-label="Your day, read back">
      <h3>Your day, read back <span>{n.day === today ? "tonight" : "last night"}</span></h3>
      <p className="greet">{n.summary}</p>
      {n.happened.length > 0 && <ul className="night-list">{n.happened.map((h, i) => <li key={i}>{h}</li>)}</ul>}
      {n.notes && <p className="night-notes"><small>Your notes</small>{n.notes}</p>}
      {n.change.length > 0 && <div className="night-change"><small>Tomorrow, maybe</small>{n.change.map((c, i) => <p key={i}><b>{c.what}</b> {c.why}</p>)}</div>}
      {newer && <button type="button" className="linkish" onClick={() => void makeNight(today, true)}>You logged more since — read it again</button>}
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
  const list: Question[] = [...fresh, ...ai.daily.filter((d) => !fresh.some((q) => q.key === d.key))].filter((q) => !answeredToday.has(q.key));
  const [q] = list;
  if (!q) return null;
  const answer = (a: string) => act.addEntry({ kind: "answer", at: Date.now(), key: q.key, question: q.text, answer: a });
  return (
    <section className="card question" aria-label="Quick question">
      <h3>Quick question <span>{list.length > 1 ? `1 of ${list.length}` : "one tap"}</span></h3>
      <p className="q">{q.text}</p>
      <div className="chips">{q.options.map((o) => <button key={o} type="button" className="pill-btn" onClick={() => answer(o)}>{o}</button>)}</div>
      <small className="why">Why: {q.why}{q.repeat === "daily" ? " · asked daily" : ""}</small>
      {q.repeat === "daily" && <button type="button" className="linkish" onClick={() => act.setAi((a) => ({ daily: a.daily.filter((d) => d.key !== q.key) }))}>Stop asking this</button>}
    </section>
  );
}

/* ------------------------------------------------------------------ the chat (#ai) */

const STARTERS = ["Why am I flat in the afternoon?", "Recommend a supplement or protocol to try", "What's worth logging more of?", "Explain my latest pattern"];

export function AiScreen() {
  const ai = useStore((s) => s.ai);
  const { on, busy } = useAiStatus();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  useEffect(() => { act.setAi({ seenAt: Date.now() }); }, [ai.chat.length]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [ai.chat.length, busy]);

  const send = async (t: string) => {
    const msg = t.trim();
    if (!msg) return;
    setText(""); setErr(null);
    act.setAi((a) => ({ chat: [...a.chat, { role: "user" as const, text: msg, at: Date.now() }].slice(-80) }));
    // The API wants the conversation to start with you: earlier AI-first messages ride along as context.
    const hist = getState().ai.chat.slice(-20);
    const first = hist.findIndex((m) => m.role === "user");
    const r = await askAi({ task: "chat", messages: hist.slice(first).map((m) => ({ role: m.role, text: m.text })), context: `${contextNow()}${first > 0 ? `\n\n## Your earlier messages to me\n${hist.slice(0, first).map((m) => m.text).join("\n")}` : ""}` });
    if (!r.ok) { setErr(r.message); return; }
    act.setAi((a) => ({
      chat: [...a.chat, { role: "assistant" as const, text: r.answer.reply, at: Date.now() }].slice(-80),
      memory: [...a.memory, ...r.answer.remember.filter((x) => !a.memory.some((m) => m.text.toLowerCase() === x.toLowerCase())).map((x) => ({ id: newId(), text: x, at: Date.now() }))].slice(-40),
    }));
  };

  return (
    <div className="calm ai-screen">
      <div className="head"><span>Your AI</span><a href="#settings">Settings</a></div>
      {on === false && <AiOff />}
      <div className="chat" aria-live="polite">
        {ai.chat.length === 0 && <p className="note">Ask me anything about your data — I see your numbers, patterns, stack and About me. I'll also write to you: a morning read, quick questions, and anything interesting I find.</p>}
        {ai.chat.map((m, i) => <div key={i} className={`msg ${m.role}${m.unprompted ? " first" : ""}`}>{m.text}</div>)}
        {busy > 0 && <div className="msg assistant typing">…</div>}
        {err && <p className="err">{err}</p>}
        <div ref={end} />
      </div>
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
  const { on, usage, cap } = useAiStatus();
  const [seeing, setSeeing] = useState(false);
  useEffect(() => { void refreshAiStatus(); }, []);
  const est = estimateMonthUsd(ai.models);
  const now = new Date(), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projected = usage ? (usage.monthUsd / now.getDate()) * dim : null;
  const pick = (tier: "everyday" | "research", m: ModelChoice) => act.setAi((a) => ({ models: { ...a.models, [tier]: m } }));
  const option = (tier: "everyday" | "research") => (Object.keys(MODELS) as ModelChoice[]).map((m) => {
    const e = estimateMonthUsd({ ...ai.models, [tier]: m })[tier];
    return <option key={m} value={m}>{MODELS[m].label} · ≈ {usd(e)}/month</option>;
  });
  return (
    <div className="card" id="ai">
      <h3>AI <span>{on == null ? "checking…" : on ? "on" : "off — add the key"}</span></h3>
      {on === false && <AiOff />}
      {usage && <p className="usage">Today <b>{usage.calls} of {cap}</b> calls · {usd(usage.dayUsd)} · this month {usd(usage.monthUsd)}{projected != null && now.getDate() > 2 ? ` · on track for ≈ ${usd(projected)}` : ""}</p>}
      <label className="field">Everyday (food, photos, chat, questions)<select value={ai.models.everyday} onChange={(e) => pick("everyday", e.target.value as ModelChoice)}>{option("everyday")}</select></label>
      <label className="field">Research (supplement look-ups, morning read with web search)<select value={ai.models.research} onChange={(e) => pick("research", e.target.value as ModelChoice)}>{option("research")}</select></label>
      <p className="note">Estimate for a typical month with these: ≈ {usd(est.total)}. Hard stop at {cap} calls a day.</p>
      <h3>What the AI knows about me <span>it adds lines as you chat · delete any</span></h3>
      {ai.memory.length === 0 ? <p className="note">Nothing yet.</p> : <div className="chips mem">{ai.memory.map((m) => <span className="chip" key={m.id}>{m.text}<button type="button" aria-label={`Forget ${m.text}`} onClick={() => act.setAi((a) => ({ memory: a.memory.filter((x) => x.id !== m.id) }))}>✕</button></span>)}</div>}
      <button type="button" className="linkish" onClick={() => setSeeing(!seeing)}>{seeing ? "Hide" : "What the AI sees about me"}</button>
      {seeing && <pre className="ctx">{contextNow()}</pre>}
    </div>
  );
}
