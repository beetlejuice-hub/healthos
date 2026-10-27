/**
 * The in-app AI on screen: the chat (#ai), the morning read and quick questions on Today,
 * supplement look-ups in the stack, experiments on Insights, and its card in Settings.
 * Calls: lib/ai/client.ts → Worker /api/ai. Contract and checks: lib/ai/tasks.ts.
 */

import { withBand } from "../lib/daysband";
import { SourceLink } from "./SourceLink";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { act, getState, newId, useStore, type Experiment } from "../lib/store";
import { askAi, askRead, bandForRead, chatContext, contextNow, leadNow, nightContext, refreshAiStatus, useAiStatus } from "../lib/ai/client";
import { leadLines, withLead } from "../lib/ai/lead";
import { askChat } from "../lib/ai/chat";
import { bandNow, bandSettled, onBandSettled, onNights } from "../lib/band-client";
import { ChatChart } from "./ChatChart";
import { GoalsAsk } from "./GoalsAsk";
import { eveningBrief, morningBrief } from "../lib/ai/brief";
import { checkupLines } from "../lib/ai/checkup";
import { checkList, mergeChecks } from "../lib/overall";
import { notice } from "../lib/findings";
import { scout } from "../lib/scout";
import { currentKg } from "../lib/body";
import { Proposals } from "./Proposal";
import { MODELS, estimateMonthUsd, type ModelChoice, type Question, type Tier } from "../lib/ai/tasks";
import { askLines, KIND_LABEL, questionKinds, tracking, type Tracked } from "../lib/ai/asking";
import { savedFollowups } from "../lib/ai/saved";
import { SavedCard } from "./Saved";
import { DeepDive } from "./DeepDive";
import { Looked } from "./Looked";
import { NightPending, ReadPending } from "./ReadPending";
import { DIVE, diveBrief, diveDue } from "../lib/ai/dive";
import { RESULT_WORDS, verdictLines, verdictsDue } from "../lib/ai/experiment";
import { judge } from "../lib/ai/apply";
import { dailyFacts } from "../lib/insights";
import { addDays, atMinute, clock, dayLabel, localDay, stamp } from "../lib/time";
import type { Supplement } from "../lib/types";
import { InboxCard } from "./Inbox";
import { ReviewCard } from "./Review";
import { dueReviews, monthFacts, monthLines, weekFacts, weekLines, type Due } from "../lib/review";
import { Md } from "./Md";
import { ReadItems } from "./ReadItems";
import { digestDue, freshRead, morningShown, nightIn, nightShown } from "../lib/ai/morning";
import { attempt, onRetryDue, tryNow } from "../lib/ai/attempts";
import { dayWindow, eveningOf, nightDue } from "../lib/ai/nightread";
import { byDay, foldLine } from "../lib/ai/thread";

const usd = (x: number) => (x < 0.1 ? `$${x.toFixed(3)}` : `$${x.toFixed(2)}`);
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
const clockOf = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const TASK_WORDS: Record<string, string> = { describe: "food", questions: "questions", chat: "chat", digest: "morning read", night: "night read", supplement: "supplement", review: "week / month read", dive: "deep dive", verdict: "experiment verdict" };

/* ------------------------------------------------------------------ background: morning read + questions */

/** Tried this session already (a supplement look-up: a failed one is tried again on a tap). */
const tried = new Set<string>();

/** A failed background call, kept for Settings → AI (22 Oct: the morning read didn't come, and nothing said why). */
const keepFail = (task: string) => (r: { error: string; message: string }) =>
  act.setAi((a) => ({ failed: [...(a.failed ?? []), { at: Date.now(), task, error: r.error, message: r.message }].slice(-10) }));

/**
 * The morning read — one at a time with the other research calls, the first in line; a failed one is tried again
 * (lib/ai/attempts). `now`: "Try again" (a tap — it goes now, the waits forgotten).
 */
export const makeDigest = (day: string, now = false) =>
  now ? tryNow(`digest:${day}`, () => writeDigest(day), keepFail("digest")) : attempt(`digest:${day}`, () => writeDigest(day), { lane: "read", onFail: keepFail("digest") });

