/**
 * One chat message, from anywhere (PLAN 164; owner, 22 Oct: "small chat w ai button next to findings, studies, etc at
 * morning and night digest messages" · the Noticed box: "ai can understand everything and make changes/ sort things/
 * start ivestigating based on what i say"): the AI tab's send, taken out of it so a read's item and Today's Noticed box
 * talk to the same chat. Your message and its reply land in the chat thread; the reply comes back for showing in place.
 * `about`: what the message is about, added to the context (not shown in the thread).
 */

import { act, getState, newId } from "../store";
import { bandNow } from "../band-client";
import { askAi, chatContext } from "./client";
import { runChatTool, type ChartSpec } from "./chattools";
import { CHAT_ROUNDS, type ChatTurn } from "./tasks";
import type { Proposal } from "./propose";

export type ChatReply = { ok: true; at: number; reply: string; proposals: Proposal[]; charts: ChartSpec[]; looked: string[]; learned: string[] } | { ok: false; message: string };

export async function askChat(msg: string, about?: string): Promise<ChatReply> {
  act.setAi((a) => ({ chat: [...a.chat, { role: "user" as const, text: msg, at: Date.now() }].slice(-80) }));
  // The API wants the conversation to start with you: earlier AI-first messages ride along as context.
  const hist = getState().ai.chat.slice(-20);
  const first = hist.findIndex((m) => m.role === "user");
  const messages = hist.slice(first).map((m) => ({ role: m.role, text: m.text }));
  // built once: every tool round of this message sends it byte for byte (it's cached, and the AI's thinking is tied to it)
  const context = `${chatContext()}${first > 0 ? `\n\n## Your earlier messages to me\n${hist.slice(0, first).map((m) => m.text).join("\n")}` : ""}${about ? `\n\n${about}` : ""}`;
  // The AI may ask the app for exact data (PLAN 67): run its calls here, send the results back, until it answers.
  let turn: ChatTurn[] = [];
  const charts: ChartSpec[] = [], looked: string[] = [], learned: string[] = [], proposals: Proposal[] = [];
  for (let round = 0; ; round++) {
    const r = await askAi({ task: "chat", messages, context, ...(turn.length ? { turn } : {}), ...(round >= CHAT_ROUNDS ? { final: true } : {}) });
    if (!r.ok) return { ok: false, message: r.message };
    if (!r.answer.calls?.length || round >= CHAT_ROUNDS) {
      // an answer with no words (shouldn't happen — the server checks it) is said plainly, not a crash
      const at = Date.now(), reply = typeof r.answer.reply === "string" && r.answer.reply.trim() ? r.answer.reply : "Got it.";
      act.setAi((a) => ({
        chat: [...a.chat, { role: "assistant" as const, text: reply, at, ...(charts.length ? { charts: charts.slice(0, 2) } : {}), ...(looked.length ? { looked } : {}), ...(proposals.length ? { proposals } : {}) }].slice(-80),
        memory: [...a.memory, ...learned.filter((x) => !a.memory.some((m) => m.text.toLowerCase() === x.toLowerCase())).map((x) => ({ id: newId(), text: x, at }))].slice(-40),
      }));
      return { ok: true, at, reply, proposals, charts, looked, learned };
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
}

/** What a reply to a read's item is about: the item, and how to take a reply to it. */
export function aboutItem(i: { type: string; title: string; text: string; tip?: string; sure?: string; chain?: { step: string; sure: string }[]; source?: { title: string; url: string } }, from: "morning" | "evening", day: string): string {
  return [`## The ${from === "morning" ? "morning" : "evening"} read's item this message is about (${day})`,
    `- ${i.type}: "${i.title}" — ${i.text}${i.tip ? ` Tip: ${i.tip}` : ""}${i.sure ? ` (how sure: ${i.sure})` : ""}`,
    ...(i.chain ?? []).map((c) => `  - link: ${c.step} (${c.sure})`),
    ...(i.source ? [`- source: ${i.source.title} ${i.source.url}`] : []),
    "- If they say it's different for them (\"for me it's the opposite\"), take it seriously: check their data with a look-up and say what it shows; if it holds for them, remember it so the reads don't say it again. If they ask what food or supplement helps, search and answer with how sure the evidence is — and propose adding one only when they ask for it."].join("\n");
}

/**
 * What a line in Today's Noticed box is (owner, 22 Oct: "just face value, so i can input whatever, a finding, a new supp
 * that makes me feel good"): kept as a note, and the AI acts on it now.
 */
export const ABOUT_NOTICE = `## They just typed this in Today's "Noticed something?" box
It can be anything — a finding about themselves, a supplement or food that makes them feel good, a symptom, a habit, an idea. It's already kept as a note. Take it at face value and act on it now:
- a supplement or food they started, or one that makes them feel good → propose it (add_supplement to keep taking it, log_supplement for one taken just now);
- something they ate, drank, weigh or feel right now ("had 2 eggs", "3 beers last night", "energy is 3") → log_food, log_drink, log_weight or log_feel, one card each;
- something they want to try for a while → propose an experiment;
- a lasting fact about them → remember it;
- something to look into → check it now with a look-up when their data can say (compare, series, nights) and give the numbers, or say what the app will watch for;
- what something does to them ("creatine makes my muscles fuller", "I feel better after a walk", "better after gym", "creatine makes me nauseous sometimes") → search what studies and forums like Reddit say, then propose a watch (owner, 28 Oct: "make ai look out for these things … give me followup questions"): its evening question and 2–4 answers, 14 days, and 1–3 lines of what you found, each with how sure. Not when "## What I'm watching" already has it — say how it's going instead.
Reply in 1–3 short sentences: what you understood, and what you did or propose. Never a diagnosis; a health worry → worth asking a doctor.`;