async function writeDigest(day: string) {
  const ai = getState().ai;
  // written already (another tick, or another device's synced read)
  if (ai.digest?.day === day && freshRead(ai.digest)) return null;
  // this morning's angle and kind of new thing, in turn (PLAN 132–133)
  // …and the band's night check or VO2 max when they have something to say (PLAN 52)
  // the app's strongest tested link not featured lately leads (PLAN 176; owner, 27 Oct: "more likely for graphs and connections")
  const st = getState(), lead = leadNow(st), brief = morningBrief(day, st.templates, st.workouts, Date.now(), bandForRead(st), !!lead);
  // what yesterday's reads suggested, for a follow-up question (PLAN 156)
  const follow = [
    ...(ai.digest && ai.digest.day < day && ai.digest.day >= addDays(day, -2) ? ai.digest.items.filter((i) => i.type === "try" || i.type === "protocol").map((i) => `${ai.digest!.day} morning read: ${i.title}${i.tip ? ` — "${i.tip}"` : ""}`) : []),
    ...(ai.night && ai.night.day >= addDays(day, -1) ? ai.night.change.map((c) => `${ai.night!.day} read-back: ${c.what}`) : []),
  ];
  // it may check its claims with the app's own numbers first (PLAN 160)
  const r = await askRead({ task: "digest", context: `${contextNow()}\n${brief.join("\n")}\n${lead ? `${leadLines(lead).join("\n")}\n` : ""}${askFor(day, "morning", follow).join("\n")}`, shown: ai.shown.slice(-40) });
  if (!r.ok) return r;
  const n = r.answer.news, at = Date.now(), items = withLead(r.answer.items, lead), led = lead && items.some((i) => i.lead);
  const qs = keepNew(r.answer.questions ?? [], `${day}:m`);
  act.setAi((a) => ({
    digest: { day, at, greeting: r.answer.greeting, items, ...(r.answer.looked ? { looked: r.answer.looked } : {}) },
    ...(led ? { leads: [...(a.leads ?? []), { id: lead.id, day }].slice(-60) } : {}),
    ...(qs.length ? { questions: { day, list: qs, from: "morning" as const, at }, asked: [...a.asked, ...qs.map((q) => q.text)].slice(-60), daily: tracked(a.daily, qs) } : {}),
    shown: [...a.shown, ...r.answer.items.map((i) => i.title), ...(n ? [n.title] : [])].slice(-80),
    // something new is a message (owner, 16 Oct: "only send message when it has a new finding, a new sttudy"); the rest is on Today
    ...(n && !a.chat.some((m) => m.unprompted && m.text.startsWith(`📰 **${n.title}**`)) ? { chat: [...a.chat, { role: "assistant" as const, text: `📰 **${n.title}**\n\n${n.text}`, at, unprompted: true, source: n.source }].slice(-80) } : {}),
  }));
  return r;
}

/**
 * The weekly deep dive (PLAN 160; owner: "3: ai" — the AI picks the topic): one question from your data, researched, with
 * your own numbers from the app's look-ups. `skip`: "pick another" — the topics to leave this time.
 */
export async function makeDive(key: string, skip: string[] = []): Promise<string | null> {
  // "pick another" is a tap: it goes now, not behind the others
  const r = await attempt(`dive:${key}:${skip.length}`, async () => {
    const ai = getState().ai;
    if (!skip.length && ai.dive?.key === key) return null;
    const r = await askRead({ task: "dive", context: `${contextNow()}\n${diveBrief(ai.dives ?? [], skip).join("\n")}` });
    if (!r.ok) return r;
    const at = Date.now(), { looked, ...answer } = r.answer;
    act.setAi((a) => ({
      dive: { ...answer, key, at, ...(looked ? { looked } : {}), repicks: skip.length, ...(skip.length ? { skipped: skip } : {}) },
      dives: [...(a.dives ?? []), { key, topic: answer.topic }].slice(-DIVE.keep),
    }));
    return r;
  }, { queued: !skip.length, onFail: keepFail("dive") });
  return r?.message ?? null;
}

/**
 * An experiment's verdict (PLAN 160; owner: "do … 4"): the app's result, the AI's words on it with what studies say, and
 * what to do next — on the experiment, and as a message in the AI tab so you see it.
 */
const makeVerdict = (x: Experiment, v: Parameters<typeof verdictLines>[1]) => attempt(`verdict:${x.id}`, async () => {
  if (getState().ai.experiments.find((y) => y.id === x.id)?.verdict) return null;
  const r = await askAi({ task: "verdict", context: `${chatContext()}\n${verdictLines(x, v).join("\n")}` });
  if (!r.ok) return r;
  const at = Date.now(), verdict = { at, state: v.state, ...r.answer };
  act.setAi((a) => ({
    experiments: a.experiments.map((y) => (y.id === x.id ? { ...y, verdict } : y)),
    chat: [...a.chat, { role: "assistant" as const, text: `🧪 **${x.name}** — ${RESULT_WORDS[v.state]}.\n\n${r.answer.text}${r.answer.next ? `\n\n**Next:** ${r.answer.next}` : ""}`, at, unprompted: true }].slice(-80),
  }));
  return r;
}, { onFail: keepFail("verdict") });

/** Anything logged in that day's evening-to-04:00 window (#107: a beer at 00:40 is that evening's). */
const loggedOn = (day: string) => { const [from, to] = dayWindow(day); return getState().entries.some((e) => e.at >= from && e.at < to); };

/** `force`: "read it again" (a tap — it goes now); `now`: "Try again" after it failed (the waits forgotten). */
export const makeNight = (day: string, force = false, now = false) => now ? tryNow(`night:${day}:`, () => writeNight(day, false), keepFail("night"))
  : attempt(`night:${day}:${force ? Date.now() : ""}`, () => writeNight(day, force), { queued: !force, lane: "read", onFail: keepFail("night") });

async function writeNight(day: string, force: boolean) {
  // its three and its questions (PLAN 156–157): tonight's "try" kind, the question kinds, what this morning suggested
  const ai = getState().ai;
  if (!force && ai.night?.day === day) return null;
  const follow = ai.digest && ai.digest.day === day ? ai.digest.items.filter((i) => i.type === "try" || i.type === "protocol").map((i) => `this morning's read: ${i.title}${i.tip ? ` — "${i.tip}"` : ""}`) : [];
  const r = await askRead({ task: "night", day, context: [nightContext(day), ...eveningBrief(ai.shown), ...askFor(day, "evening", follow)].join("\n") });
  if (!r.ok) return r;
  const at = Date.now(), qs = keepNew(r.answer.questions ?? [], `${day}:e`);
  act.setAi((a) => ({
    night: { ...r.answer, day, at },
    shown: [...a.shown, ...(r.answer.items ?? []).map((i) => i.title)].slice(-80),
    ...(qs.length ? { questions: { day, list: qs, from: "evening" as const, at }, asked: [...a.asked, ...qs.map((q) => q.text)].slice(-60), daily: tracked(a.daily, qs) } : {}),
    // What it learned that lasts: into memory (shown in Settings → AI, deletable), no duplicates.
    memory: [...a.memory, ...r.answer.remember.filter((x) => !a.memory.some((m) => m.text.toLowerCase() === x.toLowerCase())).map((x) => ({ id: newId(), text: x, at }))].slice(-60),
  }));
  return r;
}

/**
 * The week and month reads (PLAN 65): the app measures, the AI writes it up; both are kept so the card draws the app's
 * numbers. Lasting patterns go to memory like the night read's.
 */
const makeReview = (d: Due) => attempt(`review:${d.kind}:${d.key}`, () => writeReview(d), { onFail: keepFail("review") });

async function writeReview(d: Due) {
  const s = getState();
  if ((s.ai.reviews ?? []).some((x) => x.kind === d.kind && x.key === d.key)) return null;
  const f = d.kind === "week" ? weekFacts(s.entries, s.workouts, s.settings, s.goals, d.from, d.to) : monthFacts(s.entries, s.workouts, s.settings, s.goals, d.from, d.to);
  // a week or month with nothing in it gets no read (a new account, time away)
  if (!f.rows.some((x) => x.value != null) && !f.training.sessions) return null;
  const lines = "cols" in f ? monthLines(f) : weekLines(f), cols = "cols" in f ? f.cols : undefined;
  // the overall check rides the month read (PLAN 137): the findings on show, with their evidence, by id
  const now = Date.now(), today = localDay(now);
  const found = d.kind === "month" ? notice(s.entries, s.goals, now, currentKg(s.entries, s.settings.bodyKg, now), { workouts: s.workouts, supplements: s.supplements, settings: s.settings }).found.filter((x) => !(s.ai.checks ?? []).some((c) => c.id === `n:${x.id}` && c.hidden)) : [];
  const pats = d.kind === "month" ? scout(withBand(dailyFacts(s.entries, s.workouts, s.settings, addDays(today, -90), addDays(today, -1)), bandNow(), today), s.supplements, (id) => !!s.scout[id]?.dismissed) : [];
  const list = checkList(found, pats), offered = new Map([...found.map((x): [string, string] => [`n:${x.id}`, x.title]), ...pats.map((p): [string, string] => [`s:${p.id}`, p.text])]);
  const check = list.length ? `\n## Findings on show — the overall check (name the ones that look like noise or plain sense, by [id])\n${list.join("\n")}` : "";
  const r = await askAi({ task: "review", kind: d.kind, from: d.from, to: d.to, context: `${contextNow()}\n${lines.join("\n")}${check}` });
  if (!r.ok) return r;
  const at = Date.now();
  act.setAi((a) => ({
    ...(d.kind === "month" ? { checks: mergeChecks(a.checks ?? [], r.answer.checks, offered, at) } : {}),
    reviews: [...(a.reviews ?? []).filter((x) => !(x.kind === d.kind && x.key === d.key)), { ...d, ...r.answer, at, rows: f.rows, ...(cols ? { cols } : {}) }].slice(-12),
    memory: [...a.memory, ...r.answer.remember.filter((x) => !a.memory.some((m) => m.text.toLowerCase() === x.toLowerCase())).map((x) => ({ id: newId(), text: x, at }))].slice(-60),
  }));
  return r;
}

/**
 * What a read is told about its questions (PLAN 156): the kinds the app picked in turn, the check-up when it's due
 * (PLAN 135), what's tracked and when each was last answered, what to follow up, and what was asked before.
 */
function askFor(day: string, when: "morning" | "evening", suggested: string[]): string[] {
  const st = getState(), now = Date.now();
  const follow = [...suggested, ...savedFollowups(st.ai.saved, now)];
  const check = checkupLines(st.entries, bandNow(), now);
  const kinds = questionKinds(day, when, { checkup: check.length > 0, followup: follow.length > 0 });
  return [...(kinds.includes("checkup") ? check : []),
    ...askLines(kinds, tracking(st.ai.daily, st.entries, now), kinds.includes("followup") ? follow : [], [...st.ai.asked, ...(st.ai.stopped ?? []).map((k) => `(never ask again) ${k}`)], (t) => dayLabel(t))];
}

/** One you said to stop asking never comes back, and never the same words twice — even if the AI writes them again. */
function keepNew(qs: Question[], prefix: string): Question[] {
  const { stopped = [], asked } = getState().ai, said = new Set(asked.map((t) => t.toLowerCase()));
  return qs.filter((q) => !stopped.includes(q.key) && !said.has(q.text.toLowerCase())).map((q) => ({ ...q, id: `${prefix}:${q.key}` }));
}

/** What's tracked: a tracking question's key, its latest words (only for reference — it's re-worded every time). */
const tracked = (prev: Tracked[], qs: Question[]): Question[] =>
  [...(prev as Question[]).filter((d) => !qs.some((q) => q.kind === "tracking" && q.key === d.key)), ...qs.filter((q) => q.kind === "tracking")].slice(-8);

/** Questions when no read brought any today — a cheap call, after 13:00 (PLAN 156). */
/** In line behind a read that may bring questions of its own: asked only if none came. */
const makeQuestions = (day: string) => attempt(`questions:${day}`, async () => {
  if (getState().ai.questions?.day === day) return null;
  const r = await askAi({ task: "questions", context: [contextNow(), ...askFor(day, "morning", [])].join("\n"), asked: getState().ai.asked.slice(-30) });
  if (!r.ok) return r;
  const list = keepNew(r.answer.questions, `${day}:q`), at = Date.now();
  if (list.length) act.setAi((a) => ({ questions: { day, list, from: "fallback" as const, at }, asked: [...a.asked, ...list.map((q) => q.text)].slice(-60), daily: tracked(a.daily, list) }));
  return r;
  // behind the reads, in their line: one that brings questions makes this call unneeded
}, { lane: "read", onFail: keepFail("questions") });


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
      // not before the band's first load is done: a read written without it misses the heart rate (21 Oct)
      if (!bandSettled()) return;
      const now = new Date(), h = now.getHours(), today = localDay(now.getTime()), ai = getState().ai;
      const rated = getState().entries.some((e) => e.kind === "sleep" && e.rating != null && localDay(e.at) === today);
      const target = digestDue(now.getTime(), ai.digest, nightIn(bandNow()?.sleep, rated, now.getTime()));
      if (target) void makeDigest(target);
      // Your day, read back: tonight from 21:00 (past midnight still tonight, until 04:00); or the next morning if the app
      // wasn't opened that evening (lib/ai/nightread). Asked for second, in the reads' own line (22 Oct).
      const back = nightDue(now.getTime(), ai.night?.day, loggedOn);
      if (back) void makeNight(back);
      // the reads bring the questions; only a day without any gets them from the cheap call (PLAN 156)
      if (h >= 13 && h < 21 && ai.questions?.day !== today) void makeQuestions(today);
      // The week just gone from Monday 06:00, the month just gone from the 1st (PLAN 65).
      for (const d of dueReviews(now.getTime(), (ai.reviews ?? []).map((r) => `${r.kind}:${r.key}`))) void makeReview(d);
      // the weekly deep dive, from Sunday 09:00 (PLAN 160)
      const dive = diveDue(now.getTime(), ai.dive, getState().entries);
      if (dive) void makeDive(dive);
      // an experiment that ended gets its verdict (PLAN 160) — the 120 days of facts only when one might be due
      const st = getState();
      if (ai.experiments.some((x) => !x.verdict && addDays(x.start, x.days) <= (x.ended ?? today)))
        for (const d of verdictsDue(ai.experiments, dailyFacts(st.entries, st.workouts, st.settings, addDays(today, -120), addDays(today, -1)), today)) void makeVerdict(d.x, d.v);
    };
    tick();
    const t = setInterval(tick, 10 * 60_000);
    // the band's nights arrive a few seconds after the app opens: look again then, not 10 minutes later
    // …and when a failed call's wait is over (lib/ai/attempts)
    const off = onNights(tick), offSettled = onBandSettled(tick), offRetry = onRetryDue(tick);
    const vis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); off(); offSettled(); offRetry(); document.removeEventListener("visibilitychange", vis); };
  }, [on]);
}

/** Unread unprompted messages, for the tab dot: the AI's, and the app's still waiting for you (PLAN 102). */
export function useAiUnread() {
  const ai = useStore((s) => s.ai);
  return (ai.dive && !ai.dive.seen ? 1 : 0) + ai.chat.filter((m) => m.unprompted && m.at > ai.seenAt).length + (ai.inbox ?? []).filter((n) => n.at > ai.seenAt && !n.reply && !n.closed).length + (ai.reviews ?? []).filter((r) => r.at > ai.seenAt).length;
}

/* ------------------------------------------------------------------ Today: the morning read */

/** Not opened yet since it was (re)written: highlighted on Today (16 Oct). */
const unseen = (x: { at?: number; seen?: number }) => !x.seen || (x.at != null && x.seen < x.at);


/**
 * Today's morning read (owner, 15 Oct: "the morning read looks a bit too big on front page, its at least should be
 * collapsable, and also lets make it a tiny bit nicer"): folded to its greeting and its three titles, each with a small
 * chart of the number it's about (PLAN 150; owner, 21 Oct: "too long, too much info w no visual and just boring. I like
 * that its adding tips and advices"). Each item opens on its own: two sentences, what to do today, the 14 days drawn
 * from his own data, the source.
 */
export function MorningRead() {
  const d = useStore((s) => s.ai.digest), night = useStore((s) => s.ai.night);
  const today = localDay(Date.now());
  // folded every time Today opens; highlighted until you've opened it once (owner, 16 Oct: "collapsed at default … a
  // subtle highlight … when it wasnt opened … after opening its just sits tehre collapsed not highlighted")
  const [open, setOpenState] = useState(false);
  // only a read written that morning (16 Oct), and only until the evening read replaces it — never the next morning
  // (owner, 21 Oct: "if i get them at yesterday morning, it should not be there"; lib/ai/morning morningShown)
  // not on Today: where it is — being written, didn't come (why, Try again), or waiting for last night (22 Oct)
  if (!d || !morningShown(d, night, Date.now())) return <ReadPending onRetry={(day) => void makeDigest(day, true)} />;
  const fresh = unseen(d);
  const setOpen = (v: boolean) => { setOpenState(v); if (v && fresh) act.setAi((a) => ({ digest: a.digest ? { ...a.digest, seen: Date.now() } : a.digest })); };
  return (
    <section className={`card morning${open ? " open" : ""}`} aria-label="Morning read" data-new={fresh || undefined}>
      <button type="button" className="mr-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="k">Morning read</span><span className="when">{d.day === today ? "today" : "yesterday"}{d.at != null && <> · <time>{clock(d.at)}</time></>}</span>{fresh && <span className="rd-new">new</span>}
        <span className="chev" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      <p className="greet">{d.greeting}</p>
      <ReadItems key={String(open)} items={d.items} open={open} onOpen={() => setOpen(true)} tip="Today" from="morning" day={d.day} />
      {open && <Looked names={d.looked} />}
    </section>
  );
}

/* ------------------------------------------------------------------ Today: your day, read back */

/**
 * The nightly read-back (owner, 2 Oct): what happened, how your own notes read, and one or two small
 * things to try tomorrow. Shown from when it's written until noon the next day.
 */
export function NightRead() {
  const n = useStore((s) => s.ai.night), morning = useStore((s) => s.ai.digest);
  const entries = useStore((s) => s.entries);
  // folded every time Today opens, highlighted until opened (owner, 16 Oct: "the your day, read back cannot be made
  // collapsed and i read it first time, now its just sitting there taking up space")
  const [open, setOpenState] = useState(false);
  const now = Date.now(), tonight = n ? eveningOf(now) === n.day : false;
  // until the next morning read replaces it, and never past noon (PLAN 155; lib/ai/morning nightShown); not on Today:
  // being written, or didn't come and why (22 Oct)
  if (!n || !nightShown(n, morning, now)) return <NightPending onRetry={(day) => void makeNight(day, false, true)} />;
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
        {/* PLAN 129: on a workout day, the session against the last one — in the same call, no extra one */}
        {n.workout && <div className="night-workout"><small>Your workout</small><p>{n.workout.summary}</p>
          {n.workout.better.length > 0 && <ul>{n.workout.better.map((b, i) => <li key={i}>{b}</li>)}</ul>}
          {n.workout.next && <p><b>Next time</b> {n.workout.next}</p>}</div>}
        {n.change.length > 0 && <div className="night-change"><small>Tomorrow, maybe</small>{n.change.map((c, i) => <p key={i}><b>{c.what}</b> {c.why}</p>)}</div>}
      </>}
      {/* the evening's study, thing to try and noticed (PLAN 157; owner, 21 Oct: "the same studt, try, and notiiced session at Eod") */}
      {(n.items?.length ?? 0) > 0 && <ReadItems key={String(open)} items={n.items!} open={open} onOpen={() => setOpen(true)} tip="Tomorrow" from="evening" day={n.day} />}
      {open && <Looked names={n.looked} />}
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
  // a read's questions while that read is on Today; never one from a day before, never word for word again (PLAN 155–156)
  const q0 = ai.questions, now = Date.now();
  const live = !!q0 && (q0.from === "morning" ? ai.digest?.day === q0.day && morningShown(ai.digest, ai.night, now)
    : q0.from === "evening" ? ai.night?.day === q0.day && nightShown(ai.night, ai.digest, now) : q0.day === today);
  const stopped = new Set(ai.stopped ?? []), skipped = new Set(ai.skipped?.day === today ? ai.skipped.keys : []);
  const list: Question[] = (live ? q0!.list : []).filter((q) => !answeredToday.has(q.key) && !stopped.has(q.key) && !skipped.has(q.key));
  const [q] = list;
  return q ? <QuestionCard key={q.key} q={q} count={list.length} today={today} /> : null;
}

/** One question: pick one or more (owner, 20 Oct: "i should be able to choose multiple answers for a question"), or say it in your own words (15 Oct). */
function QuestionCard({ q, count, today }: { q: Question; count: number; today: string }) {
  const [own, setOwn] = useState(""), [picked, setPicked] = useState<string[]>([]);
  const toggle = (o: string) => setPicked((p) => (p.includes(o) ? p.filter((x) => x !== o) : [...p, o]));
  const all = [...q.options.filter((o) => picked.includes(o)), ...(own.trim() ? [own.trim()] : [])];
  const send = () => { if (all.length) act.addEntry({ kind: "answer", at: Date.now(), key: q.key, question: q.text, answer: all.join(", ") }); };
  return (
    <section className="card question" aria-label="Quick question">
      <h3>{q.kind ? KIND_LABEL[q.kind] : "Quick question"} <span>{count > 1 ? `1 of ${count}` : "pick one or more"}</span></h3>
      <p className="q">{q.text}</p>
      {q.source && <SourceLink className="q-src" s={q.source} />}
      <div className="chips">{q.options.map((o) => <button key={o} type="button" className="pill-btn" aria-pressed={picked.includes(o)} onClick={() => toggle(o)}>{o}</button>)}</div>
      <div className="row-add q-own">
        <input value={own} placeholder="or in your own words…" aria-label="Your answer, in your own words" onChange={(e) => setOwn(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
        <button type="button" className="pill-btn pri" disabled={!all.length} onClick={send}>Send{all.length > 1 ? ` ${all.length}` : ""}</button>
      </div>
      <small className="why">Why: {q.why}{q.kind === "tracking" ? " · comes back now and then, in new words" : ""}</small>
      <div className="q-acts">
        {/* skip: gone for today, no answer saved; a daily one comes back tomorrow */}
        <button type="button" className="linkish" onClick={() => act.setAi((a) => ({ skipped: { day: today, keys: [...(a.skipped?.day === today ? a.skipped.keys : []), q.key] } }))}>Skip</button>
        {/* stop: gone now and for good — the AI is told never to ask it again */}
        {(q.kind === "tracking" || q.repeat === "daily") && <button type="button" className="linkish" onClick={() => act.setAi((a) => ({ daily: a.daily.filter((d) => d.key !== q.key), stopped: [...new Set([...(a.stopped ?? []), q.key])].slice(-60) }))}>Stop asking this</button>}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ the chat (#ai) */

/** What each tool looked at, for the line under a reply. */
const LOOKED: Record<string, string> = { day: "day", series: "numbers over time", find: "log", show_chart: "numbers over time", compare: "days with and without", nights: "nights", sessions: "training" };
/** "log, numbers over time" — what the reply's tools looked at; remembering and proposing aren't looking (empty: no line). */
const lookedAt = (tools?: string[]) => [...new Set((tools ?? []).filter((t) => t !== "remember" && t !== "propose").map((t) => LOOKED[t] ?? t))].join(", ");
const STARTERS = ["Why am I flat in the afternoon?", "Recommend a supplement or protocol to try", "What's worth logging more of?", "Explain my latest pattern"];
/** With goals given (PLAN 131), the first starter asks for suggestions toward them. */
const FOR_GOALS: [string, string] = ["Suggestions for my goals", "Based on my goals, what are 3 concrete things to try this week? Tie each to a goal and to my own numbers."];

export function AiScreen() {
  const ai = useStore((s) => s.ai);
  const aims = useStore((s) => (s.profile.aims?.length ?? 0) > 0);
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
    const r = await askChat(msg);
    if (!r.ok) setErr(r.message);
  };

  const byApp = (y: (typeof thread)[number]) => "n" in y || "r" in y || !!y.m?.unprompted;
  const render = (x: (typeof thread)[number], i: number) => {
            const isNew = x.at > since && byApp(x) && !thread.slice(0, i).some((y) => y.at > since && byApp(y));
        if ("r" in x) return <ReviewCard key={x.key} r={x.r!} first={isNew} />;
        return "n" in x ? <InboxCard key={x.key} n={x.n!} now={now} first={isNew} /> : (
          <div key={x.key} className={`msg ${x.m!.role}${x.m!.unprompted ? " first" : ""}`} data-new={isNew || undefined}>
            {x.m!.role === "assistant" ? <Md text={x.m!.text} /> : x.m!.text}
            {x.m!.charts?.map((c, k) => <ChatChart key={k} c={c} />)}
            {x.m!.source && /^https:\/\//.test(x.m!.source.url) && <SourceLink className="msg-src" s={x.m!.source} />}
            {x.m!.proposals?.length ? <Proposals at={x.m!.at} list={x.m!.proposals} now={now} onAdded={(s) => { if (on) void researchSupplement(s); }} /> : null}
            {lookedAt(x.m!.looked) && <small className="looked">looked at your {lookedAt(x.m!.looked)}</small>}
            {x.m!.role === "assistant" && <time className="ts" dateTime={new Date(x.m!.at).toISOString()}>{stamp(x.m!.at, now)}</time>}
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
      <DeepDive onRepick={makeDive} />
      <SavedCard />
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
      <GoalsAsk />
      <div className="chips starters">{(aims ? [FOR_GOALS, ...STARTERS.map((s): [string, string] => [s, s])] : STARTERS.map((s): [string, string] => [s, s])).map(([label, msg]) => <button key={label} type="button" className="pill-btn" disabled={!on || busy > 0} onClick={() => void send(msg)}>{label}</button>)}</div>
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
        <small>AI-researched {new Date(found.at).toLocaleDateString()} · to verify · {found.sources.map((x, k) => <span key={x.url}>{k ? ", " : ""}<SourceLink s={x} arrow={false} /></span>)}</small>
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
              <small>Day {Math.min(v.daysIn, x.days)} of {x.days} · {x.measure}: {v.before != null ? v.before.toFixed(1) : "–"} before → {v.during != null ? v.during.toFixed(1) : "–"} since ({v.n[0]} + {v.n[1]} rated days) · <b>{x.ended && v.state === "running" ? "ended early — too few days to tell" : STATE_TEXT[v.state]}</b>{v.ci ? ` (${v.diff! >= 0 ? "+" : ""}${v.diff!.toFixed(1)}, 95% ${v.ci[0].toFixed(1)} to ${v.ci[1].toFixed(1)})` : ""}</small>
              {/* when it ended: the AI's words on the app's result, what next, the studies (PLAN 160) */}
              {x.verdict && <span className={`exp-v v-${x.verdict.state}`}><b className="exp-chip">{RESULT_WORDS[x.verdict.state]}</b> {x.verdict.text}
                {x.verdict.next && <span className="exp-next"><b>Next:</b> {x.verdict.next}</span>}
                {x.verdict.found.map((f) => <span key={f.source.url} className="exp-src"><SourceLink s={f.source} /></span>)}</span>}</span>
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
  const recent = usage?.recent ?? [], failed = (ai.failed ?? []).filter((f) => f.at > Date.now() - 3 * 86_400_000);
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
      <label className="field">Daily reads (morning, night and the week read — with web search)<select value={ai.models.reads} onChange={(e) => pick("reads", e.target.value as ModelChoice)}>{option("reads")}</select></label>
      <label className="field">Research (the weekly deep dive, experiment verdicts, supplement look-ups)<select value={ai.models.research} onChange={(e) => pick("research", e.target.value as ModelChoice)}>{option("research")}</select></label>
      <p className="note">Estimate for a month with these: ≈ {usd(est.total)} — {est.measured ? `from your last ${est.measured} call${est.measured > 1 ? "s" : ""}` : "a first guess until you've used it"}. Past {usd(budget)} in a month everything drops to {MODELS.haiku.label} until the 1st; hard stop at {cap} calls a day.</p>
      {(recent.length > 0 || failed.length > 0) && <details className="ai-calls"><summary>Last calls — what each cost{failed.length ? `, and ${failed.length} that failed` : ""}</summary>
        {/* the ones that failed in among them, with why (22 Oct: the morning read didn't come, and nothing said why) */}
        <ul>{[...recent.map((c) => ({ at: c.at, c, f: null })), ...failed.map((f) => ({ at: f.at, c: null, f }))].sort((x, y) => y.at - x.at).slice(0, 12).map(({ at, c, f }) => c
          ? <li key={`c${at}`}><span>{clockOf(c.at)} · {TASK_WORDS[c.task]} · {MODELS[c.model].label.replace("Claude ", "")}</span><span>{k(c.in + c.cached + c.written)} in{c.cached ? ` (${k(c.cached)} cached)` : ""} · {k(c.out)} out{c.searches ? ` · ${c.searches} search${c.searches > 1 ? "es" : ""}` : ""}</span><b>{usd(c.usd)}</b></li>
          : <li key={`f${at}`} className="ai-failed"><span>{clockOf(f!.at)} · {TASK_WORDS[f!.task] ?? f!.task} · failed</span><span>{f!.message}</span><b>–</b></li>)}</ul>
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
